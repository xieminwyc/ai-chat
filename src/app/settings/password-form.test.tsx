import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { PasswordForm } from "@/app/settings/password-form";

describe("PasswordForm", () => {
  it("submits successfully and shows success feedback", async () => {
    const user = userEvent.setup();
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    render(<PasswordForm />);

    await user.type(screen.getByLabelText("当前密码"), "old-password");
    await user.type(screen.getByLabelText("新密码"), "brand-new-password");
    await user.type(screen.getByLabelText("确认新密码"), "brand-new-password");
    await user.click(screen.getByRole("button", { name: "更新密码" }));

    expect(global.fetch).toHaveBeenCalledWith("/api/auth/password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        currentPassword: "old-password",
        nextPassword: "brand-new-password",
        confirmPassword: "brand-new-password",
      }),
    });
    expect(await screen.findByText("密码已更新。")).toBeInTheDocument();
  });

  it("shows API error feedback", async () => {
    const user = userEvent.setup();
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: "Current password is incorrect" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      }),
    );

    render(<PasswordForm />);

    await user.type(screen.getByLabelText("当前密码"), "wrong-password");
    await user.type(screen.getByLabelText("新密码"), "brand-new-password");
    await user.type(screen.getByLabelText("确认新密码"), "brand-new-password");
    await user.click(screen.getByRole("button", { name: "更新密码" }));

    expect(
      await screen.findByText("Current password is incorrect"),
    ).toBeInTheDocument();
  });

  it("shows a readable message when the API returns a structured error", async () => {
    const user = userEvent.setup();
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          error: {
            code: "auth.current_password_incorrect",
            message: "Current password is incorrect",
          },
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );

    render(<PasswordForm />);

    await user.type(screen.getByLabelText("当前密码"), "wrong-password");
    await user.type(screen.getByLabelText("新密码"), "brand-new-password");
    await user.type(screen.getByLabelText("确认新密码"), "brand-new-password");
    await user.click(screen.getByRole("button", { name: "更新密码" }));

    expect(
      await screen.findByText("Current password is incorrect"),
    ).toBeInTheDocument();
  });
});
