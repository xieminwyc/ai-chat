import { beforeEach, describe, expect, it, vi } from "vitest";

const authService = vi.hoisted(() => ({
  getCurrentSession: vi.fn(),
  resendVerificationEmailForUser: vi.fn(),
}));

const authSession = vi.hoisted(() => ({
  readSessionTokenFromCookieHeader: vi.fn(),
}));

const emailDelivery = vi.hoisted(() => ({
  sendVerificationEmail: vi.fn(),
}));

vi.mock("@/server/auth/auth-service", () => authService);
vi.mock("@/server/auth/session", () => authSession);
vi.mock("@/server/auth/email-delivery", () => emailDelivery);

import { POST } from "@/app/api/auth/resend-verification/route";

describe("/api/auth/resend-verification route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authSession.readSessionTokenFromCookieHeader.mockReturnValue("session-token");
  });

  it("resends verification for an authenticated unverified user", async () => {
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
    authService.resendVerificationEmailForUser.mockResolvedValue({
      email: "alice@example.com",
      verificationUrl: "http://localhost:3000/verify-email?token=verify-token",
    });

    const response = await POST(
      new Request("http://localhost:3000/api/auth/resend-verification", {
        method: "POST",
        headers: {
          cookie: "ai-chat-session=session-token",
        },
      }),
    );

    const data = await response.json();

    expect(response.status).toBe(202);
    expect(authService.getCurrentSession).toHaveBeenCalledWith("session-token");
    expect(authService.resendVerificationEmailForUser).toHaveBeenCalledWith(
      "user_1",
    );
    expect(emailDelivery.sendVerificationEmail).toHaveBeenCalledWith({
      email: "alice@example.com",
      verificationUrl: "http://localhost:3000/verify-email?token=verify-token",
    });
    expect(data).toEqual({ success: true });
  });
});
