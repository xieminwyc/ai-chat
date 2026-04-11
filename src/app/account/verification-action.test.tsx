import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { VerificationAction } from "@/app/account/verification-action";

describe("VerificationAction", () => {
  it("shows a completed state for verified users", () => {
    render(<VerificationAction isEmailVerified />);

    expect(screen.getByText("邮箱已验证")).toBeInTheDocument();
    expect(
      screen.getByText("当前账号已经完成验证，无需额外操作。"),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "重新发送验证邮件" }),
    ).not.toBeInTheDocument();
  });

  it("posts to resend verification and shows success feedback", async () => {
    const user = userEvent.setup();
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ success: true }), {
        status: 202,
        headers: { "Content-Type": "application/json" },
      }),
    );

    render(<VerificationAction isEmailVerified={false} />);

    await user.click(screen.getByRole("button", { name: "重新发送验证邮件" }));

    expect(fetchSpy).toHaveBeenCalledWith("/api/auth/resend-verification", {
      method: "POST",
    });
    expect(
      await screen.findByText("验证邮件已重新发送，请检查邮箱。"),
    ).toBeInTheDocument();
  });

  it("shows an error message when resend verification fails", async () => {
    const user = userEvent.setup();

    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      }),
    );

    render(<VerificationAction isEmailVerified={false} />);

    await user.click(screen.getByRole("button", { name: "重新发送验证邮件" }));

    expect(await screen.findByText("Unauthorized")).toBeInTheDocument();
  });

  it("shows a readable message when resend verification returns a structured error", async () => {
    const user = userEvent.setup();

    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          error: {
            code: "auth.email_already_verified",
            message: "Email is already verified",
          },
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );

    render(<VerificationAction isEmailVerified={false} />);

    await user.click(screen.getByRole("button", { name: "重新发送验证邮件" }));

    expect(await screen.findByText("Email is already verified")).toBeInTheDocument();
  });
});
