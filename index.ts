import { exit } from "process";

import {
  validateConfig,
  REQUEST_TIMEOUT,
  querySubscriptionTokenTargets,
  querySubscriptionHeaderTargets,
  concurrentProcess,
  printBanner,
  logger,
} from "./src/common";
import type { FofaTarget } from "./src/common";
import {
  extractSubscriptionLinks,
  processSubscriptionHosts,
  deduplicateLinks,
} from "./src/extract";
import { verifySubscriptionLinks } from "./src/verify";
import { reportResults } from "./src/report";

// --- 配置验证 ---
validateConfig();

// --- 核心功能 ---

interface PageResult {
  source: string;
  body: string;
  header: string;
  banner: string;
}

/**
 * 并发访问主机以获取页面内容
 */
async function fetchPageContents(targets: FofaTarget[]): Promise<PageResult[]> {
  const results = await concurrentProcess<FofaTarget, PageResult | null>(
    targets,
    `获取 ${targets.length} 个目标的页面内容`,
    async (target) => {
      const res = await fetch(target.link, {
        signal: AbortSignal.timeout(REQUEST_TIMEOUT),
        tls: { rejectUnauthorized: false },
      });
      if (!res.ok) return null;
      const body = await res.text();
      return {
        source: target.link,
        body,
        header: target.header ?? "",
        banner: target.banner ?? "",
      };
    },
    null,
  );

  const validResults = results.filter((r): r is PageResult => r !== null);
  logger.info(`\n页面获取完成，找到 ${validResults.length} 个有效页面`);
  return validResults;
}

// --- 主函数 ---
async function main() {
  printBanner("F-Proxy");

  try {
    // 第1步: 并行查询 Fofa（使用 fofa-sdk）
    logger.step(1, 5, "Querying Fofa API (parallel)");
    logger.info("正在并行查询订阅链接和 subscription-userinfo 响应头...");

    const [fofaTargets, subscriptionTargets] = await Promise.all([
      querySubscriptionTokenTargets(),
      querySubscriptionHeaderTargets(),
    ]);

    logger.info(`找到 ${fofaTargets.length} 个包含订阅链接的目标`);
    logger.info(
      `找到 ${subscriptionTargets.length} 个包含 subscription-userinfo 的目标`,
    );

    if (fofaTargets.length === 0 && subscriptionTargets.length === 0) {
      logger.warning("Fofa API 未返回任何结果。");
      return;
    }
    logger.success("--- Step 1/5 Completed ---");

    // 第2步: 获取页面内容
    logger.step(2, 5, "Fetching page contents");
    const pageResults =
      fofaTargets.length > 0 ? await fetchPageContents(fofaTargets) : [];
    if (pageResults.length === 0 && subscriptionTargets.length === 0) {
      logger.warning("无法获取任何页面内容，也没有直连订阅主机。");
      return;
    }
    logger.success("--- Step 2/5 Completed ---");

    // 第3步: 提取并去重订阅链接
    logger.step(3, 5, "Extracting and deduplicating subscription links");
    const potentialLinksToVerify = extractSubscriptionLinks(pageResults);
    const subscriptionLinksToVerify =
      processSubscriptionHosts(subscriptionTargets);

    const combinedLinks = [
      ...potentialLinksToVerify,
      ...subscriptionLinksToVerify,
    ];
    const allLinksToVerify = deduplicateLinks(combinedLinks);
    const duplicateCount = combinedLinks.length - allLinksToVerify.length;

    if (allLinksToVerify.length === 0) {
      logger.info("----------------------------------------");
      logger.warning("未从任何来源找到潜在的订阅链接。");
      return;
    }

    logger.info(
      `去重前总链接数: ${combinedLinks.length} (${potentialLinksToVerify.length} 来自页面 + ${subscriptionLinksToVerify.length} 来自直连主机)`,
    );
    if (duplicateCount > 0) {
      logger.info(`已移除 ${duplicateCount} 个重复链接`);
    }
    logger.info(`最终待验证链接数: ${allLinksToVerify.length}`);
    logger.success("--- Step 3/5 Completed ---");

    // 第4步: 验证链接有效性
    logger.step(4, 5, "Verifying subscription links");
    const verificationResults = await verifySubscriptionLinks(allLinksToVerify);
    logger.success("--- Step 4/5 Completed ---");

    // 第5步: 报告结果
    logger.step(5, 5, "Reporting results");
    reportResults(verificationResults);
    logger.success("--- Step 5/5 Completed ---");
  } catch (error: any) {
    logger.error(`\n处理过程中发生严重错误: ${error.message}`);
    exit(1);
  }
}

main();
