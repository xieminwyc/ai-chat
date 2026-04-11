import { beforeEach, describe, expect, it, vi } from "vitest";

const repository = vi.hoisted(() => ({
  createEmailVerificationToken: vi.fn(),
  createPasswordResetToken: vi.fn(),
  createSessionRecord: vi.fn(),
  createUser: vi.fn(),
  deleteUnusedEmailVerificationTokensByUserId: vi.fn(),
  deleteUnusedPasswordResetTokensByUserId: vi.fn(),
  deleteSessionByToken: vi.fn(),
  findEmailVerificationTokenByHash: vi.fn(),
  findPasswordResetTokenByHash: vi.fn(),
  findSessionByToken: vi.fn(),
  findUserByEmail: vi.fn(),
  findUserById: vi.fn(),
  markEmailVerificationTokenUsed: vi.fn(),
  markPasswordResetTokenUsed: vi.fn(),
  markUserEmailVerified: vi.fn(),
  updateUserPasswordHash: vi.fn(),
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

const passwordReset = vi.hoisted(() => ({
  buildPasswordResetUrl: vi.fn(),
  createPasswordResetToken: vi.fn(),
  getPasswordResetExpiresAt: vi.fn(),
  hashPasswordResetToken: vi.fn(),
}));

vi.mock("@/server/auth/auth-repository", () => repository);
vi.mock("@/server/auth/email-verification", () => emailVerification);
vi.mock("@/server/auth/password", () => password);
vi.mock("@/server/auth/password-reset", () => passwordReset);
vi.mock("@/server/auth/session", () => session);

import {
  changePasswordForUser,
  getCurrentSession,
  loginUser,
  logoutUser,
  requestPasswordResetForEmail,
  registerUser,
  resetPasswordWithToken,
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

  it("rejects password change when the current password is wrong", async () => {
    repository.findUserById.mockResolvedValue({
      id: "user_1",
      email: "alice@example.com",
      emailVerifiedAt: new Date("2026-04-08T01:00:00.000Z"),
      passwordHash: "hashed-password",
      createdAt: new Date("2026-04-07T00:00:00.000Z"),
      updatedAt: new Date("2026-04-07T00:00:00.000Z"),
    });
    password.verifyPassword.mockResolvedValue(false);

    await expect(
      changePasswordForUser({
        userId: "user_1",
        currentPassword: "wrong-password",
        nextPassword: "brand-new-password",
      }),
    ).rejects.toThrow("Current password is incorrect");
  });

  it("rejects password change when the next password matches the current password", async () => {
    repository.findUserById.mockResolvedValue({
      id: "user_1",
      email: "alice@example.com",
      emailVerifiedAt: new Date("2026-04-08T01:00:00.000Z"),
      passwordHash: "hashed-password",
      createdAt: new Date("2026-04-07T00:00:00.000Z"),
      updatedAt: new Date("2026-04-07T00:00:00.000Z"),
    });
    password.verifyPassword.mockResolvedValue(true);

    await expect(
      changePasswordForUser({
        userId: "user_1",
        currentPassword: "same-password",
        nextPassword: "same-password",
      }),
    ).rejects.toThrow("New password must be different");
  });

  it("hashes and updates the password when change succeeds", async () => {
    repository.findUserById.mockResolvedValue({
      id: "user_1",
      email: "alice@example.com",
      emailVerifiedAt: new Date("2026-04-08T01:00:00.000Z"),
      passwordHash: "hashed-password",
      createdAt: new Date("2026-04-07T00:00:00.000Z"),
      updatedAt: new Date("2026-04-07T00:00:00.000Z"),
    });
    password.verifyPassword.mockResolvedValue(true);
    password.hashPassword.mockResolvedValue("new-hash");
    repository.updateUserPasswordHash.mockResolvedValue({
      id: "user_1",
      email: "alice@example.com",
      emailVerifiedAt: new Date("2026-04-08T01:00:00.000Z"),
      createdAt: new Date("2026-04-07T00:00:00.000Z"),
      updatedAt: new Date("2026-04-10T00:00:00.000Z"),
    });

    const result = await changePasswordForUser({
      userId: "user_1",
      currentPassword: "old-password",
      nextPassword: "brand-new-password",
    });

    expect(password.hashPassword).toHaveBeenCalledWith("brand-new-password");
    expect(repository.updateUserPasswordHash).toHaveBeenCalledWith(
      "user_1",
      "new-hash",
    );
    expect(result.email).toBe("alice@example.com");
  });

  it("creates a password reset token for an existing email", async () => {
    const resetExpiresAt = new Date("2026-04-11T03:00:00.000Z");

    repository.findUserByEmail.mockResolvedValue({
      id: "user_1",
      email: "alice@example.com",
      emailVerifiedAt: null,
      passwordHash: "hashed-password",
      createdAt: new Date("2026-04-10T01:00:00.000Z"),
      updatedAt: new Date("2026-04-10T01:00:00.000Z"),
    });
    passwordReset.createPasswordResetToken.mockReturnValue("reset-token");
    passwordReset.hashPasswordResetToken.mockReturnValue("hashed-reset-token");
    passwordReset.getPasswordResetExpiresAt.mockReturnValue(resetExpiresAt);
    passwordReset.buildPasswordResetUrl.mockReturnValue(
      "http://localhost:3000/reset-password?token=reset-token",
    );

    const result = await requestPasswordResetForEmail(" Alice@example.com ");

    expect(repository.findUserByEmail).toHaveBeenCalledWith("alice@example.com");
    expect(repository.deleteUnusedPasswordResetTokensByUserId)
      .toHaveBeenCalledWith("user_1");
    expect(repository.createPasswordResetToken).toHaveBeenCalledWith({
      userId: "user_1",
      tokenHash: "hashed-reset-token",
      expiresAt: resetExpiresAt,
    });
    expect(result).toEqual({
      email: "alice@example.com",
      resetUrl: "http://localhost:3000/reset-password?token=reset-token",
    });
  });

  it("returns a safe no-op result for an unknown email during password reset request", async () => {
    repository.findUserByEmail.mockResolvedValue(null);

    const result = await requestPasswordResetForEmail("nobody@example.com");

    expect(result).toBeNull();
    expect(repository.createPasswordResetToken).not.toHaveBeenCalled();
    expect(repository.deleteUnusedPasswordResetTokensByUserId)
      .not.toHaveBeenCalled();
  });

  it("rejects password reset when the token cannot be found", async () => {
    passwordReset.hashPasswordResetToken.mockReturnValue("missing-reset-hash");
    repository.findPasswordResetTokenByHash.mockResolvedValue(null);

    await expect(
      resetPasswordWithToken({
        token: "missing-reset-token",
        nextPassword: "brand-new-password",
      }),
    ).rejects.toThrow("Password reset link is invalid or has already been used");
  });

  it("rejects password reset when the token has already been used", async () => {
    passwordReset.hashPasswordResetToken.mockReturnValue("used-reset-hash");
    repository.findPasswordResetTokenByHash.mockResolvedValue({
      id: "prt_1",
      userId: "user_1",
      tokenHash: "used-reset-hash",
      expiresAt: new Date("2026-04-11T03:00:00.000Z"),
      usedAt: new Date("2026-04-11T01:30:00.000Z"),
      createdAt: new Date("2026-04-11T01:00:00.000Z"),
      user: {
        id: "user_1",
        email: "alice@example.com",
        emailVerifiedAt: null,
        passwordHash: "hashed-password",
        createdAt: new Date("2026-04-10T01:00:00.000Z"),
        updatedAt: new Date("2026-04-10T01:00:00.000Z"),
      },
    });

    await expect(
      resetPasswordWithToken({
        token: "used-reset-token",
        nextPassword: "brand-new-password",
      }),
    ).rejects.toThrow("Password reset link is invalid or has already been used");
  });

  it("rejects password reset when the token is expired", async () => {
    passwordReset.hashPasswordResetToken.mockReturnValue("expired-reset-hash");
    repository.findPasswordResetTokenByHash.mockResolvedValue({
      id: "prt_1",
      userId: "user_1",
      tokenHash: "expired-reset-hash",
      expiresAt: new Date("2026-04-10T23:00:00.000Z"),
      usedAt: null,
      createdAt: new Date("2026-04-10T22:00:00.000Z"),
      user: {
        id: "user_1",
        email: "alice@example.com",
        emailVerifiedAt: null,
        passwordHash: "hashed-password",
        createdAt: new Date("2026-04-10T01:00:00.000Z"),
        updatedAt: new Date("2026-04-10T01:00:00.000Z"),
      },
    });

    await expect(
      resetPasswordWithToken({
        token: "expired-reset-token",
        nextPassword: "brand-new-password",
      }),
    ).rejects.toThrow("Password reset link has expired");
  });

  it("hashes the new password and consumes the reset token", async () => {
    const now = new Date("2026-04-11T02:00:00.000Z");
    vi.useFakeTimers();
    vi.setSystemTime(now);

    passwordReset.hashPasswordResetToken.mockReturnValue("valid-reset-hash");
    repository.findPasswordResetTokenByHash.mockResolvedValue({
      id: "prt_1",
      userId: "user_1",
      tokenHash: "valid-reset-hash",
      expiresAt: new Date("2026-04-11T03:00:00.000Z"),
      usedAt: null,
      createdAt: new Date("2026-04-11T01:00:00.000Z"),
      user: {
        id: "user_1",
        email: "alice@example.com",
        emailVerifiedAt: null,
        passwordHash: "old-password-hash",
        createdAt: new Date("2026-04-10T01:00:00.000Z"),
        updatedAt: new Date("2026-04-10T01:00:00.000Z"),
      },
    });
    password.hashPassword.mockResolvedValue("new-password-hash");
    repository.updateUserPasswordHash.mockResolvedValue({
      id: "user_1",
      email: "alice@example.com",
      emailVerifiedAt: null,
      createdAt: new Date("2026-04-10T01:00:00.000Z"),
      updatedAt: now,
    });

    const result = await resetPasswordWithToken({
      token: "valid-reset-token",
      nextPassword: "brand-new-password",
    });

    expect(password.hashPassword).toHaveBeenCalledWith("brand-new-password");
    expect(repository.updateUserPasswordHash).toHaveBeenCalledWith(
      "user_1",
      "new-password-hash",
    );
    expect(repository.markPasswordResetTokenUsed).toHaveBeenCalledWith(
      "prt_1",
      now,
    );
    expect(result.email).toBe("alice@example.com");

    vi.useRealTimers();
  });
});
