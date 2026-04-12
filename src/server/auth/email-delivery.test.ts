import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const enqueueJobMock = vi.hoisted(() => vi.fn());

vi.mock("@/server/queue/queue-service", () => ({
  enqueueJob: enqueueJobMock,
}));

import {
  sendPasswordResetEmail,
  sendVerificationEmail,
} from "@/server/auth/email-delivery";

describe("email-delivery (async queue)", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    enqueueJobMock.mockResolvedValue(undefined);
    process.env = {
      ...originalEnv,
      RESEND_API_KEY: "resend_test_key",
      RESEND_FROM_EMAIL: "AI Chat <onboarding@example.com>",
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("enqueues a verification email job", async () => {
    await sendVerificationEmail({
      email: "alice@example.com",
      verificationUrl: "http://localhost:3000/verify-email?token=test-token",
    });

    expect(enqueueJobMock).toHaveBeenCalledWith(
      "SEND_VERIFICATION_EMAIL",
      {
        to: "alice@example.com",
        subject: "验证你的 AI Chat 邮箱",
        verificationUrl: "http://localhost:3000/verify-email?token=test-token",
      },
    );
  });

  it("enqueues a password reset email job", async () => {
    await sendPasswordResetEmail({
      email: "alice@example.com",
      resetUrl: "http://localhost:3000/reset-password?token=reset-token",
    });

    expect(enqueueJobMock).toHaveBeenCalledWith(
      "SEND_PASSWORD_RESET_EMAIL",
      {
        to: "alice@example.com",
        subject: "重置你的 AI Chat 密码",
        resetUrl: "http://localhost:3000/reset-password?token=reset-token",
      },
    );
  });
});
