import type { Prisma } from "@prisma/client";
import type {
  CursorPaginationParams,
  PaginatedResult,
  RawCursor,
  SortOrder,
} from "./pagination-types";
import { createCursor, decodeCursor } from "./cursor";

/**
 * 构建分页查询参数
 *
 * @param pagination 分页参数
 * @param defaultLimit 默认每页数量
 * @param maxLimit 最大每页数量
 * @returns Prisma 查询参数
 */
export function buildPaginationParams<
  T extends { id: string; createdAt: Date | string },
>(pagination: CursorPaginationParams = {}, defaultLimit = 20, maxLimit = 100) {
  const limit = Math.min(pagination.limit ?? defaultLimit, maxLimit);
  const params = {
    take: limit + 1, // 多取一条用于判断是否有更多数据
  } as {
    take?: number;
    skip?: number;
    cursor?: { id_createdAt: { id: string; createdAt: Date } };
  };

  if (pagination.cursor) {
    const { id, value } = decodeCursor(pagination.cursor);
    // 使用复合条件：先比较 createdAt，再比较 id（确保稳定性）
    params.cursor = { id_createdAt: { id, createdAt: new Date(value) } };
    params.skip = 1; // 跳过游标本身
  }

  return params;
}

/**
 * 构建基于时间排序的分页查询条件（不使用 cursor API）
 *
 * 这种方式更灵活，支持复杂的排序逻辑
 *
 * @param pagination 分页参数
 * @param sortField 排序字段（默认 createdAt）
 * @param sortOrder 排序方向（默认 desc）
 * @param defaultLimit 默认每页数量
 * @param maxLimit 最大每页数量
 * @returns Prisma 查询的 where 和 orderBy 参数
 */
export function buildTimeBasedPaginationParams(
  pagination: CursorPaginationParams = {},
  sortField: string = "createdAt",
  sortOrder: SortOrder = "desc",
  defaultLimit = 20,
  maxLimit = 100,
): {
  take: number;
  orderBy: Prisma.SortOrder;
  where?: Record<string, unknown>;
} {
  const limit = Math.min(pagination.limit ?? defaultLimit, maxLimit);
  const result: ReturnType<typeof buildTimeBasedPaginationParams> = {
    take: limit + 1, // 多取一条用于判断是否有更多数据
    orderBy: sortOrder as Prisma.SortOrder,
  };

  if (pagination.cursor) {
    const { id, value } = decodeCursor(pagination.cursor);
    const cursorValue = new Date(value);

    // 构建分页条件：sortField < cursor.value（desc）或 sortField > cursor.value（asc）
    if (sortOrder === "desc") {
      result.where = {
        OR: [
          // sortField 小于游标值
          { [sortField]: { lt: cursorValue } },
          // sortField 相等但 id 小于游标 id（确保稳定性）
          {
            [sortField]: cursorValue,
            id: { lt: id },
          },
        ],
      };
    } else {
      result.where = {
        OR: [
          // sortField 大于游标值
          { [sortField]: { gt: cursorValue } },
          // sortField 相等但 id 大于游标 id
          {
            [sortField]: cursorValue,
            id: { gt: id },
          },
        ],
      };
    }
  }

  return result;
}

/**
 * 处理分页结果，生成下一页游标
 *
 * @param items 查询返回的数据（可能多取了一条）
 * @param limit 实际请求的数量
 * @param sortField 排序字段名（用于从 items 中提取游标值）
 * @param sortOrder 排序方向
 * @returns 分页结果
 */
export function processPaginationResult<
  T extends { id: string; createdAt: Date | string; updatedAt?: Date | string },
>(
  items: T[],
  limit: number,
  sortField: string,
  sortOrder: SortOrder = "desc",
): PaginatedResult<T> {
  const hasMore = items.length > limit;
  const pageItems = hasMore ? items.slice(0, limit) : items;

  let nextCursor: string | null = null;
  if (hasMore && pageItems.length > 0) {
    // 最后一项作为下一页的游标，使用排序字段值而不是 createdAt
    const lastItem = pageItems[pageItems.length - 1];
    const cursorValue = (lastItem as Record<string, unknown>)[sortField] as Date | string;
    nextCursor = createCursor(lastItem.id, cursorValue);
  }

  return {
    items: pageItems,
    nextCursor,
    hasMore,
  };
}

/**
 * 组合函数：执行分页查询并返回结果
 *
 * @param query 查询函数
 * @param pagination 分页参数
 * @param options 选项
 * @returns 分页结果
 */
export async function paginate<
  T extends { id: string; createdAt: Date | string },
>(
  query: (
    params: ReturnType<typeof buildTimeBasedPaginationParams>,
  ) => Promise<T[]>,
  pagination: CursorPaginationParams = {},
  options: {
    sortField?: string;
    sortOrder?: SortOrder;
    defaultLimit?: number;
    maxLimit?: number;
  } = {},
): Promise<PaginatedResult<T>> {
  const {
    sortField = "createdAt",
    sortOrder = "desc",
    defaultLimit = 20,
    maxLimit = 100,
  } = options;

  const limit = Math.min(pagination.limit ?? defaultLimit, maxLimit);
  const params = buildTimeBasedPaginationParams(
    pagination,
    sortField,
    sortOrder,
    defaultLimit,
    maxLimit,
  );

  const items = await query(params);
  return processPaginationResult(items, limit, sortField, sortOrder);
}
