import { beforeEach, describe, expect, it, vi } from "vitest";

const authService = vi.hoisted(() => ({
  resetPasswordWithToken: vi.fn(),
}));

vi.mock("@/server/auth/auth-service", () => authService);

import { POST } from "@/app/api/auth/reset-password/route";

describe("/api/auth/reset-password route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("resets the password when the token is valid", async () => {
    authService.resetPasswordWithToken.mockResolvedValue({
      id: "user_1",
      email: "alice@example.com",
    });

    const response = await POST(
      new Request("http://localhost:3000/api/auth/reset-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          token: "reset-token",
          nextPassword: "brand-new-password",
          confirmPassword: "brand-new-password",
        }),
      }),
    );

    const data = await response.json();

    expect(response.status).toBe(200);
    expect(authService.resetPasswordWithToken).toHaveBeenCalledWith({
      token: "reset-token",
      nextPassword: "brand-new-password",
    });
    expect(data).toEqual({ success: true });
  });

  it("returns bad request for invalid payload", async () => {
    const response = await POST(
      new Request("http://localhost:3000/api/auth/reset-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          token: "",
          nextPassword: "short",
          confirmPassword: "mismatch",
        }),
      }),
    );

    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data).toEqual({ error: "Invalid password reset payload" });
  });

  it("returns bad request when the reset token is invalid", async () => {
    authService.resetPasswordWithToken.mockRejectedValue(
      new Error("Password reset link is invalid or has already been used"),
    );

    const response = await POST(
      new Request("http://localhost:3000/api/auth/reset-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          token: "reset-token",
          nextPassword: "brand-new-password",
          confirmPassword: "brand-new-password",
        }),
      }),
    );

    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data).toEqual({
      error: "Password reset link is invalid or has already been used",
    });
  });
});
