import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const authService = vi.hoisted(() => ({
  verifyEmailToken: vi.fn(),
}));

vi.mock("@/server/auth/auth-service", () => authService);

import VerifyEmailPage from "@/app/verify-email/page";

describe("/verify-email page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders a success state for a valid token", async () => {
    authService.verifyEmailToken.mockResolvedValue({
      id: "user_1",
      email: "alice@example.com",
      emailVerifiedAt: new Date("2026-04-09T01:00:00.000Z"),
      createdAt: new Date("2026-04-08T01:00:00.000Z"),
      updatedAt: new Date("2026-04-09T01:00:00.000Z"),
    });

    render(
      await VerifyEmailPage({
        searchParams: Promise.resolve({ token: "valid-token" }),
      }),
    );

    expect(screen.getByText("邮箱验证成功")).toBeInTheDocument();
    expect(screen.getByText(/alice@example.com/)).toBeInTheDocument();
  });

  it("renders an error state for an invalid token", async () => {
    authService.verifyEmailToken.mockRejectedValue(
      new Error("Verification link has expired"),
    );

    render(
      await VerifyEmailPage({
        searchParams: Promise.resolve({ token: "expired-token" }),
      }),
    );

    expect(screen.getByText("邮箱验证失败")).toBeInTheDocument();
    expect(screen.getByText("Verification link has expired")).toBeInTheDocument();
  });
});
