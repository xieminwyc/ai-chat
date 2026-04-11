import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const resendState = vi.hoisted(() => ({
  send: vi.fn(),
  apiKey: null as string | null,
}));

vi.mock("resend", () => ({
  Resend: class MockResend {
    constructor(apiKey: string) {
      resendState.apiKey = apiKey;
    }

    emails = {
      send: resendState.send,
    };
  },
}));

import {
  sendPasswordResetEmail,
  sendVerificationEmail,
} from "@/server/auth/email-delivery";

describe("email-delivery", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    resendState.apiKey = null;
    process.env = {
      ...originalEnv,
      RESEND_API_KEY: "resend_test_key",
      RESEND_FROM_EMAIL: "AI Chat <onboarding@example.com>",
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("throws when resend env vars are missing", async () => {
    delete process.env.RESEND_API_KEY;

    await expect(
      sendVerificationEmail({
        email: "alice@example.com",
        verificationUrl: "http://localhost:3000/verify-email?token=test",
      }),
    ).rejects.toMatchObject({
      code: "auth.email_delivery_failed",
      httpStatus: 500,
      message: "Unable to send verification email",
    });
  });

  it("sends a verification email through Resend", async () => {
    resendState.send.mockResolvedValue({
      data: {
        id: "email_123",
      },
      error: null,
    });

    await sendVerificationEmail({
      email: "alice@example.com",
      verificationUrl: "http://localhost:3000/verify-email?token=test-token",
    });

    expect(resendState.apiKey).toBe("resend_test_key");
    expect(resendState.send).toHaveBeenCalledWith({
      from: "AI Chat <onboarding@example.com>",
      to: ["alice@example.com"],
      subject: "验证你的 AI Chat 邮箱",
      html: expect.stringContaining(
        "http://localhost:3000/verify-email?token=test-token",
      ),
      text: expect.stringContaining(
        "http://localhost:3000/verify-email?token=test-token",
      ),
    });
  });

  it("sends a password reset email through Resend", async () => {
    resendState.send.mockResolvedValue({
      data: {
        id: "email_456",
      },
      error: null,
    });

    await sendPasswordResetEmail({
      email: "alice@example.com",
      resetUrl: "http://localhost:3000/reset-password?token=reset-token",
    });

    expect(resendState.send).toHaveBeenCalledWith({
      from: "AI Chat <onboarding@example.com>",
      to: ["alice@example.com"],
      subject: "重置你的 AI Chat 密码",
      html: expect.stringContaining(
        "http://localhost:3000/reset-password?token=reset-token",
      ),
      text: expect.stringContaining(
        "http://localhost:3000/reset-password?token=reset-token",
      ),
    });
  });
});
