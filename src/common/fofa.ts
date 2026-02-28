import { FofaClient } from "fofa-sdk";
import type { FofaField } from "fofa-sdk";
import { FOFA_KEY, FOFA_SIZE } from "./config";
import { logger } from "./logger";

export const fofaClient = new FofaClient({
  key: FOFA_KEY!,
  timeout: 30000,
  retries: 3,
});

/**
 * Fofa 搜索目标的结构
 */
export interface FofaTarget {
  link: string;
  header?: string;
  banner?: string;
}

/**
 * 通用 Fofa 查询函数，使用 fofa-sdk
 */
export async function queryFofa(
  queryString: string,
  description: string,
  fields: FofaField[] = ["link", "header", "banner"],
): Promise<FofaTarget[]> {
  logger.info(`正在查询 FOFA (${description}): ${queryString}`);
  try {
    const response = await fofaClient.search(queryString, {
      fields,
      size: FOFA_SIZE,
    });

    if (!response.results || response.results.length === 0) {
      logger.warning("未找到任何结果");
      return [];
    }

    logger.success(`查询完成，找到 ${response.results.length} 个结果`);
    return response.results as unknown as FofaTarget[];
  } catch (error: any) {
    logger.error(`Fofa 查询失败: ${error.message}`);
    throw error;
  }
}

/**
 * 查询包含订阅链接的目标主机
 */
export function querySubscriptionTokenTargets(): Promise<FofaTarget[]> {
  const query = `"/api/v1/client/subscribe?token="`;
  return queryFofa(query, "subscription token search");
}

/**
 * 查询包含 subscription-userinfo 响应头的主机
 */
export function querySubscriptionHeaderTargets(): Promise<FofaTarget[]> {
  const query =
    'header="subscription-userinfo" || banner="subscription-userinfo"';
  return queryFofa(query, "subscription-userinfo headers", ["link"]);
}
