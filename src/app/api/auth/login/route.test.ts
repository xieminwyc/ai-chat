import { beforeEach, describe, expect, it, vi } from "vitest";

const authService = vi.hoisted(() => ({
  loginUser: vi.fn(),
}));

vi.mock("@/server/auth/auth-service", () => authService);

import { POST } from "@/app/api/auth/login/route";

describe("/api/auth/login route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("logs a user in and sets the session cookie", async () => {
    authService.loginUser.mockResolvedValue({
      sessionToken: "session-token",
      expiresAt: new Date("2026-04-15T01:00:00.000Z"),
      user: {
        id: "user_1",
        email: "alice@example.com",
        createdAt: new Date("2026-04-08T01:00:00.000Z"),
        updatedAt: new Date("2026-04-08T01:00:00.000Z"),
      },
    });

    const response = await POST(
      new Request("http://localhost:3000/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: "alice@example.com",
          password: "super-secret-password",
        }),
      }),
    );

    const data = await response.json();
    const setCookie = response.headers.get("set-cookie");

    expect(response.status).toBe(200);
    expect(setCookie).toContain("ai-chat-session=session-token");
    expect(data.user.email).toBe("alice@example.com");
  });
});
