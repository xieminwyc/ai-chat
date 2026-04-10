import { beforeEach, describe, expect, it, vi } from "vitest";

const CHAT_ID = "cchat000001";

const nextHeaders = vi.hoisted(() => ({
  cookies: vi.fn(),
}));

const entryState = vi.hoisted(() => ({
  resolveEntryStateFromCookieStore: vi.fn(),
}));

const chatService = vi.hoisted(() => ({
  listChatSummaries: vi.fn(),
  loadChatMessages: vi.fn(),
}));

const guestService = vi.hoisted(() => ({
  GUEST_MESSAGE_LIMIT: 3,
}));

vi.mock("next/headers", () => nextHeaders);
vi.mock("@/server/auth/entry-state", () => entryState);
vi.mock("@/server/chat/chat-service", () => chatService);
vi.mock("@/server/guest/guest-service", () => guestService);

import { getHomePageData } from "@/server/page/home-data";

describe("home-data", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    nextHeaders.cookies.mockResolvedValue({
      get: vi.fn().mockReturnValue(undefined),
    });
    entryState.resolveEntryStateFromCookieStore.mockResolvedValue({
      kind: "signed_out_guest_preview",
    });
    chatService.listChatSummaries.mockResolvedValue([]);
    chatService.loadChatMessages.mockResolvedValue([]);
  });

  it("returns guest preview with no guest session and no initial chats", async () => {
    const data = await getHomePageData({});

    expect(entryState.resolveEntryStateFromCookieStore).toHaveBeenCalledTimes(1);
    expect(chatService.listChatSummaries).not.toHaveBeenCalled();
    expect(chatService.loadChatMessages).not.toHaveBeenCalled();
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

  it("returns signed-out auth shell state with viewerKind user and authenticated false", async () => {
    entryState.resolveEntryStateFromCookieStore.mockResolvedValue({
      kind: "signed_out_auth_shell",
    });

    const data = await getHomePageData({});

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

  it("loads guest-owned chats from signed_out_guest_workspace", async () => {
    entryState.resolveEntryStateFromCookieStore.mockResolvedValue({
      kind: "signed_out_guest_workspace",
      guestSession: {
        id: "guest_1",
        trialMessageCount: 1,
      },
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

    expect(chatService.listChatSummaries).toHaveBeenCalledWith({
      kind: "guest",
      guestSessionId: "guest_1",
    });
    expect(chatService.loadChatMessages).toHaveBeenCalledWith(
      { kind: "guest", guestSessionId: "guest_1" },
      CHAT_ID,
    );
    expect(data.guestSession).toEqual({
      id: "guest_1",
      trialMessageCount: 1,
      messageLimit: 3,
    });
    expect(data).toEqual({
      viewerKind: "guest",
      isAuthenticated: false,
      currentUser: null,
      mergeCandidate: null,
      guestSession: {
        id: "guest_1",
        trialMessageCount: 1,
        messageLimit: 3,
      },
      initialChats: [
        {
          id: CHAT_ID,
          title: "游客会话",
          createdAt: "2026-03-24T11:20:51.259Z",
          updatedAt: "2026-03-25T10:07:23.524Z",
        },
      ],
      initialMessages: [
        {
          id: "message_1",
          role: "user",
          content: "游客历史消息",
          createdAt: "2026-03-24T11:20:51.268Z",
        },
      ],
      initialChatId: CHAT_ID,
    });
  });

  it("loads user-owned chats for authenticated_verified and preserves mergeCandidate", async () => {
    entryState.resolveEntryStateFromCookieStore.mockResolvedValue({
      kind: "authenticated_verified",
      user: {
        id: "user_1",
        email: "alice@example.com",
        emailVerifiedAt: new Date("2026-04-08T03:00:00.000Z"),
        createdAt: new Date("2026-04-08T01:00:00.000Z"),
        updatedAt: new Date("2026-04-08T01:00:00.000Z"),
      },
      mergeCandidate: {
        guestSessionId: "guest_1",
        trialMessageCount: 2,
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
        role: "assistant",
        content: "已加载用户会话",
        createdAt: new Date("2026-03-24T11:20:51.268Z"),
      },
    ]);

    const data = await getHomePageData({ selectedChatId: CHAT_ID });

    expect(chatService.listChatSummaries).toHaveBeenCalledWith({
      kind: "user",
      userId: "user_1",
    });
    expect(chatService.loadChatMessages).toHaveBeenCalledWith(
      { kind: "user", userId: "user_1" },
      CHAT_ID,
    );
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
      mergeCandidate: {
        guestSessionId: "guest_1",
        trialMessageCount: 2,
      },
      guestSession: null,
      initialChats: [
        {
          id: CHAT_ID,
          title: "Next.js 学习",
          createdAt: "2026-03-24T11:20:51.259Z",
          updatedAt: "2026-03-25T10:07:23.524Z",
        },
      ],
      initialMessages: [
        {
          id: "message_1",
          role: "assistant",
          content: "已加载用户会话",
          createdAt: "2026-03-24T11:20:51.268Z",
        },
      ],
      initialChatId: CHAT_ID,
    });
  });

  it("loads user-owned chats for authenticated_unverified and never exposes mergeCandidate", async () => {
    entryState.resolveEntryStateFromCookieStore.mockResolvedValue({
      kind: "authenticated_unverified",
      user: {
        id: "user_1",
        email: "alice@example.com",
        emailVerifiedAt: null,
        createdAt: new Date("2026-04-08T01:00:00.000Z"),
        updatedAt: new Date("2026-04-08T01:00:00.000Z"),
      },
      mergeCandidate: null,
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
        emailVerifiedAt: null,
        isEmailVerified: false,
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
});
