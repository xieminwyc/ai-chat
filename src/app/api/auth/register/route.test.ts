import { beforeEach, describe, expect, it, vi } from "vitest";

const authService = vi.hoisted(() => ({
  registerUser: vi.fn(),
}));

const emailDelivery = vi.hoisted(() => ({
  sendVerificationEmail: vi.fn(),
}));

vi.mock("@/server/auth/auth-service", () => authService);
vi.mock("@/server/auth/email-delivery", () => emailDelivery);

import { POST } from "@/app/api/auth/register/route";

describe("/api/auth/register route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("registers a user and returns a safe payload", async () => {
    authService.registerUser.mockResolvedValue({
      user: {
        id: "user_1",
        email: "alice@example.com",
        emailVerifiedAt: null,
        createdAt: new Date("2026-04-08T01:00:00.000Z"),
        updatedAt: new Date("2026-04-08T01:00:00.000Z"),
      },
      email: "alice@example.com",
      verificationUrl: "http://localhost:3000/verify-email?token=verify-token",
    });

    const response = await POST(
      new Request("http://localhost:3000/api/auth/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: "alice@example.com",
          password: "super-secret-password",
        }),
      }),
    );

    const data = await response.json();

    expect(response.status).toBe(201);
    expect(authService.registerUser).toHaveBeenCalledWith({
      email: "alice@example.com",
      password: "super-secret-password",
    });
    expect(emailDelivery.sendVerificationEmail).toHaveBeenCalledWith({
      email: "alice@example.com",
      verificationUrl: "http://localhost:3000/verify-email?token=verify-token",
    });
    expect(data.user).toMatchObject({
      id: "user_1",
      email: "alice@example.com",
    });
    expect(data.user.passwordHash).toBeUndefined();
    expect(data.requiresEmailVerification).toBe(true);
  });
});
