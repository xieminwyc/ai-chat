import { beforeEach, describe, expect, it, vi } from "vitest";

const authService = vi.hoisted(() => ({
  logoutUser: vi.fn(),
}));

vi.mock("@/server/auth/auth-service", () => authService);

import { POST } from "@/app/api/auth/logout/route";

describe("/api/auth/logout route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("logs a user out and clears the session cookie", async () => {
    const response = await POST(
      new Request("http://localhost:3000/api/auth/logout", {
        method: "POST",
        headers: {
          cookie: "ai-chat-session=session-token",
        },
      }),
    );

    const data = await response.json();
    const setCookie = response.headers.get("set-cookie");

    expect(authService.logoutUser).toHaveBeenCalledWith("session-token");
    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(setCookie).toContain("ai-chat-session=");
    expect(setCookie).toContain("Max-Age=0");
  });
});
