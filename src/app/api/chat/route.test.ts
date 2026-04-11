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

const guestService = vi.hoisted(() => ({
  getCurrentGuestSession: vi.fn(),
  getOrCreateGuestSession: vi.fn(),
}));

const guestSession = vi.hoisted(() => ({
  getGuestCookieName: vi.fn(),
  getGuestCookieOptions: vi.fn(),
  readGuestTokenFromCookieHeader: vi.fn(),
}));

const stream = vi.hoisted(() => ({
  createStreamingChatResponse: vi.fn(),
}));

const rateLimitPolicies = vi.hoisted(() => ({
  enforceChatMessageRateLimit: vi.fn(),
}));

vi.mock("@/server/chat/chat-service", () => service);
vi.mock("@/server/chat/chat-stream", () => stream);
vi.mock("@/server/auth/auth-service", () => authService);
vi.mock("@/server/guest/guest-service", () => guestService);
vi.mock("@/server/guest/guest-session", () => guestSession);
vi.mock("@/server/rate-limit/rate-limit-policies", () => rateLimitPolicies);

import { DELETE, GET, PATCH, POST } from "@/app/api/chat/route";

describe("/api/chat route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rateLimitPolicies.enforceChatMessageRateLimit.mockResolvedValue(undefined);
    service.listChatSummaries.mockResolvedValue([]);
    service.loadChatMessages.mockResolvedValue([]);
    service.prepareChatReply.mockReset();
    service.renameChat.mockReset();
    service.deleteChatById.mockReset();
    authService.getCurrentSession.mockResolvedValue({
      id: "session_1",
      token: "session-token",
      userId: "user_1",
      expiresAt: new Date("2026-04-15T01:00:00.000Z"),
      createdAt: new Date("2026-04-08T01:00:00.000Z"),
      user: {
        id: "user_1",
        email: "alice@example.com",
        emailVerifiedAt: new Date("2026-04-08T03:00:00.000Z"),
        createdAt: new Date("2026-04-08T01:00:00.000Z"),
        updatedAt: new Date("2026-04-08T01:00:00.000Z"),
      },
    });
    guestService.getCurrentGuestSession.mockResolvedValue(null);
    guestService.getOrCreateGuestSession.mockResolvedValue({
      guestSession: {
        id: "guest_1",
        guestToken: "guest-token",
        trialMessageCount: 0,
      },
      created: false,
    });
    guestSession.getGuestCookieName.mockReturnValue("ai-chat-guest");
    guestSession.getGuestCookieOptions.mockReturnValue({
      httpOnly: true,
      sameSite: "lax",
      secure: false,
      path: "/",
      maxAge: 14 * 24 * 60 * 60,
    });
    guestSession.readGuestTokenFromCookieHeader.mockImplementation(
      (cookieHeader?: string | null) => {
        if (!cookieHeader) {
          return null;
        }

        const match = cookieHeader.match(/ai-chat-guest=([^;]+)/);
        return match?.[1] ?? null;
      },
    );
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

    expect(service.listChatSummaries).toHaveBeenCalledWith({
      kind: "user",
      userId: "user_1",
    });
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

    expect(service.loadChatMessages).toHaveBeenCalledWith(
      { kind: "user", userId: "user_1" },
      CHAT_ID,
    );
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
      { kind: "user", userId: "user_1" },
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

    expect(service.deleteChatById).toHaveBeenCalledWith(
      { kind: "user", userId: "user_1" },
      CHAT_ID,
    );
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
      owner: { kind: "user", userId: "user_1" },
      chatId: CHAT_ID,
      message: "继续学习数据库",
    });
    expect(rateLimitPolicies.enforceChatMessageRateLimit).toHaveBeenCalledWith({
      actor: { kind: "user", userId: "user_1" },
    });
    expect(stream.createStreamingChatResponse).toHaveBeenCalledWith({
      chatId: CHAT_ID,
      replyStream: expect.any(Object),
      startedAt: expect.any(Number),
    });
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("第一段第二段");
  });

  it("returns 403 when an authenticated user has not verified their email", async () => {
    authService.getCurrentSession.mockResolvedValue({
      id: "session_1",
      token: "session-token",
      userId: "user_1",
      expiresAt: new Date("2026-04-15T01:00:00.000Z"),
      createdAt: new Date("2026-04-08T01:00:00.000Z"),
      user: {
        id: "user_1",
        email: "alice@example.com",
        emailVerifiedAt: null,
        createdAt: new Date("2026-04-08T01:00:00.000Z"),
        updatedAt: new Date("2026-04-08T01:00:00.000Z"),
      },
    });

    const response = await POST(
      new Request("http://localhost:3000/api/chat", {
        method: "POST",
        body: JSON.stringify({
          message: "继续学习数据库",
        }),
        headers: {
          "Content-Type": "application/json",
          cookie: "ai-chat-session=session-token",
        },
      }),
    );
    const data = await response.json();

    expect(response.status).toBe(403);
    expect(data).toEqual({
      error: "请先验证邮箱后再继续聊天。",
    });
    expect(service.prepareChatReply).not.toHaveBeenCalled();
  });

  it("returns 429 when the chat message rate limit has been exceeded", async () => {
    rateLimitPolicies.enforceChatMessageRateLimit.mockRejectedValue(
      Object.assign(new Error("发送太快，请稍后再试。"), {
        code: "rate_limit.exceeded",
        httpStatus: 429,
        expose: true,
      }),
    );

    const response = await POST(
      new Request("http://localhost:3000/api/chat", {
        method: "POST",
        body: JSON.stringify({
          message: "继续学习数据库",
        }),
        headers: {
          "Content-Type": "application/json",
          cookie: "ai-chat-session=session-token",
        },
      }),
    );
    const data = await response.json();

    expect(response.status).toBe(429);
    expect(data).toEqual({
      error: "发送太快，请稍后再试。",
    });
    expect(service.prepareChatReply).not.toHaveBeenCalled();
  });

  it("returns 401 when the request has no authenticated session", async () => {
    authService.getCurrentSession.mockResolvedValue(null);

    const response = await GET(new Request("http://localhost:3000/api/chat"));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(guestService.getOrCreateGuestSession).toHaveBeenCalledWith(null);
    expect(data).toEqual({ chats: [] });
  });

  it("loads guest chat list when only the guest cookie is present", async () => {
    authService.getCurrentSession.mockResolvedValue(null);
    guestService.getCurrentGuestSession.mockResolvedValue({
      id: "guest_1",
      guestToken: "guest-token",
      trialMessageCount: 1,
    });
    service.listChatSummaries.mockResolvedValue([
      {
        id: "chat_guest_1",
        title: "游客会话",
        createdAt: new Date("2026-03-24T11:20:51.259Z"),
        updatedAt: new Date("2026-03-25T10:07:23.524Z"),
      },
    ]);

    const response = await GET(
      new Request("http://localhost:3000/api/chat", {
        headers: {
          cookie: "ai-chat-guest=guest-token",
        },
      }),
    );
    const data = await response.json();

    expect(service.listChatSummaries).toHaveBeenCalledWith({
      kind: "guest",
      guestSessionId: "guest_1",
    });
    expect(data.chats).toHaveLength(1);
  });

  it("returns 401 when a guest chat request references a missing guest session", async () => {
    authService.getCurrentSession.mockResolvedValue(null);
    guestService.getCurrentGuestSession.mockRejectedValue(
      new Error("Guest session not found."),
    );

    const response = await GET(
      new Request(`http://localhost:3000/api/chat?chatId=${CHAT_ID}`, {
        headers: {
          cookie: "ai-chat-guest=missing-guest-token",
        },
      }),
    );
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data).toEqual({
      error: "Guest session not found.",
    });
  });

  it("creates a guest-owned chat and writes the guest cookie when posting anonymously", async () => {
    authService.getCurrentSession.mockResolvedValue(null);
    guestService.getOrCreateGuestSession.mockResolvedValue({
      guestSession: {
        id: "guest_1",
        guestToken: "guest-token",
        trialMessageCount: 0,
      },
      created: true,
    });
    const streamingResponse = new Response("游客回复", {
      headers: {
        "X-Chat-Id": CHAT_ID,
      },
    });
    service.prepareChatReply.mockResolvedValue({
      chatId: CHAT_ID,
      isNewChat: true,
      replyStream: (async function* () {
        yield "游客回复";
      })(),
    });
    stream.createStreamingChatResponse.mockReturnValue(streamingResponse);

    const response = await POST(
      new Request("http://localhost:3000/api/chat", {
        method: "POST",
        body: JSON.stringify({
          message: "游客第一条消息",
        }),
        headers: {
          "Content-Type": "application/json",
        },
      }),
    );

    expect(service.prepareChatReply).toHaveBeenCalledWith({
      owner: { kind: "guest", guestSessionId: "guest_1" },
      message: "游客第一条消息",
      chatId: undefined,
    });
    expect(response.headers.get("set-cookie")).toContain("ai-chat-guest=guest-token");
  });

  it("returns 403 when the guest trial limit is exhausted", async () => {
    authService.getCurrentSession.mockResolvedValue(null);
    guestService.getCurrentGuestSession.mockResolvedValue({
      id: "guest_1",
      guestToken: "guest-token",
      trialMessageCount: 3,
    });
    service.prepareChatReply.mockRejectedValue(
      new Error("Guest trial limit reached. Please register to continue."),
    );

    const response = await POST(
      new Request("http://localhost:3000/api/chat", {
        method: "POST",
        body: JSON.stringify({
          message: "超过上限的消息",
        }),
        headers: {
          "Content-Type": "application/json",
          cookie: "ai-chat-guest=guest-token",
        },
      }),
    );
    const data = await response.json();

    expect(response.status).toBe(403);
    expect(data.error).toBe(
      "Guest trial limit reached. Please register to continue.",
    );
  });
});
