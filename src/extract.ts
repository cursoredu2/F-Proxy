/**
 * 订阅链接提取与去重
 */

import type { FofaTarget } from "./common";
import { logger } from "./common";

const SUBSCRIPTION_REGEX =
  /(https?:\/\/[^\s\"\'<>`]+\/api\/v1\/client\/subscribe\?token=[a-zA-Z0-9]+)/g;

export interface LinkItem {
  link: string;
  source: string;
}

interface PageResult {
  source: string;
  body: string;
  header: string;
  banner: string;
}

/**
 * 从页面内容中提取所有潜在的订阅链接并去重
 */
export function extractSubscriptionLinks(
  pageResults: PageResult[],
): LinkItem[] {
  logger.info(`正在从 ${pageResults.length} 个页面中提取订阅链接...`);

  const uniquePotentialLinks = new Map<string, string>();

  const findAndAddLinks = (content: string, source: string) => {
    if (!content) return;
    const matches = content.match(SUBSCRIPTION_REGEX);
    if (matches) {
      matches.forEach((link) => {
        if (!uniquePotentialLinks.has(link)) {
          uniquePotentialLinks.set(link, source);
        }
      });
    }
  };

  pageResults.forEach(({ source, body, header, banner }) => {
    findAndAddLinks(body, source);
    findAndAddLinks(header, source);
    findAndAddLinks(banner, source);
  });

  const result = Array.from(uniquePotentialLinks.entries()).map(
    ([link, source]) => ({ link, source }),
  );

  if (result.length > 0) {
    logger.info(`提取到 ${result.length} 个唯一的潜在链接`);
  }

  return result;
}

/**
 * 处理 subscription 服务主机，直接作为订阅链接
 */
export function processSubscriptionHosts(
  subscriptionTargets: FofaTarget[],
): LinkItem[] {
  logger.info(`正在处理 ${subscriptionTargets.length} 个订阅服务主机...`);

  const result = subscriptionTargets.map((target) => ({
    link: target.link,
    source: target.link,
  }));

  if (result.length > 0) {
    logger.info(`从直连主机生成了 ${result.length} 个订阅链接`);
  }

  return result;
}

/**
 * 去重链接，优先保留 HTTPS 版本
 */
export function deduplicateLinks(links: LinkItem[]): LinkItem[] {
  const uniqueLinksMap = new Map<string, LinkItem>();

  links.forEach((item) => {
    try {
      const url = new URL(item.link);
      const hostKey = url.hostname + url.pathname + url.search;

      const existing = uniqueLinksMap.get(hostKey);
      if (!existing) {
        uniqueLinksMap.set(hostKey, item);
      } else if (
        item.link.startsWith("https://") &&
        existing.link.startsWith("http://")
      ) {
        uniqueLinksMap.set(hostKey, item);
      }
    } catch {
      if (!uniqueLinksMap.has(item.link)) {
        uniqueLinksMap.set(item.link, item);
      }
    }
  });

  return Array.from(uniqueLinksMap.values());
}
