import { beforeEach, describe, expect, it, vi } from "vitest";

const authService = vi.hoisted(() => ({
  registerUser: vi.fn(),
}));

vi.mock("@/server/auth/auth-service", () => authService);

import { POST } from "@/app/api/auth/register/route";

describe("/api/auth/register route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("registers a user and returns a safe payload", async () => {
    authService.registerUser.mockResolvedValue({
      id: "user_1",
      email: "alice@example.com",
      createdAt: new Date("2026-04-08T01:00:00.000Z"),
      updatedAt: new Date("2026-04-08T01:00:00.000Z"),
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
    expect(data.user).toMatchObject({
      id: "user_1",
      email: "alice@example.com",
    });
    expect(data.user.passwordHash).toBeUndefined();
  });
});
