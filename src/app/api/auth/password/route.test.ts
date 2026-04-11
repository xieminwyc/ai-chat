import { beforeEach, describe, expect, it, vi } from "vitest";

const authService = vi.hoisted(() => ({
  changePasswordForUser: vi.fn(),
  getCurrentSession: vi.fn(),
}));

vi.mock("@/server/auth/auth-service", () => authService);

import { POST } from "@/app/api/auth/password/route";

function createRouteError(
  code: string,
  httpStatus: number,
  message: string,
) {
  return Object.assign(new Error(message), {
    code,
    httpStatus,
    expose: true,
  });
}

describe("/api/auth/password route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns unauthorized when there is no session", async () => {
    authService.getCurrentSession.mockResolvedValue(null);

    const response = await POST(
      new Request("http://localhost:3000/api/auth/password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          currentPassword: "old-password",
          nextPassword: "brand-new-password",
          confirmPassword: "brand-new-password",
        }),
      }),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "auth.unauthorized",
        message: "Unauthorized",
      },
    });
  });

  it("returns bad request for invalid payload", async () => {
    authService.getCurrentSession.mockResolvedValue({
      user: { id: "user_1" },
    });

    const response = await POST(
      new Request("http://localhost:3000/api/auth/password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          currentPassword: "",
          nextPassword: "short",
          confirmPassword: "mismatch",
        }),
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "auth.invalid_payload",
        message: "Invalid password change payload",
      },
    });
  });

  it("changes password for an authenticated user", async () => {
    authService.getCurrentSession.mockResolvedValue({
      user: { id: "user_1" },
    });
    authService.changePasswordForUser.mockResolvedValue({
      id: "user_1",
      email: "alice@example.com",
    });

    const response = await POST(
      new Request("http://localhost:3000/api/auth/password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          currentPassword: "old-password",
          nextPassword: "brand-new-password",
          confirmPassword: "brand-new-password",
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(authService.changePasswordForUser).toHaveBeenCalledWith({
      userId: "user_1",
      currentPassword: "old-password",
      nextPassword: "brand-new-password",
    });
  });

  it("returns a typed client error when the current password is wrong", async () => {
    authService.getCurrentSession.mockResolvedValue({
      user: { id: "user_1" },
    });
    authService.changePasswordForUser.mockRejectedValue(
      createRouteError(
        "auth.current_password_incorrect",
        400,
        "Current password is incorrect",
      ),
    );

    const response = await POST(
      new Request("http://localhost:3000/api/auth/password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          currentPassword: "wrong-password",
          nextPassword: "brand-new-password",
          confirmPassword: "brand-new-password",
        }),
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "auth.current_password_incorrect",
        message: "Current password is incorrect",
      },
    });
  });
});
