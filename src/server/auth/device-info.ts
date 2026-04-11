/**
 * 解析 User-Agent 字符串，提取设备信息
 *
 * 注意：这是一个简化版本的生产级解析。
 * 对于更全面的支持，可以考虑使用 ua-parser-js 等库。
 */

export type DeviceInfo = {
  userAgent: string;
  deviceType: "desktop" | "mobile" | "tablet" | "unknown";
  browser: string;
  os: string;
};

const mobileKeywords = [
  "android",
  "iphone",
  "ipod",
  "blackberry",
  "mobile",
  "windows phone",
];

const tabletKeywords = ["ipad", "tablet", "kindle"];

const browserPatterns: Array<[RegExp, string]> = [
  [/Edg\/[\d.]+/gi, "Edge"],
  [/Chrome\/[\d.]+/gi, "Chrome"],
  [/Safari\/[\d.]+/gi, "Safari"],
  [/Firefox\/[\d.]+/gi, "Firefox"],
  [/MSIE [\d.]+/gi, "IE"],
  [/Trident\/[\d.]+/gi, "IE"],
];

const osPatterns: Array<[RegExp, string]> = [
  [/Windows NT [\d.]+/gi, "Windows"],
  [/Mac OS X [\d._]+/gi, "macOS"],
  [/Android [\d.]+/gi, "Android"],
  [/iPhone OS [\d_]+/gi, "iOS"],
  [/iPad OS [\d_]+/gi, "iPadOS"],
  [/Linux/gi, "Linux"],
];

/**
 * 从 User-Agent 字符串中提取设备信息
 */
export function parseDeviceInfo(userAgent?: string): DeviceInfo {
  const ua = userAgent || "Unknown";

  // 检测设备类型
  let deviceType: DeviceInfo["deviceType"] = "unknown";
  const lowerUa = ua.toLowerCase();

  if (tabletKeywords.some((keyword) => lowerUa.includes(keyword))) {
    deviceType = "tablet";
  } else if (mobileKeywords.some((keyword) => lowerUa.includes(keyword))) {
    deviceType = "mobile";
  } else if (ua !== "Unknown") {
    deviceType = "desktop";
  }

  // 检测浏览器
  let browser = "Unknown";
  for (const [pattern, name] of browserPatterns) {
    const match = ua.match(pattern);
    if (match) {
      browser = name;
      break;
    }
  }

  // 检测操作系统
  let os = "Unknown";
  for (const [pattern, name] of osPatterns) {
    const match = ua.match(pattern);
    if (match) {
      os = name;
      break;
    }
  }

  return {
    userAgent: ua,
    deviceType,
    browser,
    os,
  };
}

/**
 * 从请求中提取客户端 IP 地址
 *
 * 注意：在实际部署中，需要根据反向代理配置调整 header 名称。
 * Vercel 会自动设置 `x-vercel-forwarded-for`。
 */
export function extractClientIp(request: Request): string | null {
  // Vercel / 标准 proxy header
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    // 取第一个 IP（原始客户端 IP）
    return forwardedFor.split(",")[0].trim() || null;
  }

  // Vercel 专用 header
  const vercelForwardedFor = request.headers.get("x-vercel-forwarded-for");
  if (vercelForwardedFor) {
    return vercelForwardedFor.split(",")[0].trim() || null;
  }

  // 直接连接时的远程地址（在 serverless 环境中通常不可用）
  return null;
}

/**
 * 从请求中提取设备信息和 IP
 */
export function extractRequestInfo(request: Request): {
  deviceInfo: DeviceInfo;
  ipAddress: string | null;
} {
  const userAgent = request.headers.get("user-agent") || undefined;
  const deviceInfo = parseDeviceInfo(userAgent);
  const ipAddress = extractClientIp(request);

  return { deviceInfo, ipAddress };
}
