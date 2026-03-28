import { beforeEach, describe, expect, it, vi } from "vitest";

const { prisma } = vi.hoisted(() => ({
  prisma: {
    chat: {
      create: vi.fn(),
      delete: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    message: {
      create: vi.fn(),
      findMany: vi.fn(),
    },
  },
}));

vi.mock("@/lib/prisma", () => ({
  prisma,
}));

vi.mock("@/lib/chat", () => ({
  createAssistantReply: vi.fn((message: string, options?: { mode?: string }) => {
    if (options?.mode === "title") {
      return "测试标题";
    }

    return `reply:${message}`;
  }),
  streamAssistantReply: vi.fn(async function* () {
    yield "第一段";
    yield "第二段";
  }),
}));

import { GET, PATCH, POST } from "@/app/api/chat/route";
import { streamAssistantReply } from "@/lib/chat";

describe("/api/chat route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loads chat list ordered by updatedAt descending", async () => {
    prisma.chat.findMany.mockResolvedValue([
      {
        id: "chat_2",
        title: "较新的会话",
        createdAt: new Date("2026-03-24T11:20:51.259Z"),
        updatedAt: new Date("2026-03-25T10:07:23.524Z"),
      },
    ]);

    const response = await GET(new Request("http://localhost:3000/api/chat"));
    const data = await response.json();

    expect(prisma.chat.findMany).toHaveBeenCalledWith({
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        title: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    expect(data.chats).toHaveLength(1);
    expect(data.chats[0]).toMatchObject({
      createdAt: "2026-03-24T11:20:51.259Z",
      updatedAt: "2026-03-25T10:07:23.524Z",
    });
  });

  it("returns message timestamps as fetched from the data layer", async () => {
    prisma.message.findMany.mockResolvedValue([
      {
        id: "message_1",
        role: "user",
        content: "介绍下你自己",
        createdAt: new Date("2026-03-24T11:20:51.268Z"),
      },
    ]);

    const response = await GET(
      new Request("http://localhost:3000/api/chat?chatId=chat_1"),
    );
    const data = await response.json();

    expect(data.messages[0]).toMatchObject({
      createdAt: "2026-03-24T11:20:51.268Z",
    });
  });

  it("renames a chat title through PATCH", async () => {
    prisma.chat.update.mockResolvedValue({
      id: "chat_1",
      title: "新的标题",
      updatedAt: new Date("2026-03-25T10:07:23.524Z"),
    });

    const response = await PATCH(
      new Request("http://localhost:3000/api/chat?chatId=chat_1", {
        method: "PATCH",
        body: JSON.stringify({ title: "新的标题" }),
        headers: { "Content-Type": "application/json" },
      }),
    );
    const data = await response.json();

    expect(prisma.chat.update).toHaveBeenCalledWith({
      where: { id: "chat_1" },
      data: { title: "新的标题" },
      select: {
        id: true,
        title: true,
        updatedAt: true,
      },
    });
    expect(data.chat.title).toBe("新的标题");
    expect(data.chat.updatedAt).toBe("2026-03-25T10:07:23.524Z");
  });

  it("refreshes chat updatedAt when posting a new message into an existing chat", async () => {
    prisma.chat.findUnique.mockResolvedValue({
      id: "chat_1",
      title: "旧标题",
    });
    prisma.message.findMany.mockResolvedValue([
      {
        role: "user",
        content: "继续学习数据库",
      },
    ]);
    prisma.message.create.mockResolvedValue({});

    const response = await POST(
      new Request("http://localhost:3000/api/chat", {
        method: "POST",
        body: JSON.stringify({
          chatId: "chat_1",
          message: "继续学习数据库",
        }),
        headers: { "Content-Type": "application/json" },
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("第一段第二段");
    expect(streamAssistantReply).toHaveBeenCalledWith([
      {
        role: "user",
        content: "继续学习数据库",
      },
    ]);
    expect(prisma.message.create).toHaveBeenCalledTimes(2);
    expect(prisma.message.create).toHaveBeenLastCalledWith({
      data: {
        chatId: "chat_1",
        role: "assistant",
        content: "第一段第二段",
      },
    });
  });

  it("creates a new chat when the first message does not provide a chat id", async () => {
    prisma.chat.findUnique.mockResolvedValue(null);
    prisma.chat.create.mockResolvedValue({
      id: "chat_new",
      title: "测试标题",
    });
    prisma.message.findMany.mockResolvedValue([
      {
        role: "user",
        content: "新会话的第一条消息",
      },
    ]);
    prisma.message.create.mockResolvedValue({});

    const response = await POST(
      new Request("http://localhost:3000/api/chat", {
        method: "POST",
        body: JSON.stringify({
          message: "新会话的第一条消息",
        }),
        headers: { "Content-Type": "application/json" },
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("第一段第二段");
    expect(prisma.chat.create).toHaveBeenCalledTimes(1);
    expect(prisma.message.create).toHaveBeenCalledTimes(2);
  });
});
