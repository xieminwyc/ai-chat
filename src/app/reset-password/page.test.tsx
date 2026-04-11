import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/reset-password/reset-password-form", () => ({
  ResetPasswordForm: ({ token }: { token: string }) => (
    <div>Reset form token: {token}</div>
  ),
}));

import ResetPasswordPage from "@/app/reset-password/page";

describe("/reset-password page", () => {
  it("renders an error state when the token is missing", async () => {
    render(
      await ResetPasswordPage({
        searchParams: Promise.resolve({}),
      }),
    );

    expect(screen.getByText("重置密码失败")).toBeInTheDocument();
    expect(screen.getByText("Password reset link is missing")).toBeInTheDocument();
  });

  it("renders the reset form when the token is present", async () => {
    render(
      await ResetPasswordPage({
        searchParams: Promise.resolve({ token: "reset-token" }),
      }),
    );

    expect(screen.getByText("重置你的密码")).toBeInTheDocument();
    expect(screen.getByText("Reset form token: reset-token")).toBeInTheDocument();
  });
});
