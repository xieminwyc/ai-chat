/**
 * 游标分页类型定义
 *
 * 游标分页相比偏移分页的优势：
 * 1. 性能稳定：不会随着页码增大而变慢
 * 2. 数据一致性：避免跳过或重复显示数据
 * 3. 适合无限滚动：自然支持"加载更多"
 */

/**
 * 分页排序方向
 */
export type SortOrder = "asc" | "desc";

/**
 * 分页结果
 * @template T 数据项类型
 */
export interface PaginatedResult<T> {
  /** 当前页的数据 */
  items: T[];
  /** 下一页的游标，null 表示没有更多数据 */
  nextCursor: string | null;
  /** 是否有更多数据 */
  hasMore: boolean;
}

/**
 * 游标分页参数
 */
export interface CursorPaginationParams {
  /** 游标（从上一页返回的 nextCursor） */
  cursor?: string | null;
  /** 每页数量（默认 20，最大 100） */
  limit?: number;
}

/**
 * 原始游标值（解码后）
 *
 * 游标格式：base64url({ id: string, value: string })
 * - id: 记录的主键
 * - value: 排序字段值（可能是 createdAt、updatedAt 或其他字段）
 */
export interface RawCursor {
  id: string;
  value: string;
}

/**
 * 排序字段配置
 */
export interface SortConfig<T> {
  /** 排序字段 */
  field: keyof T | string;
  /** 排序方向 */
  order: SortOrder;
}
