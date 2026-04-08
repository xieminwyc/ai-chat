import { beforeEach, describe, expect, it, vi } from "vitest";

const CHAT_ID = "cchat000001";

const service = vi.hoisted(() => ({
  deleteChatById: vi.fn(),
  listChatSummaries: vi.fn(),
  loadChatMessages: vi.fn(),
  prepareChatReply: vi.fn(),
  renameChat: vi.fn(),
}));

const authService = vi.hoisted(() => ({
  getCurrentSession: vi.fn(),
}));

const stream = vi.hoisted(() => ({
  createStreamingChatResponse: vi.fn(),
}));

vi.mock("@/server/chat/chat-service", () => service);
vi.mock("@/server/chat/chat-stream", () => stream);
vi.mock("@/server/auth/auth-service", () => authService);

import { DELETE, GET, PATCH, POST } from "@/app/api/chat/route";

describe("/api/chat route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authService.getCurrentSession.mockResolvedValue({
      id: "session_1",
      token: "session-token",
      userId: "user_1",
      expiresAt: new Date("2026-04-15T01:00:00.000Z"),
      createdAt: new Date("2026-04-08T01:00:00.000Z"),
      user: {
        id: "user_1",
        email: "alice@example.com",
        createdAt: new Date("2026-04-08T01:00:00.000Z"),
        updatedAt: new Date("2026-04-08T01:00:00.000Z"),
      },
    });
  });

  it("loads chat list through the chat service", async () => {
    service.listChatSummaries.mockResolvedValue([
      {
        id: "chat_2",
        title: "较新的会话",
        createdAt: new Date("2026-03-24T11:20:51.259Z"),
        updatedAt: new Date("2026-03-25T10:07:23.524Z"),
      },
    ]);

    const response = await GET(
      new Request("http://localhost:3000/api/chat", {
        headers: {
          cookie: "ai-chat-session=session-token",
        },
      }),
    );
    const data = await response.json();

    expect(service.listChatSummaries).toHaveBeenCalledWith("user_1");
    expect(data.chats[0]).toMatchObject({
      createdAt: "2026-03-24T11:20:51.259Z",
      updatedAt: "2026-03-25T10:07:23.524Z",
    });
  });

  it("returns message timestamps from the service layer", async () => {
    service.loadChatMessages.mockResolvedValue([
      {
        id: "message_1",
        role: "user",
        content: "介绍下你自己",
        createdAt: new Date("2026-03-24T11:20:51.268Z"),
      },
    ]);

    const response = await GET(
      new Request(`http://localhost:3000/api/chat?chatId=${CHAT_ID}`, {
        headers: {
          cookie: "ai-chat-session=session-token",
        },
      }),
    );
    const data = await response.json();

    expect(service.loadChatMessages).toHaveBeenCalledWith("user_1", CHAT_ID);
    expect(data.messages[0]).toMatchObject({
      createdAt: "2026-03-24T11:20:51.268Z",
    });
  });

  it("renames a chat title through the service", async () => {
    service.renameChat.mockResolvedValue({
      id: "chat_1",
      title: "新的标题",
      updatedAt: new Date("2026-03-25T10:07:23.524Z"),
    });

    const response = await PATCH(
      new Request(`http://localhost:3000/api/chat?chatId=${CHAT_ID}`, {
        method: "PATCH",
        body: JSON.stringify({ title: "新的标题" }),
        headers: {
          "Content-Type": "application/json",
          cookie: "ai-chat-session=session-token",
        },
      }),
    );
    const data = await response.json();

    expect(service.renameChat).toHaveBeenCalledWith(
      "user_1",
      CHAT_ID,
      "新的标题",
    );
    expect(data.chat.updatedAt).toBe("2026-03-25T10:07:23.524Z");
  });

  it("deletes a chat through the service", async () => {
    const response = await DELETE(
      new Request(`http://localhost:3000/api/chat?chatId=${CHAT_ID}`, {
        method: "DELETE",
        headers: {
          cookie: "ai-chat-session=session-token",
        },
      }),
    );
    const data = await response.json();

    expect(service.deleteChatById).toHaveBeenCalledWith("user_1", CHAT_ID);
    expect(data.success).toBe(true);
  });

  it("creates a streaming response after preparing a reply", async () => {
    const streamingResponse = new Response("第一段第二段", {
      headers: {
        "X-Chat-Id": CHAT_ID,
      },
    });

    service.prepareChatReply.mockResolvedValue({
      chatId: CHAT_ID,
      isNewChat: false,
      replyStream: (async function* () {
        yield "第一段";
        yield "第二段";
      })(),
    });
    stream.createStreamingChatResponse.mockReturnValue(streamingResponse);

    const response = await POST(
      new Request("http://localhost:3000/api/chat", {
        method: "POST",
        body: JSON.stringify({
          chatId: CHAT_ID,
          message: "继续学习数据库",
        }),
        headers: {
          "Content-Type": "application/json",
          cookie: "ai-chat-session=session-token",
        },
      }),
    );

    expect(service.prepareChatReply).toHaveBeenCalledWith({
      userId: "user_1",
      chatId: CHAT_ID,
      message: "继续学习数据库",
    });
    expect(stream.createStreamingChatResponse).toHaveBeenCalledWith({
      chatId: CHAT_ID,
      replyStream: expect.any(Object),
      startedAt: expect.any(Number),
    });
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("第一段第二段");
  });

  it("returns 401 when the request has no authenticated session", async () => {
    authService.getCurrentSession.mockResolvedValue(null);

    const response = await GET(new Request("http://localhost:3000/api/chat"));
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe("登录状态已失效，请重新登录。");
  });
});
