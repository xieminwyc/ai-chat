import { beforeEach, describe, expect, it, vi } from "vitest";

const authService = vi.hoisted(() => ({
  getCurrentSession: vi.fn(),
}));

const authSession = vi.hoisted(() => ({
  readSessionTokenFromCookieHeader: vi.fn(),
}));

const guestService = vi.hoisted(() => ({
  getMergeableGuestSession: vi.fn(),
  mergeGuestSessionIntoUserAccount: vi.fn(),
}));

const guestSession = vi.hoisted(() => ({
  getGuestAuthShellCookieName: vi.fn(),
  getGuestAuthShellCookieOptions: vi.fn(),
  getGuestCookieName: vi.fn(),
  getGuestCookieOptions: vi.fn(),
  readGuestTokenFromCookieHeader: vi.fn(),
}));

vi.mock("@/server/auth/auth-service", () => authService);
vi.mock("@/server/auth/session", () => authSession);
vi.mock("@/server/guest/guest-service", () => guestService);
vi.mock("@/server/guest/guest-session", () => guestSession);

import { POST } from "@/app/api/guest/merge/route";

describe("/api/guest/merge route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authSession.readSessionTokenFromCookieHeader.mockReturnValue("session-token");
    guestSession.getGuestAuthShellCookieName.mockReturnValue("ai-chat-auth-shell");
    guestSession.getGuestAuthShellCookieOptions.mockReturnValue({
      httpOnly: true,
      sameSite: "lax",
      secure: false,
      path: "/",
      maxAge: 14 * 24 * 60 * 60,
    });
    guestSession.getGuestCookieName.mockReturnValue("ai-chat-guest");
    guestSession.getGuestCookieOptions.mockReturnValue({
      httpOnly: true,
      sameSite: "lax",
      secure: false,
      path: "/",
      maxAge: 14 * 24 * 60 * 60,
    });
    guestSession.readGuestTokenFromCookieHeader.mockReturnValue("guest-token");
  });

  it("merges guest chats into a verified user account", async () => {
    authService.getCurrentSession.mockResolvedValue({
      id: "session_1",
      token: "session-token",
      userId: "user_1",
      expiresAt: new Date("2026-04-15T01:00:00.000Z"),
      createdAt: new Date("2026-04-08T01:00:00.000Z"),
      user: {
        id: "user_1",
        email: "alice@example.com",
        emailVerifiedAt: new Date("2026-04-09T03:00:00.000Z"),
        createdAt: new Date("2026-04-08T01:00:00.000Z"),
        updatedAt: new Date("2026-04-09T03:00:00.000Z"),
      },
    });
    guestService.getMergeableGuestSession.mockResolvedValue({
      id: "guest_1",
      guestToken: "guest-token",
      trialMessageCount: 2,
      mergedAt: null,
      expiresAt: new Date("2026-04-22T00:00:00.000Z"),
      createdAt: new Date("2026-04-08T00:00:00.000Z"),
      updatedAt: new Date("2026-04-08T00:00:00.000Z"),
    });
    guestService.mergeGuestSessionIntoUserAccount.mockResolvedValue({
      mergedGuestSession: {
        id: "guest_1",
      },
      mergedChatCount: 2,
    });

    const response = await POST(
      new Request("http://localhost:3000/api/guest/merge", {
        method: "POST",
        headers: {
          cookie: "ai-chat-session=session-token; ai-chat-guest=guest-token",
        },
      }),
    );
    const data = await response.json();
    const setCookie = response.headers.get("set-cookie");

    expect(response.status).toBe(200);
    expect(guestService.mergeGuestSessionIntoUserAccount).toHaveBeenCalledWith({
      guestSessionId: "guest_1",
      userId: "user_1",
    });
    expect(data).toEqual({
      success: true,
      mergedChatCount: 2,
    });
    expect(setCookie).toContain("ai-chat-guest=");
    expect(setCookie).toContain("ai-chat-auth-shell=1");
  });

  it("returns 401 when there is no authenticated session", async () => {
    authService.getCurrentSession.mockResolvedValue(null);

    const response = await POST(
      new Request("http://localhost:3000/api/guest/merge", {
        method: "POST",
      }),
    );

    expect(response.status).toBe(401);
  });

  it("returns 403 when the authenticated user is not verified", async () => {
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
        updatedAt: new Date("2026-04-09T03:00:00.000Z"),
      },
    });

    const response = await POST(
      new Request("http://localhost:3000/api/guest/merge", {
        method: "POST",
      }),
    );
    const data = await response.json();

    expect(response.status).toBe(403);
    expect(data).toEqual({
      error: "请先验证邮箱后再继续聊天。",
    });
  });

  it("returns 401 when there is no mergeable guest token", async () => {
    authService.getCurrentSession.mockResolvedValue({
      id: "session_1",
      token: "session-token",
      userId: "user_1",
      expiresAt: new Date("2026-04-15T01:00:00.000Z"),
      createdAt: new Date("2026-04-08T01:00:00.000Z"),
      user: {
        id: "user_1",
        email: "alice@example.com",
        emailVerifiedAt: new Date("2026-04-09T03:00:00.000Z"),
        createdAt: new Date("2026-04-08T01:00:00.000Z"),
        updatedAt: new Date("2026-04-09T03:00:00.000Z"),
      },
    });
    guestService.getMergeableGuestSession.mockResolvedValue(null);

    const response = await POST(
      new Request("http://localhost:3000/api/guest/merge", {
        method: "POST",
      }),
    );
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data).toEqual({
      error: "Guest session not found.",
    });
  });
});
