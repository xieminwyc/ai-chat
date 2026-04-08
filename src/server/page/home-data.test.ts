import { beforeEach, describe, expect, it, vi } from "vitest";

const CHAT_ID = "cchat000001";

const nextHeaders = vi.hoisted(() => ({
  cookies: vi.fn(),
}));

const authService = vi.hoisted(() => ({
  getCurrentSession: vi.fn(),
}));

const chatService = vi.hoisted(() => ({
  listChatSummaries: vi.fn(),
  loadChatMessages: vi.fn(),
}));

const authSession = vi.hoisted(() => ({
  getSessionCookieName: vi.fn(),
}));

vi.mock("next/headers", () => nextHeaders);
vi.mock("@/server/auth/auth-service", () => authService);
vi.mock("@/server/chat/chat-service", () => chatService);
vi.mock("@/server/auth/session", () => authSession);

import { getHomePageData } from "@/server/page/home-data";

describe("home-data", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authSession.getSessionCookieName.mockReturnValue("ai-chat-session");
    nextHeaders.cookies.mockResolvedValue({
      get: vi.fn().mockReturnValue(undefined),
    });
    authService.getCurrentSession.mockResolvedValue(null);
    chatService.listChatSummaries.mockResolvedValue([]);
    chatService.loadChatMessages.mockResolvedValue([]);
  });

  it("returns a signed-out bootstrap state when no session cookie exists", async () => {
    const data = await getHomePageData({});

    expect(authService.getCurrentSession).toHaveBeenCalledWith(null);
    expect(data).toEqual({
      isAuthenticated: false,
      currentUser: null,
      initialChats: [],
      initialMessages: [],
      initialChatId: null,
    });
  });

  it("returns the current user and chat summaries for authenticated requests", async () => {
    nextHeaders.cookies.mockResolvedValue({
      get: vi.fn().mockImplementation((name: string) =>
        name === "ai-chat-session"
          ? { name, value: "session-token" }
          : undefined,
      ),
    });
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
    chatService.listChatSummaries.mockResolvedValue([
      {
        id: CHAT_ID,
        title: "Next.js 学习",
        createdAt: new Date("2026-03-24T11:20:51.259Z"),
        updatedAt: new Date("2026-03-25T10:07:23.524Z"),
      },
    ]);

    const data = await getHomePageData({});

    expect(authService.getCurrentSession).toHaveBeenCalledWith("session-token");
    expect(chatService.listChatSummaries).toHaveBeenCalledWith("user_1");
    expect(chatService.loadChatMessages).not.toHaveBeenCalled();
    expect(data).toEqual({
      isAuthenticated: true,
      currentUser: {
        id: "user_1",
        email: "alice@example.com",
        createdAt: "2026-04-08T01:00:00.000Z",
        updatedAt: "2026-04-08T01:00:00.000Z",
      },
      initialChats: [
        {
          id: CHAT_ID,
          title: "Next.js 学习",
          createdAt: "2026-03-24T11:20:51.259Z",
          updatedAt: "2026-03-25T10:07:23.524Z",
        },
      ],
      initialMessages: [],
      initialChatId: null,
    });
  });

  it("loads the selected chat messages only when that chat belongs to the current user", async () => {
    nextHeaders.cookies.mockResolvedValue({
      get: vi.fn().mockImplementation((name: string) =>
        name === "ai-chat-session"
          ? { name, value: "session-token" }
          : undefined,
      ),
    });
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
    chatService.listChatSummaries.mockResolvedValue([
      {
        id: CHAT_ID,
        title: "Next.js 学习",
        createdAt: new Date("2026-03-24T11:20:51.259Z"),
        updatedAt: new Date("2026-03-25T10:07:23.524Z"),
      },
    ]);
    chatService.loadChatMessages.mockResolvedValue([
      {
        id: "message_1",
        role: "user",
        content: "继续学习数据库",
        createdAt: new Date("2026-03-24T11:20:51.268Z"),
      },
    ]);

    const data = await getHomePageData({ selectedChatId: CHAT_ID });

    expect(chatService.loadChatMessages).toHaveBeenCalledWith("user_1", CHAT_ID);
    expect(data.initialChatId).toBe(CHAT_ID);
    expect(data.initialMessages).toEqual([
      {
        id: "message_1",
        role: "user",
        content: "继续学习数据库",
        createdAt: "2026-03-24T11:20:51.268Z",
      },
    ]);
  });

  it("ignores a selected chat id that is not owned by the current user", async () => {
    nextHeaders.cookies.mockResolvedValue({
      get: vi.fn().mockImplementation((name: string) =>
        name === "ai-chat-session"
          ? { name, value: "session-token" }
          : undefined,
      ),
    });
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
    chatService.listChatSummaries.mockResolvedValue([
      {
        id: CHAT_ID,
        title: "Next.js 学习",
        createdAt: new Date("2026-03-24T11:20:51.259Z"),
        updatedAt: new Date("2026-03-25T10:07:23.524Z"),
      },
    ]);

    const data = await getHomePageData({ selectedChatId: "chat_9" });

    expect(chatService.loadChatMessages).not.toHaveBeenCalled();
    expect(data.initialChatId).toBeNull();
    expect(data.initialMessages).toEqual([]);
  });
});
