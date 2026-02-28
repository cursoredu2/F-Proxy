/**
 * 订阅信息解析、验证、格式化
 */

const UNITS = ["B", "KB", "MB", "GB", "TB", "PB", "EB", "ZB", "YB"];
const UNIT_POWERS = UNITS.map((_, i) => Math.pow(1024, i));

export interface SubscriptionUserinfo {
  upload: number;
  download: number;
  total: number;
  expire: number | null;
}

/**
 * 解析 subscription-userinfo 响应头
 */
export function parseSubscriptionUserinfo(
  headerValue: string | null,
): SubscriptionUserinfo | null {
  if (!headerValue) return null;

  const result: SubscriptionUserinfo = {
    upload: 0,
    download: 0,
    total: 0,
    expire: null,
  };
  const pairs = headerValue.split(";").map((pair) => pair.trim());

  for (const pair of pairs) {
    const [key, value] = pair.split("=").map((s) => s.trim());
    if (!value) continue;
    const numValue = parseInt(value, 10);

    if (key === "upload" && !isNaN(numValue)) result.upload = numValue;
    else if (key === "download" && !isNaN(numValue)) result.download = numValue;
    else if (key === "total" && !isNaN(numValue)) result.total = numValue;
    else if (key === "expire" && !isNaN(numValue)) result.expire = numValue;
  }

  return result;
}

/**
 * 计算已用流量
 */
export function calculateUsedTraffic(userinfo: SubscriptionUserinfo): number {
  return userinfo.upload + userinfo.download;
}

/**
 * 格式化流量字节数为可读字符串
 */
function formatBytes(bytes: number): string {
  if (typeof bytes !== "number" || bytes < 0) return "NaN";
  if (bytes < 1000) return `${Math.round(bytes)} B`;

  const exp = Math.min(Math.floor(Math.log2(bytes) / 10), UNITS.length - 1);
  const dat = bytes / (UNIT_POWERS[exp] || 1);
  const ret = dat >= 1000 ? dat.toFixed(0) : dat.toPrecision(3);
  return `${ret} ${UNITS[exp] || "B"}`;
}

/**
 * 格式化用量信息为可读字符串
 */
export function formatUsageInfo(userinfo: SubscriptionUserinfo): string {
  const used = calculateUsedTraffic(userinfo);
  const remaining = userinfo.total - used;
  let info = `${formatBytes(used)}/${formatBytes(userinfo.total)} (剩余: ${formatBytes(remaining)})`;

  if (userinfo.expire) {
    const expireDate = new Date(userinfo.expire * 1000);
    const now = new Date();

    if (expireDate.getTime() > now.getTime()) {
      const formattedDate = expireDate.toISOString().split("T")[0];
      info += ` (${formattedDate})`;
    } else {
      info += ` (已过期)`;
    }
  }

  return info;
}

/**
 * 验证订阅是否仍然有效（有流量且未过期）
 */
export function validateSubscription(userinfo: SubscriptionUserinfo): {
  valid: boolean;
  reason?: string;
} {
  const used = calculateUsedTraffic(userinfo);

  if (used >= userinfo.total) {
    return { valid: false, reason: "流量已用完" };
  }

  if (userinfo.expire) {
    const now = Math.floor(Date.now() / 1000);
    if (userinfo.expire <= now) {
      return { valid: false, reason: "已过期" };
    }
  }

  return { valid: true };
}
