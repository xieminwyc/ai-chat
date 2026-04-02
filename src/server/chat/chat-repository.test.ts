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

import {
  createChat,
  createMessage,
  getChatById,
  getChatMessages,
  getConversationMessages,
  listChats,
  renameChatTitle,
} from "@/server/chat/chat-repository";

describe("chat-repository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loads chats for the sidebar ordered by updatedAt descending", async () => {
    prisma.chat.findMany.mockResolvedValue([]);

    await listChats();

    expect(prisma.chat.findMany).toHaveBeenCalledWith({
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        title: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  });

  it("loads conversation messages in chronological order for the model", async () => {
    prisma.message.findMany.mockResolvedValue([]);

    await getConversationMessages("chat_1");

    expect(prisma.message.findMany).toHaveBeenCalledWith({
      where: { chatId: "chat_1" },
      orderBy: { createdAt: "asc" },
      select: {
        role: true,
        content: true,
      },
    });
  });

  it("renames a chat and returns the selected fields", async () => {
    prisma.chat.update.mockResolvedValue({
      id: "chat_1",
      title: "新的标题",
      updatedAt: new Date("2026-03-25T10:07:23.524Z"),
    });

    const chat = await renameChatTitle("chat_1", "新的标题");

    expect(prisma.chat.update).toHaveBeenCalledWith({
      where: { id: "chat_1" },
      data: { title: "新的标题" },
      select: {
        id: true,
        title: true,
        updatedAt: true,
      },
    });
    expect(chat.title).toBe("新的标题");
  });

  it("provides helpers for direct chat and message persistence", async () => {
    prisma.chat.findUnique.mockResolvedValue({ id: "chat_1", title: "旧标题" });
    prisma.chat.create.mockResolvedValue({ id: "chat_new", title: "测试标题" });
    prisma.message.findMany.mockResolvedValue([
      {
        id: "message_1",
        role: "user",
        content: "你好",
        createdAt: new Date("2026-03-24T11:20:51.268Z"),
      },
    ]);
    prisma.message.create.mockResolvedValue({});

    await getChatById("chat_1");
    await createChat("测试标题");
    await getChatMessages("chat_1");
    await createMessage({
      chatId: "chat_1",
      role: "assistant",
      content: "你好",
    });

    expect(prisma.chat.findUnique).toHaveBeenCalledWith({
      where: { id: "chat_1" },
      select: {
        id: true,
        title: true,
      },
    });
    expect(prisma.chat.create).toHaveBeenCalledWith({
      data: { title: "测试标题" },
      select: {
        id: true,
        title: true,
      },
    });
    expect(prisma.message.findMany).toHaveBeenCalledWith({
      where: { chatId: "chat_1" },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        role: true,
        content: true,
        createdAt: true,
      },
    });
    expect(prisma.message.create).toHaveBeenCalledWith({
      data: {
        chatId: "chat_1",
        role: "assistant",
        content: "你好",
      },
    });
  });
});
