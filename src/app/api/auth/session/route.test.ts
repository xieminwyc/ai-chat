import { beforeEach, describe, expect, it, vi } from "vitest";

const authService = vi.hoisted(() => ({
  getCurrentSession: vi.fn(),
}));

vi.mock("@/server/auth/auth-service", () => authService);

import { GET } from "@/app/api/auth/session/route";

describe("/api/auth/session route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
    });
  });

  it("returns signed-out state when the session is missing", async () => {
    authService.getCurrentSession.mockResolvedValue(null);

    const response = await GET(
      new Request("http://localhost:3000/api/auth/session"),
    );

    const data = await response.json();

    expect(data).toEqual({
      authenticated: false,
      user: null,
    });
  });
});
