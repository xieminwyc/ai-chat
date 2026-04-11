import { beforeEach, describe, expect, it, vi } from "vitest";

const authService = vi.hoisted(() => ({
  loginUser: vi.fn(),
}));

const rateLimitPolicies = vi.hoisted(() => ({
  enforceLoginRateLimit: vi.fn(),
}));

vi.mock("@/server/auth/auth-service", () => authService);
vi.mock("@/server/rate-limit/rate-limit-policies", () => rateLimitPolicies);

import { POST } from "@/app/api/auth/login/route";

function createRouteError(
  code: string,
  httpStatus: number,
  message: string,
) {
  return Object.assign(new Error(message), {
    code,
    httpStatus,
    expose: true,
  });
}

describe("/api/auth/login route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rateLimitPolicies.enforceLoginRateLimit.mockResolvedValue(undefined);
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
          "x-forwarded-for": "203.0.113.10",
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
    expect(rateLimitPolicies.enforceLoginRateLimit).toHaveBeenCalledWith({
      email: "alice@example.com",
      ipAddress: "203.0.113.10",
    });
    expect(setCookie).toContain("ai-chat-session=session-token");
    expect(data.user.email).toBe("alice@example.com");
  });

  it("returns a typed auth error for invalid credentials", async () => {
    authService.loginUser.mockRejectedValue(
      createRouteError(
        "auth.invalid_credentials",
        401,
        "Invalid email or password",
      ),
    );

    const response = await POST(
      new Request("http://localhost:3000/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: "alice@example.com",
          password: "wrong-password",
        }),
      }),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "auth.invalid_credentials",
        message: "Invalid email or password",
      },
    });
  });

  it("returns 429 when the login rate limit has been exceeded", async () => {
    rateLimitPolicies.enforceLoginRateLimit.mockRejectedValue(
      createRouteError(
        "rate_limit.exceeded",
        429,
        "Too many login attempts. Please try again later.",
      ),
    );

    const response = await POST(
      new Request("http://localhost:3000/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-forwarded-for": "203.0.113.10",
        },
        body: JSON.stringify({
          email: "alice@example.com",
          password: "super-secret-password",
        }),
      }),
    );

    expect(response.status).toBe(429);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "rate_limit.exceeded",
        message: "Too many login attempts. Please try again later.",
      },
    });
    expect(authService.loginUser).not.toHaveBeenCalled();
  });
});
