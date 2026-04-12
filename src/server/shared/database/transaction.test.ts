import { describe, it, expect, vi, beforeEach } from "vitest";
import { withTransaction } from "./transaction";

const { prisma: mockPrisma } = vi.hoisted(() => ({
  prisma: {
    $transaction: vi.fn(),
  },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: mockPrisma,
}));

describe("withTransaction (单元测试)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("应该执行事务并返回结果", async () => {
    const mockResult = { id: "test-id", name: "Test" };
    mockPrisma.$transaction.mockResolvedValue(mockResult);

    const result = await withTransaction(async (tx) => {
      return mockResult;
    });

    expect(result).toEqual(mockResult);
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it("应该使用默认的 maxWait 和 timeout 选项", async () => {
    mockPrisma.$transaction.mockResolvedValue({});

    await withTransaction(async (tx) => {
      return {};
    });

    expect(mockPrisma.$transaction).toHaveBeenCalledWith(
      expect.any(Function),
      {
        maxWait: 5000,
        timeout: 10000,
      }
    );
  });

  it("应该支持自定义选项", async () => {
    mockPrisma.$transaction.mockResolvedValue({});

    await withTransaction(
      async (tx) => {
        return {};
      },
      { maxWait: 10000, timeout: 20000 }
    );

    expect(mockPrisma.$transaction).toHaveBeenCalledWith(
      expect.any(Function),
      {
        maxWait: 10000,
        timeout: 20000,
      }
    );
  });

  it("应该在回调失败时抛出错误", async () => {
    const mockError = new Error("Transaction failed");
    mockPrisma.$transaction.mockRejectedValue(mockError);

    await expect(
      withTransaction(async (tx) => {
        throw mockError;
      })
    ).rejects.toThrow("Transaction failed");
  });
});
