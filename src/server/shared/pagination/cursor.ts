import type { RawCursor } from "./pagination-types";

/**
 * 将对象编码为 base64url 格式的游标
 *
 * base64url 是 base64 的 URL 安全变体：
 * - 使用 - 替代 +
 * - 使用 _ 替代 /
 * - 移除尾部的 =
 *
 * @example
 * ```ts
 * encodeCursor({ id: "123", createdAt: "2024-01-01T00:00:00.000Z" })
 * // returns: "eyJpZCI6IjEyMyIsImNyZWF0ZWRBdCI6IjIwMjQtMDEtMDFUMDA6MDA6MDAuMDAwWiJ9"
 * ```
 */
export function encodeCursor(value: RawCursor): string {
  const json = JSON.stringify(value);
  const base64 = Buffer.from(json, "utf-8").toString("base64");
  // 转换为 base64url 格式
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

/**
 * 解码 base64url 格式的游标
 *
 * @throws {Error} 如果游标格式无效
 * @example
 * ```ts
 * decodeCursor("eyJpZCI6IjEyMyIsImNyZWF0ZWRBdCI6IjIwMjQtMDEtMDFUMDA6MDA6MDAuMDAwWiJ9")
 * // returns: { id: "123", createdAt: "2024-01-01T00:00:00.000Z" }
 * ```
 */
export function decodeCursor(cursor: string): RawCursor {
  try {
    // 从 base64url 转换回 base64
    const base64 = cursor.replace(/-/g, "+").replace(/_/g, "/");
    // 添加 padding（如果需要）
    const paddedBase64 = base64.padEnd(
      base64.length + ((4 - (base64.length % 4)) % 4),
      "="
    );
    const json = Buffer.from(paddedBase64, "base64").toString("utf-8");
    return JSON.parse(json) as RawCursor;
  } catch (error) {
    throw new Error(`Invalid cursor format: ${cursor}`);
  }
}

/**
 * 创建游标（从记录的数据）
 *
 * @param id 记录的主键
 * @param value 排序字段值（通常是 createdAt、updatedAt 等时间戳）
 * @returns 编码后的游标
 */
export function createCursor(id: string, value: Date | string): string {
  const valueStr =
    value instanceof Date
      ? value.toISOString()
      : (value as string);
  return encodeCursor({ id, value: valueStr });
}

/**
 * 解析游标（返回记录的数据）
 *
 * @param cursor 游标字符串
 * @returns 解析后的 { id, value }
 * @throws {Error} 如果游标格式无效
 */
export function parseCursor(cursor: string): RawCursor {
  return decodeCursor(cursor);
}
