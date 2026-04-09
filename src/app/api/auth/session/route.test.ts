import { beforeEach, describe, expect, it, vi } from "vitest";

const authService = vi.hoisted(() => ({
  getCurrentSession: vi.fn(),
}));

const guestService = vi.hoisted(() => ({
  GUEST_MESSAGE_LIMIT: 3,
  getOrCreateGuestSession: vi.fn(),
}));

const guestSession = vi.hoisted(() => ({
  getGuestCookieName: vi.fn(),
  getGuestCookieOptions: vi.fn(),
  readGuestTokenFromCookieHeader: vi.fn(),
}));

vi.mock("@/server/auth/auth-service", () => authService);
vi.mock("@/server/guest/guest-service", () => guestService);
vi.mock("@/server/guest/guest-session", () => guestSession);

import { GET } from "@/app/api/auth/session/route";

describe("/api/auth/session route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    guestSession.getGuestCookieName.mockReturnValue("ai-chat-guest");
    guestSession.getGuestCookieOptions.mockReturnValue({
      httpOnly: true,
      sameSite: "lax",
      secure: false,
      path: "/",
      maxAge: 14 * 24 * 60 * 60,
    });
    guestSession.readGuestTokenFromCookieHeader.mockReturnValue(null);
  });

  it("returns the authenticated user when a session is valid", async () => {
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

    const response = await GET(
      new Request("http://localhost:3000/api/auth/session", {
        headers: {
          cookie: "ai-chat-session=session-token",
        },
      }),
    );

    const data = await response.json();

    expect(authService.getCurrentSession).toHaveBeenCalledWith("session-token");
    expect(data).toMatchObject({
      authenticated: true,
      user: {
        id: "user_1",
        email: "alice@example.com",
      },
      guest: null,
    });
  });

  it("returns guest state and writes the guest cookie when the session is missing", async () => {
    authService.getCurrentSession.mockResolvedValue(null);
    guestService.getOrCreateGuestSession.mockResolvedValue({
      guestSession: {
        id: "guest_1",
        guestToken: "guest-token",
        trialMessageCount: 1,
      },
      created: true,
    });

    const response = await GET(
      new Request("http://localhost:3000/api/auth/session"),
    );

    const data = await response.json();

    expect(data).toEqual({
      authenticated: false,
      user: null,
      guest: {
        active: true,
        trialMessageCount: 1,
        messageLimit: 3,
      },
    });
    expect(response.headers.get("set-cookie")).toContain("ai-chat-guest=guest-token");
  });
});
