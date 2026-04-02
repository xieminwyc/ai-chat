import { beforeEach, describe, expect, it, vi } from "vitest";

const repository = vi.hoisted(() => ({
  createChat: vi.fn(),
  createMessage: vi.fn(),
  deleteChat: vi.fn(),
  getChatById: vi.fn(),
  getChatMessages: vi.fn(),
  getConversationMessages: vi.fn(),
  listChats: vi.fn(),
  renameChatTitle: vi.fn(),
}));

const provider = vi.hoisted(() => ({
  createAssistantReply: vi.fn(),
  streamAssistantReply: vi.fn(),
}));

vi.mock("@/server/chat/chat-repository", () => repository);
vi.mock("@/server/ai/chat-provider", () => provider);

import {
  deleteChatById,
  listChatSummaries,
  loadChatMessages,
  prepareChatReply,
  renameChat,
} from "@/server/chat/chat-service";

describe("chat-service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loads list and message data through the repository", async () => {
    repository.listChats.mockResolvedValue([{ id: "chat_1", title: "测试标题" }]);
    repository.getChatMessages.mockResolvedValue([
      { id: "message_1", role: "user", content: "你好" },
    ]);

    await expect(listChatSummaries()).resolves.toEqual([
      { id: "chat_1", title: "测试标题" },
    ]);
    await expect(loadChatMessages("chat_1")).resolves.toEqual([
      { id: "message_1", role: "user", content: "你好" },
    ]);
  });

  it("renames and deletes chats through the repository", async () => {
    repository.renameChatTitle.mockResolvedValue({
      id: "chat_1",
      title: "新的标题",
      updatedAt: new Date("2026-03-25T10:07:23.524Z"),
    });

    await expect(renameChat("chat_1", "新的标题")).resolves.toMatchObject({
      title: "新的标题",
    });

    await deleteChatById("chat_1");

    expect(repository.renameChatTitle).toHaveBeenCalledWith("chat_1", "新的标题");
    expect(repository.deleteChat).toHaveBeenCalledWith("chat_1");
  });

  it("reuses an existing chat when posting a new message", async () => {
    const replyStream = (async function* () {
      yield "第一段";
    })();

    repository.getChatById.mockResolvedValue({
      id: "chat_1",
      title: "旧标题",
    });
    repository.getConversationMessages.mockResolvedValue([
      { role: "user", content: "继续学习数据库" },
    ]);
    provider.streamAssistantReply.mockResolvedValue(replyStream);

    const result = await prepareChatReply({
      chatId: "chat_1",
      message: "继续学习数据库",
    });

    expect(repository.createChat).not.toHaveBeenCalled();
    expect(repository.createMessage).toHaveBeenCalledWith({
      chatId: "chat_1",
      role: "user",
      content: "继续学习数据库",
    });
    expect(provider.streamAssistantReply).toHaveBeenCalledWith([
      { role: "user", content: "继续学习数据库" },
    ]);
    expect(result).toEqual({
      chatId: "chat_1",
      replyStream,
      isNewChat: false,
    });
  });

  it("creates a chat title before starting a first reply", async () => {
    const replyStream = (async function* () {
      yield "第一段";
    })();

    repository.getConversationMessages.mockResolvedValue([
      { role: "user", content: "新会话的第一条消息" },
    ]);
    repository.createChat.mockResolvedValue({
      id: "chat_new",
      title: "测试标题",
    });
    provider.createAssistantReply.mockReturnValue("测试标题");
    provider.streamAssistantReply.mockResolvedValue(replyStream);

    const result = await prepareChatReply({
      message: "新会话的第一条消息",
    });

    expect(provider.createAssistantReply).toHaveBeenCalledWith("新会话的第一条消息", {
      mode: "title",
    });
    expect(repository.createChat).toHaveBeenCalledWith("测试标题");
    expect(repository.createMessage).toHaveBeenCalledWith({
      chatId: "chat_new",
      role: "user",
      content: "新会话的第一条消息",
    });
    expect(result).toEqual({
      chatId: "chat_new",
      replyStream,
      isNewChat: true,
    });
  });
});
