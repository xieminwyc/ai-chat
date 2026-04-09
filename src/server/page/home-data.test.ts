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

const guestService = vi.hoisted(() => ({
  GUEST_MESSAGE_LIMIT: 3,
  getCurrentGuestSession: vi.fn(),
  getMergeableGuestSession: vi.fn(),
  getOrCreateGuestSession: vi.fn(),
}));

const authSession = vi.hoisted(() => ({
  getSessionCookieName: vi.fn(),
}));

const guestSession = vi.hoisted(() => ({
  getGuestAuthShellCookieName: vi.fn(),
  getGuestCookieName: vi.fn(),
}));

vi.mock("next/headers", () => nextHeaders);
vi.mock("@/server/auth/auth-service", () => authService);
vi.mock("@/server/chat/chat-service", () => chatService);
vi.mock("@/server/auth/session", () => authSession);
vi.mock("@/server/guest/guest-service", () => guestService);
vi.mock("@/server/guest/guest-session", () => guestSession);

import { getHomePageData } from "@/server/page/home-data";

describe("home-data", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authSession.getSessionCookieName.mockReturnValue("ai-chat-session");
    guestSession.getGuestAuthShellCookieName.mockReturnValue("ai-chat-auth-shell");
    guestSession.getGuestCookieName.mockReturnValue("ai-chat-guest");
    nextHeaders.cookies.mockResolvedValue({
      get: vi.fn().mockReturnValue(undefined),
    });
    authService.getCurrentSession.mockResolvedValue(null);
    guestService.getCurrentGuestSession.mockResolvedValue(null);
    guestService.getMergeableGuestSession.mockResolvedValue(null);
    guestService.getOrCreateGuestSession.mockResolvedValue({
      guestSession: {
        id: "guest_1",
        guestToken: "guest-token",
        trialMessageCount: 0,
        mergedAt: null,
        expiresAt: new Date("2026-04-22T01:00:00.000Z"),
        createdAt: new Date("2026-04-08T01:00:00.000Z"),
        updatedAt: new Date("2026-04-08T01:00:00.000Z"),
      },
      created: true,
    });
    chatService.listChatSummaries.mockResolvedValue([]);
    chatService.loadChatMessages.mockResolvedValue([]);
  });

  it("returns guest preview bootstrap state without creating a guest session when no guest cookie exists", async () => {
    const data = await getHomePageData({});

    expect(authService.getCurrentSession).toHaveBeenCalledWith(null);
    expect(guestService.getCurrentGuestSession).not.toHaveBeenCalled();
    expect(guestService.getOrCreateGuestSession).not.toHaveBeenCalled();
    expect(data).toEqual({
      viewerKind: "guest",
      isAuthenticated: false,
      currentUser: null,
      mergeCandidate: null,
      guestSession: null,
      initialChats: [],
      initialMessages: [],
      initialChatId: null,
    });
  });

  it("returns signed-out auth bootstrap state when auth-shell cookie is present", async () => {
    nextHeaders.cookies.mockResolvedValue({
      get: vi.fn().mockImplementation((name: string) =>
        name === "ai-chat-auth-shell"
          ? { name, value: "1" }
          : undefined,
      ),
    });

    const data = await getHomePageData({});

    expect(guestService.getCurrentGuestSession).not.toHaveBeenCalled();
    expect(data).toEqual({
      viewerKind: "user",
      isAuthenticated: false,
      currentUser: null,
      mergeCandidate: null,
      guestSession: null,
      initialChats: [],
      initialMessages: [],
      initialChatId: null,
    });
  });

  it("loads guest-owned chats and messages when a guest cookie is present", async () => {
    nextHeaders.cookies.mockResolvedValue({
      get: vi.fn().mockImplementation((name: string) =>
        name === "ai-chat-guest"
          ? { name, value: "guest-token" }
          : undefined,
      ),
    });
    guestService.getCurrentGuestSession.mockResolvedValue({
      id: "guest_1",
      guestToken: "guest-token",
      trialMessageCount: 1,
      mergedAt: null,
      expiresAt: new Date("2026-04-22T01:00:00.000Z"),
      createdAt: new Date("2026-04-08T01:00:00.000Z"),
      updatedAt: new Date("2026-04-08T01:00:00.000Z"),
    });
    chatService.listChatSummaries.mockResolvedValue([
      {
        id: CHAT_ID,
        title: "游客会话",
        createdAt: new Date("2026-03-24T11:20:51.259Z"),
        updatedAt: new Date("2026-03-25T10:07:23.524Z"),
      },
    ]);
    chatService.loadChatMessages.mockResolvedValue([
      {
        id: "message_1",
        role: "user",
        content: "游客历史消息",
        createdAt: new Date("2026-03-24T11:20:51.268Z"),
      },
    ]);

    const data = await getHomePageData({ selectedChatId: CHAT_ID });

    expect(guestService.getCurrentGuestSession).toHaveBeenCalledWith("guest-token");
    expect(guestService.getOrCreateGuestSession).not.toHaveBeenCalled();
    expect(chatService.listChatSummaries).toHaveBeenCalledWith({
      kind: "guest",
      guestSessionId: "guest_1",
    });
    expect(chatService.loadChatMessages).toHaveBeenCalledWith(
      { kind: "guest", guestSessionId: "guest_1" },
      CHAT_ID,
    );
    expect(data.viewerKind).toBe("guest");
    expect(data.guestSession).toEqual({
      id: "guest_1",
      trialMessageCount: 1,
      messageLimit: 3,
    });
    expect(data.initialChatId).toBe(CHAT_ID);
    expect(data.initialMessages).toEqual([
      {
        id: "message_1",
        role: "user",
        content: "游客历史消息",
        createdAt: "2026-03-24T11:20:51.268Z",
      },
    ]);
  });

  it("falls back to guest preview state when a stale guest cookie no longer maps to a session", async () => {
    nextHeaders.cookies.mockResolvedValue({
      get: vi.fn().mockImplementation((name: string) =>
        name === "ai-chat-guest"
          ? { name, value: "stale-guest-token" }
          : undefined,
      ),
    });
    guestService.getCurrentGuestSession.mockResolvedValue(null);

    const data = await getHomePageData({});

    expect(guestService.getCurrentGuestSession).toHaveBeenCalledWith(
      "stale-guest-token",
    );
    expect(chatService.listChatSummaries).not.toHaveBeenCalled();
    expect(data).toEqual({
      viewerKind: "guest",
      isAuthenticated: false,
      currentUser: null,
      mergeCandidate: null,
      guestSession: null,
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
        emailVerifiedAt: new Date("2026-04-08T03:00:00.000Z"),
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
    expect(chatService.listChatSummaries).toHaveBeenCalledWith({
      kind: "user",
      userId: "user_1",
    });
    expect(chatService.loadChatMessages).not.toHaveBeenCalled();
    expect(data).toEqual({
      viewerKind: "user",
      isAuthenticated: true,
      currentUser: {
        id: "user_1",
        email: "alice@example.com",
        emailVerifiedAt: "2026-04-08T03:00:00.000Z",
        isEmailVerified: true,
        createdAt: "2026-04-08T01:00:00.000Z",
        updatedAt: "2026-04-08T01:00:00.000Z",
      },
      mergeCandidate: null,
      guestSession: null,
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

  it("includes a merge candidate for verified users when a guest cookie is still present", async () => {
    nextHeaders.cookies.mockResolvedValue({
      get: vi.fn().mockImplementation((name: string) => {
        if (name === "ai-chat-session") {
          return { name, value: "session-token" };
        }

        if (name === "ai-chat-guest") {
          return { name, value: "guest-token" };
        }

        return undefined;
      }),
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
        emailVerifiedAt: new Date("2026-04-08T03:00:00.000Z"),
        createdAt: new Date("2026-04-08T01:00:00.000Z"),
        updatedAt: new Date("2026-04-08T01:00:00.000Z"),
      },
    });
    guestService.getMergeableGuestSession.mockResolvedValue({
      id: "guest_1",
      guestToken: "guest-token",
      trialMessageCount: 2,
      mergedAt: null,
      expiresAt: new Date("2026-04-22T01:00:00.000Z"),
      createdAt: new Date("2026-04-08T01:00:00.000Z"),
      updatedAt: new Date("2026-04-08T01:00:00.000Z"),
    });

    const data = await getHomePageData({});

    expect(guestService.getMergeableGuestSession).toHaveBeenCalledWith(
      "guest-token",
    );
    expect(data.mergeCandidate).toEqual({
      guestSessionId: "guest_1",
      trialMessageCount: 2,
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

    expect(chatService.loadChatMessages).toHaveBeenCalledWith(
      { kind: "user", userId: "user_1" },
      CHAT_ID,
    );
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
