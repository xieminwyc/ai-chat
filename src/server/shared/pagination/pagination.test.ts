import { describe, it, expect, vi } from "vitest";
import {
  buildTimeBasedPaginationParams,
  processPaginationResult,
  paginate,
} from "./pagination";
import { decodeCursor } from "./cursor";

// 模拟数据类型
interface MockItem {
  id: string;
  createdAt: Date;
  title: string;
}

describe("pagination", () => {
  describe("buildTimeBasedPaginationParams", () => {
    it("应该返回默认分页参数（无游标）", () => {
      const params = buildTimeBasedPaginationParams();

      expect(params.take).toBe(21); // defaultLimit + 1
      expect(params.orderBy).toBe("desc");
      expect(params.where).toBeUndefined();
    });

    it("应该使用自定义 limit", () => {
      const params = buildTimeBasedPaginationParams({ limit: 10 });

      expect(params.take).toBe(11); // limit + 1
    });

    it("应该限制最大 limit", () => {
      const params = buildTimeBasedPaginationParams({ limit: 200 }, "createdAt", "desc", 20, 50);

      expect(params.take).toBe(51); // maxLimit + 1
    });

    it("应该为 DESC 排序构建正确的 where 条件", () => {
      // 新格式游标：{id: "chat123", value: "2024-01-01T12:00:00.000Z"}
      const cursor = "eyJpZCI6ImNoYXQxMjMiLCJ2YWx1ZSI6IjIwMjQtMDEtMDFUMTI6MDA6MDAuMDAwWiJ9";
      const params = buildTimeBasedPaginationParams(
        { cursor },
        "createdAt",
        "desc"
      );

      expect(params.where).toBeDefined();
      expect(params.where?.OR).toBeDefined();
      expect(params.where?.OR).toHaveLength(2);
      // 第一个条件：createdAt < 游标值
      expect(params.where?.OR?.[0]).toEqual({
        createdAt: { lt: new Date("2024-01-01T12:00:00.000Z") },
      });
      // 第二个条件：createdAt 相等但 id 更小
      expect(params.where?.OR?.[1]).toEqual({
        createdAt: new Date("2024-01-01T12:00:00.000Z"),
        id: { lt: "chat123" },
      });
    });

    it("应该为 ASC 排序构建正确的 where 条件", () => {
      // 新格式游标：{id: "chat123", value: "2024-01-01T12:00:00.000Z"}
      const cursor = "eyJpZCI6ImNoYXQxMjMiLCJ2YWx1ZSI6IjIwMjQtMDEtMDFUMTI6MDA6MDAuMDAwWiJ9";
      const params = buildTimeBasedPaginationParams(
        { cursor },
        "createdAt",
        "asc"
      );

      expect(params.where?.OR?.[0]).toEqual({
        createdAt: { gt: new Date("2024-01-01T12:00:00.000Z") },
      });
      expect(params.where?.OR?.[1]).toEqual({
        createdAt: new Date("2024-01-01T12:00:00.000Z"),
        id: { gt: "chat123" },
      });
    });

    it("应该使用自定义排序字段", () => {
      const params = buildTimeBasedPaginationParams(
        {},
        "updatedAt",
        "asc"
      );

      expect(params.orderBy).toBe("asc");
    });
  });

  describe("processPaginationResult", () => {
    const mockItems: MockItem[] = [
      { id: "1", createdAt: new Date("2024-01-01T12:00:00Z"), title: "Item 1" },
      { id: "2", createdAt: new Date("2024-01-01T13:00:00Z"), title: "Item 2" },
      { id: "3", createdAt: new Date("2024-01-01T14:00:00Z"), title: "Item 3" },
    ];

    it("应该处理有更多数据的情况", () => {
      const limit = 2;
      const result = processPaginationResult(mockItems, limit, "createdAt", "desc");

      expect(result.items).toHaveLength(2);
      expect(result.items[0].id).toBe("1");
      expect(result.items[1].id).toBe("2");
      expect(result.hasMore).toBe(true);
      expect(result.nextCursor).toBeDefined();
      // 游标应该是最后一项（解码验证）
      const decoded = decodeCursor(result.nextCursor!);
      expect(decoded.id).toBe("2");
      // 验证游标值是 createdAt 字段的值
      expect(decoded.value).toBe("2024-01-01T13:00:00.000Z");
    });

    it("应该处理没有更多数据的情况", () => {
      const limit = 3;
      const result = processPaginationResult(mockItems, limit, "createdAt", "desc");

      expect(result.items).toHaveLength(3);
      expect(result.hasMore).toBe(false);
      expect(result.nextCursor).toBeNull();
    });

    it("应该处理空列表", () => {
      const result = processPaginationResult([], 10, "createdAt", "desc");

      expect(result.items).toHaveLength(0);
      expect(result.hasMore).toBe(false);
      expect(result.nextCursor).toBeNull();
    });

    it("应该为 ASC 排序正确生成游标", () => {
      const result = processPaginationResult(mockItems.slice(0, 2), 1, "createdAt", "asc");

      expect(result.hasMore).toBe(true);
      // 在 ASC 排序下，游标应该是第一项（当前页的最后一项）
      const decoded = decodeCursor(result.nextCursor!);
      expect(decoded.id).toBe("1");
      expect(decoded.value).toBe("2024-01-01T12:00:00.000Z");
    });

    it("应该使用自定义排序字段生成游标", () => {
      const itemsWithUpdatedAt = [
        { id: "1", createdAt: new Date("2024-01-01T12:00:00Z"), updatedAt: new Date("2024-01-05T12:00:00Z") },
        { id: "2", createdAt: new Date("2024-01-02T12:00:00Z"), updatedAt: new Date("2024-01-04T12:00:00Z") },
      ] as const;

      const result = processPaginationResult(itemsWithUpdatedAt, 1, "updatedAt", "desc");

      expect(result.hasMore).toBe(true);
      const decoded = decodeCursor(result.nextCursor!);
      expect(decoded.id).toBe("1");
      // 验证游标值是 updatedAt 字段的值而不是 createdAt
      expect(decoded.value).toBe("2024-01-05T12:00:00.000Z");
    });
  });

  describe("paginate 组合函数", () => {
    it("应该完整执行分页查询流程", async () => {
      const mockQuery = vi.fn().mockResolvedValue([
        { id: "1", createdAt: new Date("2024-01-01T12:00:00Z"), title: "Item 1" },
        { id: "2", createdAt: new Date("2024-01-01T13:00:00Z"), title: "Item 2" },
      ]);

      const result = await paginate(mockQuery, { limit: 1 });

      expect(result.items).toHaveLength(1);
      expect(result.hasMore).toBe(true);
      // 验证游标正确（解码验证）
      const decoded = decodeCursor(result.nextCursor!);
      expect(decoded.id).toBe("1");
      expect(mockQuery).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 2, // limit + 1
        })
      );
    });

    it("应该处理没有更多数据的情况", async () => {
      const mockQuery = vi.fn().mockResolvedValue([
        { id: "1", createdAt: new Date("2024-01-01T12:00:00Z"), title: "Item 1" },
      ]);

      const result = await paginate(mockQuery, { limit: 10 });

      expect(result.items).toHaveLength(1);
      expect(result.hasMore).toBe(false);
      expect(result.nextCursor).toBeNull();
    });

    it("应该支持自定义排序", async () => {
      const mockQuery = vi.fn().mockResolvedValue([]);
      await paginate(mockQuery, {}, { sortField: "updatedAt", sortOrder: "asc" });

      expect(mockQuery).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: "asc",
        })
      );
    });

    it("应该传递正确的查询参数", async () => {
      const mockQuery = vi.fn().mockResolvedValue([]);
      // 新格式游标：{id: "test", value: "2024-01-01T12:00:00.000Z"}
      const cursor = "eyJpZCI6InRlc3QiLCJ2YWx1ZSI6IjIwMjQtMDEtMDFUMTI6MDA6MDAuMDAwWiJ9";

      await paginate(mockQuery, { cursor, limit: 5 }, { sortOrder: "desc" });

      expect(mockQuery).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 6, // limit + 1
          orderBy: "desc",
          where: expect.objectContaining({
            OR: expect.any(Array),
          }),
        })
      );
    });
  });
});
