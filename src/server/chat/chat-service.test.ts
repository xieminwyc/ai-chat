import { beforeEach, describe, expect, it, vi } from "vitest";

const repository = vi.hoisted(() => ({
  createChat: vi.fn(),
  createChatWithFirstMessage: vi.fn(),
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

const guestService = vi.hoisted(() => ({
  assertGuestMessageQuotaAvailable: vi.fn(),
  consumeGuestMessageQuota: vi.fn(),
}));

vi.mock("@/server/chat/chat-repository", () => repository);
vi.mock("@/server/ai/chat-provider", () => provider);
vi.mock("@/server/guest/guest-service", () => guestService);

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
    guestService.assertGuestMessageQuotaAvailable.mockResolvedValue({
      id: "guest_1",
      trialMessageCount: 0,
    });
  });

  it("loads list and message data through the repository", async () => {
    repository.listChats.mockResolvedValue([{ id: "chat_1", title: "测试标题" }]);
    repository.getChatMessages.mockResolvedValue([
      { id: "message_1", role: "user", content: "你好" },
    ]);

    const owner = { kind: "guest" as const, guestSessionId: "guest_1" };

    await expect(listChatSummaries(owner)).resolves.toEqual([
      { id: "chat_1", title: "测试标题" },
    ]);
    await expect(loadChatMessages(owner, "chat_1")).resolves.toEqual([
      { id: "message_1", role: "user", content: "你好" },
    ]);
    expect(repository.listChats).toHaveBeenCalledWith(owner);
    expect(repository.getChatMessages).toHaveBeenCalledWith("chat_1", owner);
  });

  it("renames and deletes chats through the repository", async () => {
    const owner = { kind: "user" as const, userId: "user_1" };
    repository.getChatById.mockResolvedValue({
      id: "chat_1",
      title: "旧标题",
      userId: "user_1",
      guestSessionId: null,
    });
    repository.renameChatTitle.mockResolvedValue({
      id: "chat_1",
      title: "新的标题",
      updatedAt: new Date("2026-03-25T10:07:23.524Z"),
    });

    await expect(renameChat(owner, "chat_1", "新的标题")).resolves.toMatchObject({
      title: "新的标题",
    });

    await deleteChatById(owner, "chat_1");

    expect(repository.getChatById).toHaveBeenCalledWith("chat_1", owner);
    expect(repository.renameChatTitle).toHaveBeenCalledWith("chat_1", "新的标题");
    expect(repository.deleteChat).toHaveBeenCalledWith("chat_1");
  });

  it("reuses an existing chat when posting a new message", async () => {
    const owner = { kind: "user" as const, userId: "user_1" };
    const replyStream = (async function* () {
      yield "第一段";
    })();

    repository.getChatById.mockResolvedValue({
      id: "chat_1",
      title: "旧标题",
      userId: "user_1",
      guestSessionId: null,
    });
    repository.getConversationMessages.mockResolvedValue([
      { role: "user", content: "继续学习数据库" },
    ]);
    provider.streamAssistantReply.mockResolvedValue(replyStream);

    const result = await prepareChatReply({
      owner,
      chatId: "chat_1",
      message: "继续学习数据库",
    });

    expect(repository.createChat).not.toHaveBeenCalled();
    expect(repository.getChatById).toHaveBeenCalledWith("chat_1", owner);
    expect(repository.createMessage).toHaveBeenCalledWith({
      chatId: "chat_1",
      role: "user",
      content: "继续学习数据库",
    });
    expect(guestService.assertGuestMessageQuotaAvailable).not.toHaveBeenCalled();
    expect(guestService.consumeGuestMessageQuota).not.toHaveBeenCalled();
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
    const owner = { kind: "user" as const, userId: "user_1" };
    const replyStream = (async function* () {
      yield "第一段";
    })();

    repository.getConversationMessages.mockResolvedValue([
      { role: "user", content: "新会话的第一条消息" },
    ]);
    repository.createChatWithFirstMessage.mockResolvedValue({
      id: "chat_new",
      title: "测试标题",
      userId: "user_1",
      guestSessionId: null,
    });
    provider.createAssistantReply.mockReturnValue("测试标题");
    provider.streamAssistantReply.mockResolvedValue(replyStream);

    const result = await prepareChatReply({
      owner,
      message: "新会话的第一条消息",
    });

    expect(provider.createAssistantReply).toHaveBeenCalledWith("新会话的第一条消息", {
      mode: "title",
    });
    expect(repository.createChatWithFirstMessage).toHaveBeenCalledWith(
      "测试标题",
      owner,
      "新会话的第一条消息"
    );
    expect(result).toEqual({
      chatId: "chat_new",
      replyStream,
      isNewChat: true,
    });
  });

  it("creates a guest-owned chat and consumes guest quota", async () => {
    const owner = { kind: "guest" as const, guestSessionId: "guest_1" };
    const replyStream = (async function* () {
      yield "第一段";
    })();

    repository.getConversationMessages.mockResolvedValue([
      { role: "user", content: "游客第一条消息" },
    ]);
    repository.createChatWithFirstMessage.mockResolvedValue({
      id: "chat_guest_1",
      title: "游客标题",
      userId: null,
      guestSessionId: "guest_1",
    });
    provider.createAssistantReply.mockReturnValue("游客标题");
    provider.streamAssistantReply.mockResolvedValue(replyStream);
    guestService.consumeGuestMessageQuota.mockResolvedValue({
      id: "guest_1",
      trialMessageCount: 1,
    });

    const result = await prepareChatReply({
      owner,
      message: "游客第一条消息",
    });

    expect(repository.createChatWithFirstMessage).toHaveBeenCalledWith(
      "游客标题",
      owner,
      "游客第一条消息"
    );
    expect(guestService.assertGuestMessageQuotaAvailable).toHaveBeenCalledWith("guest_1");
    expect(guestService.consumeGuestMessageQuota).toHaveBeenCalledWith("guest_1");
    expect(result).toEqual({
      chatId: "chat_guest_1",
      replyStream,
      isNewChat: true,
    });
  });

  it("blocks guest messages when quota is exhausted", async () => {
    const owner = { kind: "guest" as const, guestSessionId: "guest_1" };
    guestService.assertGuestMessageQuotaAvailable.mockRejectedValue(
      new Error("Guest trial limit reached. Please register to continue."),
    );

    await expect(
      prepareChatReply({
        owner,
        message: "超过上限的消息",
      }),
    ).rejects.toThrow("Guest trial limit reached. Please register to continue.");

    expect(guestService.assertGuestMessageQuotaAvailable).toHaveBeenCalledWith("guest_1");
    expect(guestService.consumeGuestMessageQuota).not.toHaveBeenCalled();
    expect(provider.createAssistantReply).not.toHaveBeenCalled();
    expect(repository.createChatWithFirstMessage).not.toHaveBeenCalled();
    expect(provider.streamAssistantReply).not.toHaveBeenCalled();
  });

  it("consumes guest quota only after the user message is persisted", async () => {
    const owner = { kind: "guest" as const, guestSessionId: "guest_1" };
    const persistenceFailure = new Error("database write failed");

    repository.createChatWithFirstMessage.mockRejectedValue(persistenceFailure);
    provider.createAssistantReply.mockReturnValue("游客标题");

    await expect(
      prepareChatReply({
        owner,
        message: "游客第一条消息",
      }),
    ).rejects.toThrow("database write failed");

    expect(repository.createChatWithFirstMessage).toHaveBeenCalledWith(
      "游客标题",
      owner,
      "游客第一条消息"
    );
    expect(guestService.assertGuestMessageQuotaAvailable).toHaveBeenCalledWith("guest_1");
    expect(guestService.consumeGuestMessageQuota).not.toHaveBeenCalled();
    expect(provider.streamAssistantReply).not.toHaveBeenCalled();
  });
});
