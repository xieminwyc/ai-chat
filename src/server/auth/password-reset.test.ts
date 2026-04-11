import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  buildPasswordResetUrl,
  createPasswordResetToken,
  getPasswordResetExpiresAt,
  hashPasswordResetToken,
} from "@/server/auth/password-reset";

describe("password-reset", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      APP_URL: "http://localhost:3000",
    };
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.useRealTimers();
  });

  it("creates a raw reset token", () => {
    expect(createPasswordResetToken()).toMatch(/^[a-f0-9]{64}$/);
  });

  it("hashes a reset token", () => {
    expect(hashPasswordResetToken("reset-token")).toHaveLength(64);
  });

  it("computes reset expiry time", () => {
    const now = new Date("2026-04-11T09:00:00.000Z");
    vi.useFakeTimers();
    vi.setSystemTime(now);

    expect(getPasswordResetExpiresAt().toISOString()).toBe(
      "2026-04-11T10:00:00.000Z",
    );
  });

  it("builds the reset-password URL", () => {
    expect(buildPasswordResetUrl("reset-token")).toBe(
      "http://localhost:3000/reset-password?token=reset-token",
    );
  });
});
