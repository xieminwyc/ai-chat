import { beforeEach, describe, expect, it, vi } from "vitest";

const repository = vi.hoisted(() => ({
  createEmailVerificationToken: vi.fn(),
  createSessionRecord: vi.fn(),
  createUser: vi.fn(),
  deleteUnusedEmailVerificationTokensByUserId: vi.fn(),
  deleteSessionByToken: vi.fn(),
  findEmailVerificationTokenByHash: vi.fn(),
  findSessionByToken: vi.fn(),
  findUserByEmail: vi.fn(),
  findUserById: vi.fn(),
  markEmailVerificationTokenUsed: vi.fn(),
  markUserEmailVerified: vi.fn(),
}));

const password = vi.hoisted(() => ({
  hashPassword: vi.fn(),
  verifyPassword: vi.fn(),
}));

const session = vi.hoisted(() => ({
  createSessionToken: vi.fn(),
  getSessionExpiresAt: vi.fn(),
}));

const emailVerification = vi.hoisted(() => ({
  buildEmailVerificationUrl: vi.fn(),
  createEmailVerificationToken: vi.fn(),
  getEmailVerificationExpiresAt: vi.fn(),
  hashEmailVerificationToken: vi.fn(),
}));

vi.mock("@/server/auth/auth-repository", () => repository);
vi.mock("@/server/auth/email-verification", () => emailVerification);
vi.mock("@/server/auth/password", () => password);
vi.mock("@/server/auth/session", () => session);

import {
  getCurrentSession,
  loginUser,
  logoutUser,
  registerUser,
  resendVerificationEmailForUser,
  verifyEmailToken,
} from "@/server/auth/auth-service";

describe("auth-service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects duplicate registration attempts", async () => {
    repository.findUserByEmail.mockResolvedValue({
      id: "user_1",
      email: "alice@example.com",
      emailVerifiedAt: null,
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
    const verificationExpiresAt = new Date("2026-04-09T01:00:00.000Z");

    repository.findUserByEmail.mockResolvedValue(null);
    password.hashPassword.mockResolvedValue("hashed-password");
    repository.createUser.mockResolvedValue({
      id: "user_1",
      email: "alice@example.com",
      emailVerifiedAt: null,
      createdAt: new Date("2026-04-08T01:00:00.000Z"),
      updatedAt: new Date("2026-04-08T01:00:00.000Z"),
    });
    emailVerification.createEmailVerificationToken.mockReturnValue(
      "verification-token",
    );
    emailVerification.hashEmailVerificationToken.mockReturnValue(
      "hashed-verification-token",
    );
    emailVerification.getEmailVerificationExpiresAt.mockReturnValue(
      verificationExpiresAt,
    );
    emailVerification.buildEmailVerificationUrl.mockReturnValue(
      "http://localhost:3000/verify-email?token=verification-token",
    );
    repository.createEmailVerificationToken.mockResolvedValue({
      id: "evt_1",
      userId: "user_1",
      tokenHash: "hashed-verification-token",
      expiresAt: verificationExpiresAt,
      usedAt: null,
      createdAt: new Date("2026-04-08T01:05:00.000Z"),
    });

    const result = await registerUser({
      email: "alice@example.com",
      password: "super-secret-password",
    });

    expect(password.hashPassword).toHaveBeenCalledWith("super-secret-password");
    expect(repository.createUser).toHaveBeenCalledWith({
      email: "alice@example.com",
      passwordHash: "hashed-password",
    });
    expect(repository.createEmailVerificationToken).toHaveBeenCalledWith({
      userId: "user_1",
      tokenHash: "hashed-verification-token",
      expiresAt: verificationExpiresAt,
    });
    expect(result.user.emailVerifiedAt).toBeNull();
    expect(result.verificationUrl).toBe(
      "http://localhost:3000/verify-email?token=verification-token",
    );
  });

  it("rejects login when the password is wrong", async () => {
    repository.findUserByEmail.mockResolvedValue({
      id: "user_1",
      email: "alice@example.com",
      emailVerifiedAt: null,
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
      emailVerifiedAt: null,
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

  it("rejects email verification when the token cannot be found", async () => {
    emailVerification.hashEmailVerificationToken.mockReturnValue("missing-hash");
    repository.findEmailVerificationTokenByHash.mockResolvedValue(null);

    await expect(verifyEmailToken("missing-token")).rejects.toThrow(
      "Verification link is invalid or has already been used",
    );
  });

  it("rejects email verification when the token is expired", async () => {
    emailVerification.hashEmailVerificationToken.mockReturnValue("expired-hash");
    repository.findEmailVerificationTokenByHash.mockResolvedValue({
      id: "evt_1",
      userId: "user_1",
      tokenHash: "expired-hash",
      expiresAt: new Date("2026-04-08T00:00:00.000Z"),
      usedAt: null,
      createdAt: new Date("2026-04-07T00:00:00.000Z"),
      user: {
        id: "user_1",
        email: "alice@example.com",
        emailVerifiedAt: null,
        passwordHash: "hashed-password",
        createdAt: new Date("2026-04-07T00:00:00.000Z"),
        updatedAt: new Date("2026-04-07T00:00:00.000Z"),
      },
    });

    await expect(verifyEmailToken("expired-token")).rejects.toThrow(
      "Verification link has expired",
    );
  });

  it("marks the token used and verifies the user email", async () => {
    const now = new Date("2026-04-08T01:00:00.000Z");
    vi.useFakeTimers();
    vi.setSystemTime(now);

    emailVerification.hashEmailVerificationToken.mockReturnValue("valid-hash");
    repository.findEmailVerificationTokenByHash.mockResolvedValue({
      id: "evt_1",
      userId: "user_1",
      tokenHash: "valid-hash",
      expiresAt: new Date("2026-04-09T00:00:00.000Z"),
      usedAt: null,
      createdAt: new Date("2026-04-08T00:00:00.000Z"),
      user: {
        id: "user_1",
        email: "alice@example.com",
        emailVerifiedAt: null,
        passwordHash: "hashed-password",
        createdAt: new Date("2026-04-07T00:00:00.000Z"),
        updatedAt: new Date("2026-04-07T00:00:00.000Z"),
      },
    });
    repository.markEmailVerificationTokenUsed.mockResolvedValue({
      id: "evt_1",
      userId: "user_1",
      tokenHash: "valid-hash",
      expiresAt: new Date("2026-04-09T00:00:00.000Z"),
      usedAt: now,
      createdAt: new Date("2026-04-08T00:00:00.000Z"),
    });
    repository.markUserEmailVerified.mockResolvedValue({
      id: "user_1",
      email: "alice@example.com",
      emailVerifiedAt: now,
      createdAt: new Date("2026-04-07T00:00:00.000Z"),
      updatedAt: now,
    });

    const result = await verifyEmailToken("valid-token");

    expect(repository.markEmailVerificationTokenUsed).toHaveBeenCalledWith(
      "evt_1",
      now,
    );
    expect(repository.markUserEmailVerified).toHaveBeenCalledWith("user_1", now);
    expect(result.emailVerifiedAt).toEqual(now);

    vi.useRealTimers();
  });

  it("resends verification only for authenticated unverified users", async () => {
    const verificationExpiresAt = new Date("2026-04-09T01:00:00.000Z");

    repository.findUserById.mockResolvedValue({
      id: "user_1",
      email: "alice@example.com",
      emailVerifiedAt: null,
      passwordHash: "hashed-password",
      createdAt: new Date("2026-04-07T00:00:00.000Z"),
      updatedAt: new Date("2026-04-07T00:00:00.000Z"),
    });
    emailVerification.createEmailVerificationToken.mockReturnValue(
      "verification-token-2",
    );
    emailVerification.hashEmailVerificationToken.mockReturnValue(
      "hashed-verification-token-2",
    );
    emailVerification.getEmailVerificationExpiresAt.mockReturnValue(
      verificationExpiresAt,
    );
    emailVerification.buildEmailVerificationUrl.mockReturnValue(
      "http://localhost:3000/verify-email?token=verification-token-2",
    );
    repository.createEmailVerificationToken.mockResolvedValue({
      id: "evt_2",
      userId: "user_1",
      tokenHash: "hashed-verification-token-2",
      expiresAt: verificationExpiresAt,
      usedAt: null,
      createdAt: new Date("2026-04-08T02:00:00.000Z"),
    });

    const result = await resendVerificationEmailForUser("user_1");

    expect(repository.deleteUnusedEmailVerificationTokensByUserId)
      .toHaveBeenCalledWith("user_1");
    expect(repository.createEmailVerificationToken).toHaveBeenCalledWith({
      userId: "user_1",
      tokenHash: "hashed-verification-token-2",
      expiresAt: verificationExpiresAt,
    });
    expect(result.email).toBe("alice@example.com");
    expect(result.verificationUrl).toBe(
      "http://localhost:3000/verify-email?token=verification-token-2",
    );
  });
});
