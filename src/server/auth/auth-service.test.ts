import { beforeEach, describe, expect, it, vi } from "vitest";

const repository = vi.hoisted(() => ({
  createSessionRecord: vi.fn(),
  createUser: vi.fn(),
  deleteSessionByToken: vi.fn(),
  findSessionByToken: vi.fn(),
  findUserByEmail: vi.fn(),
}));

const password = vi.hoisted(() => ({
  hashPassword: vi.fn(),
  verifyPassword: vi.fn(),
}));

const session = vi.hoisted(() => ({
  createSessionToken: vi.fn(),
  getSessionExpiresAt: vi.fn(),
}));

vi.mock("@/server/auth/auth-repository", () => repository);
vi.mock("@/server/auth/password", () => password);
vi.mock("@/server/auth/session", () => session);

import {
  getCurrentSession,
  loginUser,
  logoutUser,
  registerUser,
} from "@/server/auth/auth-service";

describe("auth-service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects duplicate registration attempts", async () => {
    repository.findUserByEmail.mockResolvedValue({
      id: "user_1",
      email: "alice@example.com",
      passwordHash: "hashed-password",
      createdAt: new Date("2026-04-08T01:00:00.000Z"),
      updatedAt: new Date("2026-04-08T01:00:00.000Z"),
    });

    await expect(
      registerUser({
        email: "alice@example.com",
        password: "super-secret-password",
      }),
    ).rejects.toThrow("A user with this email already exists");
  });

  it("hashes the password before creating a user", async () => {
    repository.findUserByEmail.mockResolvedValue(null);
    password.hashPassword.mockResolvedValue("hashed-password");
    repository.createUser.mockResolvedValue({
      id: "user_1",
      email: "alice@example.com",
      createdAt: new Date("2026-04-08T01:00:00.000Z"),
      updatedAt: new Date("2026-04-08T01:00:00.000Z"),
    });

    await registerUser({
      email: "alice@example.com",
      password: "super-secret-password",
    });

    expect(password.hashPassword).toHaveBeenCalledWith("super-secret-password");
    expect(repository.createUser).toHaveBeenCalledWith({
      email: "alice@example.com",
      passwordHash: "hashed-password",
    });
  });

  it("rejects login when the password is wrong", async () => {
    repository.findUserByEmail.mockResolvedValue({
      id: "user_1",
      email: "alice@example.com",
      passwordHash: "hashed-password",
      createdAt: new Date("2026-04-08T01:00:00.000Z"),
      updatedAt: new Date("2026-04-08T01:00:00.000Z"),
    });
    password.verifyPassword.mockResolvedValue(false);

    await expect(
      loginUser({
        email: "alice@example.com",
        password: "wrong-password",
      }),
    ).rejects.toThrow("Invalid email or password");
  });

  it("creates a session token and session record on login", async () => {
    const expiresAt = new Date("2026-04-15T01:00:00.000Z");

    repository.findUserByEmail.mockResolvedValue({
      id: "user_1",
      email: "alice@example.com",
      passwordHash: "hashed-password",
      createdAt: new Date("2026-04-08T01:00:00.000Z"),
      updatedAt: new Date("2026-04-08T01:00:00.000Z"),
    });
    password.verifyPassword.mockResolvedValue(true);
    session.createSessionToken.mockReturnValue("session-token");
    session.getSessionExpiresAt.mockReturnValue(expiresAt);
    repository.createSessionRecord.mockResolvedValue({
      id: "session_1",
      token: "session-token",
      userId: "user_1",
      expiresAt,
      createdAt: new Date("2026-04-08T01:00:00.000Z"),
    });

    const result = await loginUser({
      email: "alice@example.com",
      password: "super-secret-password",
    });

    expect(repository.createSessionRecord).toHaveBeenCalledWith({
      token: "session-token",
      userId: "user_1",
      expiresAt: expect.any(Date),
    });
    expect(result.sessionToken).toBe("session-token");
  });

  it("deletes the session token on logout", async () => {
    await logoutUser("session-token");

    expect(repository.deleteSessionByToken).toHaveBeenCalledWith("session-token");
  });

  it("returns null when there is no active session token", async () => {
    await expect(getCurrentSession(undefined)).resolves.toBeNull();
    expect(repository.findSessionByToken).not.toHaveBeenCalled();
  });
});
