import { beforeEach, describe, expect, it, vi } from "vitest";

const authService = vi.hoisted(() => ({
  requestPasswordResetForEmail: vi.fn(),
}));

const emailDelivery = vi.hoisted(() => ({
  sendPasswordResetEmail: vi.fn(),
  isEmailDeliveryError: vi.fn((error: unknown) => {
    return (
      error instanceof Error &&
      (
        error.message === "RESEND_API_KEY is required to send verification emails." ||
        error.message === "RESEND_FROM_EMAIL is required to send verification emails." ||
        error.message.startsWith("Failed to send password reset email:")
      )
    );
  }),
}));

vi.mock("@/server/auth/auth-service", () => authService);
vi.mock("@/server/auth/email-delivery", () => emailDelivery);

import { POST } from "@/app/api/auth/forgot-password/route";

describe("/api/auth/forgot-password route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns a unified success payload after sending a reset email", async () => {
    authService.requestPasswordResetForEmail.mockResolvedValue({
      email: "alice@example.com",
      resetUrl: "http://localhost:3000/reset-password?token=reset-token",
    });

    const response = await POST(
      new Request("http://localhost:3000/api/auth/forgot-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: "alice@example.com",
        }),
      }),
    );

    const data = await response.json();

    expect(response.status).toBe(202);
    expect(authService.requestPasswordResetForEmail).toHaveBeenCalledWith(
      "alice@example.com",
    );
    expect(emailDelivery.sendPasswordResetEmail).toHaveBeenCalledWith({
      email: "alice@example.com",
      resetUrl: "http://localhost:3000/reset-password?token=reset-token",
    });
    expect(data).toEqual({
      success: true,
      message: "如果该邮箱已注册，我们会向你发送重置密码邮件。",
    });
  });

  it("still returns the same success payload when the email is unknown", async () => {
    authService.requestPasswordResetForEmail.mockResolvedValue(null);

    const response = await POST(
      new Request("http://localhost:3000/api/auth/forgot-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: "nobody@example.com",
        }),
      }),
    );

    const data = await response.json();

    expect(response.status).toBe(202);
    expect(emailDelivery.sendPasswordResetEmail).not.toHaveBeenCalled();
    expect(data).toEqual({
      success: true,
      message: "如果该邮箱已注册，我们会向你发送重置密码邮件。",
    });
  });

  it("returns bad request for invalid payload", async () => {
    const response = await POST(
      new Request("http://localhost:3000/api/auth/forgot-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: "not-an-email",
        }),
      }),
    );

    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data).toEqual({ error: "Invalid forgot password payload" });
  });

  it("returns 500 when reset email delivery fails for a real user", async () => {
    authService.requestPasswordResetForEmail.mockResolvedValue({
      email: "alice@example.com",
      resetUrl: "http://localhost:3000/reset-password?token=reset-token",
    });
    emailDelivery.sendPasswordResetEmail.mockRejectedValue(
      new Error("Failed to send password reset email: delivery failed"),
    );

    const response = await POST(
      new Request("http://localhost:3000/api/auth/forgot-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: "alice@example.com",
        }),
      }),
    );

    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data).toEqual({
      error: "Failed to send password reset email: delivery failed",
    });
  });
});
