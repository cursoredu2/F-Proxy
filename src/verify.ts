/**
 * 订阅链接验证
 */

import YAML from "yaml";
import { REQUEST_TIMEOUT, concurrentProcess, logger } from "./common";
import {
  parseSubscriptionUserinfo,
  validateSubscription,
  formatUsageInfo,
} from "./subscription";
import type { LinkItem } from "./extract";

export interface VerificationResult {
  link: string;
  source: string;
  status: "success" | "failed";
  usageInfo?: string;
  failReason?: string;
}

const CLASH_UA = "clash";

/**
 * 解析 YAML 内容并验证是否为有效的 Clash 配置
 */
function parseYamlContent(body: string): boolean {
  try {
    const parsed = YAML.parse(body);
    if (!parsed || typeof parsed !== "object") return false;
    if (!parsed["proxy-groups"] || !Array.isArray(parsed["proxy-groups"]))
      return false;
    if (parsed["proxy-groups"].length === 0) return false;
    return true;
  } catch {
    return false;
  }
}

/**
 * 并发验证订阅链接有效性
 */
export async function verifySubscriptionLinks(
  linksToVerify: LinkItem[],
): Promise<VerificationResult[]> {
  const results = await concurrentProcess<LinkItem, VerificationResult | null>(
    linksToVerify,
    `验证 ${linksToVerify.length} 个潜在链接`,
    async ({ link, source }) => {
      try {
        const res = await fetch(link, {
          signal: AbortSignal.timeout(REQUEST_TIMEOUT),
          tls: { rejectUnauthorized: false },
          redirect: "follow",
          headers: { "User-Agent": CLASH_UA },
        });

        if (!res.ok) {
          return {
            link,
            source,
            status: "failed",
            failReason: `HTTP ${res.status}`,
          };
        }

        const subscriptionUserinfo = res.headers.get("subscription-userinfo");
        if (!subscriptionUserinfo) {
          return {
            link,
            source,
            status: "failed",
            failReason: "缺少 subscription-userinfo 响应头",
          };
        }

        const userinfo = parseSubscriptionUserinfo(subscriptionUserinfo);
        if (!userinfo) {
          return {
            link,
            source,
            status: "failed",
            failReason: "subscription-userinfo 解析失败",
          };
        }

        const body = await res.text();
        if (!parseYamlContent(body)) {
          return { link, source, status: "failed", failReason: "非 YAML 内容" };
        }

        const validation = validateSubscription(userinfo);
        if (!validation.valid) {
          return {
            link,
            source,
            status: "failed",
            failReason: validation.reason,
          };
        }

        return {
          link,
          source,
          status: "success",
          usageInfo: formatUsageInfo(userinfo),
        };
      } catch (err: any) {
        return {
          link,
          source,
          status: "failed",
          failReason: `访问失败 (${err.message})`,
        };
      }
    },
    null,
  );

  logger.info("\n链接验证完成");
  return results.filter((r): r is VerificationResult => r !== null);
}
