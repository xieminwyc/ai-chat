import { beforeEach, describe, expect, it, vi } from "vitest";

const { prisma } = vi.hoisted(() => ({
  prisma: {
    chat: {
      findMany: vi.fn(),
    },
  },
}));

vi.mock("@/lib/prisma", () => ({
  prisma,
}));

import { listChatsPaginated } from "@/server/chat/chat-repository";

describe("chat-repository (游标分页)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("应该返回第一页数据（无游标）", async () => {
    const mockChats = [
      {
        id: "chat_3",
        title: "Chat 3",
        createdAt: new Date("2024-01-03T12:00:00Z"),
        updatedAt: new Date("2024-01-03T12:00:00Z"),
      },
      {
        id: "chat_2",
        title: "Chat 2",
        createdAt: new Date("2024-01-02T12:00:00Z"),
        updatedAt: new Date("2024-01-02T12:00:00Z"),
      },
      {
        id: "chat_1",
        title: "Chat 1",
        createdAt: new Date("2024-01-01T12:00:00Z"),
        updatedAt: new Date("2024-01-01T12:00:00Z"),
      },
    ];

    prisma.chat.findMany.mockResolvedValue(mockChats);

    const result = await listChatsPaginated(
      { kind: "user", userId: "user_1" },
      { limit: 2 }
    );

    expect(prisma.chat.findMany).toHaveBeenCalledWith({
      where: { userId: "user_1" },
      take: 3, // limit + 1
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        title: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    expect(result.items).toHaveLength(2);
    expect(result.items[0].id).toBe("chat_3");
    expect(result.items[1].id).toBe("chat_2");
    expect(result.hasMore).toBe(true);
    expect(result.nextCursor).toBeDefined();
  });

  it("应该使用游标获取下一页", async () => {
    const mockChats = [
      {
        id: "chat_1",
        title: "Chat 1",
        createdAt: new Date("2024-01-01T12:00:00Z"),
        updatedAt: new Date("2024-01-01T12:00:00Z"),
      },
    ];

    prisma.chat.findMany.mockResolvedValue(mockChats);

    // 新格式游标：{id: "chat_2", value: "2024-01-02T12:00:00.000Z"}
    const cursor = "eyJpZCI6ImNoYXRfMiIsInZhbHVlIjoiMjAyNC0wMS0wMlQxMjowMDowMC4wMDBaIn0";

    const result = await listChatsPaginated(
      { kind: "guest", guestSessionId: "guest_1" },
      { cursor, limit: 10 }
    );

    expect(prisma.chat.findMany).toHaveBeenCalledWith({
      where: {
        guestSessionId: "guest_1",
        AND: [
          {
            OR: [
              { updatedAt: { lt: new Date("2024-01-02T12:00:00.000Z") } },
              { updatedAt: new Date("2024-01-02T12:00:00.000Z"), id: { lt: "chat_2" } },
            ],
          },
        ],
      },
      take: 11, // limit + 1
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        title: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    expect(result.items).toHaveLength(1);
    expect(result.hasMore).toBe(false);
  });

  it("应该限制最大返回数量", async () => {
    prisma.chat.findMany.mockResolvedValue([]);

    await listChatsPaginated(
      { kind: "user", userId: "user_1" },
      { limit: 200 }
    );

    expect(prisma.chat.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 101, // maxLimit + 1
      })
    );
  });

  it("应该使用默认 limit", async () => {
    prisma.chat.findMany.mockResolvedValue([]);

    await listChatsPaginated({ kind: "user", userId: "user_1" });

    expect(prisma.chat.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 21, // defaultLimit + 1
      })
    );
  });

  it("应该正确处理没有更多数据的情况", async () => {
    const mockChats = [
      {
        id: "chat_1",
        title: "Chat 1",
        createdAt: new Date("2024-01-01T12:00:00Z"),
        updatedAt: new Date("2024-01-01T12:00:00Z"),
      },
    ];

    prisma.chat.findMany.mockResolvedValue(mockChats);

    const result = await listChatsPaginated(
      { kind: "user", userId: "user_1" },
      { limit: 10 }
    );

    expect(result.hasMore).toBe(false);
    expect(result.nextCursor).toBeNull();
  });
});
