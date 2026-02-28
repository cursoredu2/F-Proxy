/**
 * 结果报告
 */

import { logger } from "./common";
import type { VerificationResult } from "./verify";

/**
 * 输出验证结果
 */
export function reportResults(results: VerificationResult[]) {
  logger.info("正在输出结果...");

  const successfulLinks = results.filter((r) => r.status === "success");

  if (successfulLinks.length > 0) {
    logger.success(`\n[+] 发现 ${successfulLinks.length} 个有效的订阅链接:`);
    successfulLinks.forEach((r) => {
      console.log(`  - ${r.link} (来源: ${r.source})`);
      if (r.usageInfo) {
        logger.cyan(`    用量信息: ${r.usageInfo}`);
      }
    });
  }

  logger.info("----------------------------------------");
  if (successfulLinks.length === 0) {
    console.log("任务完成，未找到有效的订阅链接。");
  } else {
    console.log(`任务完成！找到 ${successfulLinks.length} 个有效的订阅链接。`);
  }
  logger.info("----------------------------------------");
}
