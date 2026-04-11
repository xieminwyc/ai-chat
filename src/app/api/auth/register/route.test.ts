import { beforeEach, describe, expect, it, vi } from "vitest";

const authService = vi.hoisted(() => ({
  registerUser: vi.fn(),
}));

const emailDelivery = vi.hoisted(() => ({
  sendVerificationEmail: vi.fn(),
  isEmailDeliveryError: vi.fn((error: unknown) => {
    return (
      error instanceof Error &&
      (
        error.message === "RESEND_API_KEY is required to send verification emails." ||
        error.message === "RESEND_FROM_EMAIL is required to send verification emails." ||
        error.message.startsWith("Failed to send verification email:")
      )
    );
  }),
}));

vi.mock("@/server/auth/auth-service", () => authService);
vi.mock("@/server/auth/email-delivery", () => emailDelivery);

import { POST } from "@/app/api/auth/register/route";

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

  it("returns 500 when the verification email service is not configured", async () => {
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
    emailDelivery.sendVerificationEmail.mockRejectedValue(
      createRouteError(
        "auth.email_delivery_failed",
        500,
        "Unable to send verification email",
      ),
    );

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

    expect(response.status).toBe(500);
    expect(data).toEqual({
      error: {
        code: "auth.email_delivery_failed",
        message: "Unable to send verification email",
      },
    });
  });

  it("returns a typed conflict error when the email already exists", async () => {
    authService.registerUser.mockRejectedValue(
      createRouteError(
        "auth.email_already_exists",
        409,
        "A user with this email already exists",
      ),
    );

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

    expect(response.status).toBe(409);
    expect(data).toEqual({
      error: {
        code: "auth.email_already_exists",
        message: "A user with this email already exists",
      },
    });
  });
});
