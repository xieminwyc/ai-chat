import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ResetPasswordForm } from "@/app/reset-password/reset-password-form";

describe("ResetPasswordForm", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("submits a valid reset-password request and switches to a success state", async () => {
    const user = userEvent.setup();

    vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
      }),
    } as Response);

    render(<ResetPasswordForm token="reset-token" />);

    await user.type(screen.getByLabelText("新密码"), "brand-new-password");
    await user.type(screen.getByLabelText("确认新密码"), "brand-new-password");
    await user.click(screen.getByRole("button", { name: "更新密码" }));

    expect(global.fetch).toHaveBeenCalledWith("/api/auth/reset-password", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        token: "reset-token",
        nextPassword: "brand-new-password",
        confirmPassword: "brand-new-password",
      }),
    });
    expect(await screen.findByText("密码重置成功")).toBeInTheDocument();
    expect(
      screen.getByText("你的密码已经更新完成，不需要再次重复重置。"),
    ).toBeInTheDocument();
    expect(screen.getByText("现在可以返回登录继续使用账号。")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "返回登录" })).toHaveAttribute(
      "href",
      "/",
    );
    expect(screen.queryByLabelText("新密码")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("确认新密码")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "更新密码" })).not.toBeInTheDocument();
  });

  it("shows server error feedback when reset fails", async () => {
    const user = userEvent.setup();

    vi.spyOn(global, "fetch").mockResolvedValue({
      ok: false,
      json: async () => ({
        error: "Password reset link has expired",
      }),
    } as Response);

    render(<ResetPasswordForm token="expired-token" />);

    await user.type(screen.getByLabelText("新密码"), "brand-new-password");
    await user.type(screen.getByLabelText("确认新密码"), "brand-new-password");
    await user.click(screen.getByRole("button", { name: "更新密码" }));

    expect(
      await screen.findByText("Password reset link has expired"),
    ).toBeInTheDocument();
  });

  it("shows a readable message when reset fails with a structured error", async () => {
    const user = userEvent.setup();

    vi.spyOn(global, "fetch").mockResolvedValue({
      ok: false,
      json: async () => ({
        error: {
          code: "auth.password_reset_token_expired",
          message: "Password reset link has expired",
        },
      }),
    } as Response);

    render(<ResetPasswordForm token="expired-token" />);

    await user.type(screen.getByLabelText("新密码"), "brand-new-password");
    await user.type(screen.getByLabelText("确认新密码"), "brand-new-password");
    await user.click(screen.getByRole("button", { name: "更新密码" }));

    expect(
      await screen.findByText("Password reset link has expired"),
    ).toBeInTheDocument();
  });
});
