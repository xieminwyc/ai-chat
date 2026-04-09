import { beforeEach, describe, expect, it, vi } from "vitest";

const { prisma } = vi.hoisted(() => ({
  prisma: {
    user: {
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    session: {
      create: vi.fn(),
      deleteMany: vi.fn(),
      findUnique: vi.fn(),
    },
    emailVerificationToken: {
      create: vi.fn(),
      deleteMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock("@/lib/prisma", () => ({
  prisma,
}));

import {
  createEmailVerificationToken,
  createSessionRecord,
  createUser,
  deleteUnusedEmailVerificationTokensByUserId,
  deleteSessionByToken,
  findEmailVerificationTokenByHash,
  findSessionByToken,
  findUserByEmail,
  findUserById,
  markEmailVerificationTokenUsed,
  markUserEmailVerified,
} from "@/server/auth/auth-repository";

describe("auth-repository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a user with the selected safe fields", async () => {
    prisma.user.create.mockResolvedValue({
      id: "user_1",
      email: "alice@example.com",
      emailVerifiedAt: null,
      createdAt: new Date("2026-04-08T01:00:00.000Z"),
      updatedAt: new Date("2026-04-08T01:00:00.000Z"),
    });

    const user = await createUser({
      email: "alice@example.com",
      passwordHash: "hashed-password",
    });

    expect(prisma.user.create).toHaveBeenCalledWith({
      data: {
        email: "alice@example.com",
        passwordHash: "hashed-password",
      },
      select: {
        id: true,
        email: true,
        emailVerifiedAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    expect(user.email).toBe("alice@example.com");
  });

  it("finds users by email and id with password hash for auth flows", async () => {
    prisma.user.findUnique
      .mockResolvedValueOnce({
        id: "user_1",
        email: "alice@example.com",
        emailVerifiedAt: null,
        passwordHash: "hashed-password",
        createdAt: new Date("2026-04-08T01:00:00.000Z"),
        updatedAt: new Date("2026-04-08T01:00:00.000Z"),
      })
      .mockResolvedValueOnce({
        id: "user_1",
        email: "alice@example.com",
        emailVerifiedAt: null,
        passwordHash: "hashed-password",
        createdAt: new Date("2026-04-08T01:00:00.000Z"),
        updatedAt: new Date("2026-04-08T01:00:00.000Z"),
      });

    await findUserByEmail("alice@example.com");
    await findUserById("user_1");

    expect(prisma.user.findUnique).toHaveBeenNthCalledWith(1, {
      where: { email: "alice@example.com" },
      select: {
        id: true,
        email: true,
        emailVerifiedAt: true,
        passwordHash: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    expect(prisma.user.findUnique).toHaveBeenNthCalledWith(2, {
      where: { id: "user_1" },
      select: {
        id: true,
        email: true,
        emailVerifiedAt: true,
        passwordHash: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  });

  it("creates and loads a session together with its user", async () => {
    const expiresAt = new Date("2026-04-15T01:00:00.000Z");

    prisma.session.create.mockResolvedValue({
      id: "session_1",
      token: "session-token",
      userId: "user_1",
      expiresAt,
      createdAt: new Date("2026-04-08T01:00:00.000Z"),
    });
    prisma.session.findUnique.mockResolvedValue({
      id: "session_1",
      token: "session-token",
      userId: "user_1",
      expiresAt,
      createdAt: new Date("2026-04-08T01:00:00.000Z"),
      user: {
        id: "user_1",
        email: "alice@example.com",
        createdAt: new Date("2026-04-08T01:00:00.000Z"),
        updatedAt: new Date("2026-04-08T01:00:00.000Z"),
      },
    });

    await createSessionRecord({
      token: "session-token",
      userId: "user_1",
      expiresAt,
    });
    await findSessionByToken("session-token");

    expect(prisma.session.create).toHaveBeenCalledWith({
      data: {
        token: "session-token",
        userId: "user_1",
        expiresAt,
      },
      select: {
        id: true,
        token: true,
        userId: true,
        expiresAt: true,
        createdAt: true,
      },
    });
    expect(prisma.session.findUnique).toHaveBeenCalledWith({
      where: { token: "session-token" },
      select: {
        id: true,
        token: true,
        userId: true,
        expiresAt: true,
        createdAt: true,
        user: {
          select: {
            id: true,
            email: true,
            emailVerifiedAt: true,
            createdAt: true,
            updatedAt: true,
          },
        },
      },
    });
  });

  it("deletes sessions by token", async () => {
    prisma.session.deleteMany.mockResolvedValue({ count: 1 });

    await deleteSessionByToken("session-token");

    expect(prisma.session.deleteMany).toHaveBeenCalledWith({
      where: { token: "session-token" },
    });
  });

  it("creates, finds, and consumes email verification tokens", async () => {
    const expiresAt = new Date("2026-04-10T01:00:00.000Z");
    const usedAt = new Date("2026-04-09T01:00:00.000Z");

    prisma.emailVerificationToken.create.mockResolvedValue({
      id: "evt_1",
      userId: "user_1",
      tokenHash: "hashed-token",
      expiresAt,
      usedAt: null,
      createdAt: new Date("2026-04-09T00:00:00.000Z"),
    });
    prisma.emailVerificationToken.findUnique.mockResolvedValue({
      id: "evt_1",
      userId: "user_1",
      tokenHash: "hashed-token",
      expiresAt,
      usedAt: null,
      createdAt: new Date("2026-04-09T00:00:00.000Z"),
      user: {
        id: "user_1",
        email: "alice@example.com",
        emailVerifiedAt: null,
        passwordHash: "hashed-password",
        createdAt: new Date("2026-04-08T01:00:00.000Z"),
        updatedAt: new Date("2026-04-08T01:00:00.000Z"),
      },
    });
    prisma.emailVerificationToken.update.mockResolvedValue({
      id: "evt_1",
      userId: "user_1",
      tokenHash: "hashed-token",
      expiresAt,
      usedAt,
      createdAt: new Date("2026-04-09T00:00:00.000Z"),
    });

    await createEmailVerificationToken({
      userId: "user_1",
      tokenHash: "hashed-token",
      expiresAt,
    });
    await findEmailVerificationTokenByHash("hashed-token");
    await markEmailVerificationTokenUsed("evt_1", usedAt);

    expect(prisma.emailVerificationToken.create).toHaveBeenCalledWith({
      data: {
        userId: "user_1",
        tokenHash: "hashed-token",
        expiresAt,
      },
      select: {
        id: true,
        userId: true,
        tokenHash: true,
        expiresAt: true,
        usedAt: true,
        createdAt: true,
      },
    });
    expect(prisma.emailVerificationToken.findUnique).toHaveBeenCalledWith({
      where: { tokenHash: "hashed-token" },
      select: {
        id: true,
        userId: true,
        tokenHash: true,
        expiresAt: true,
        usedAt: true,
        createdAt: true,
        user: {
          select: {
            id: true,
            email: true,
            emailVerifiedAt: true,
            passwordHash: true,
            createdAt: true,
            updatedAt: true,
          },
        },
      },
    });
    expect(prisma.emailVerificationToken.update).toHaveBeenCalledWith({
      where: { id: "evt_1" },
      data: { usedAt },
      select: {
        id: true,
        userId: true,
        tokenHash: true,
        expiresAt: true,
        usedAt: true,
        createdAt: true,
      },
    });
  });

  it("marks the user verified and clears unused verification tokens", async () => {
    const verifiedAt = new Date("2026-04-09T02:00:00.000Z");

    prisma.user.update.mockResolvedValue({
      id: "user_1",
      email: "alice@example.com",
      emailVerifiedAt: verifiedAt,
      createdAt: new Date("2026-04-08T01:00:00.000Z"),
      updatedAt: new Date("2026-04-09T02:00:00.000Z"),
    });
    prisma.emailVerificationToken.deleteMany.mockResolvedValue({ count: 2 });

    await markUserEmailVerified("user_1", verifiedAt);
    await deleteUnusedEmailVerificationTokensByUserId("user_1");

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: "user_1" },
      data: { emailVerifiedAt: verifiedAt },
      select: {
        id: true,
        email: true,
        emailVerifiedAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    expect(prisma.emailVerificationToken.deleteMany).toHaveBeenCalledWith({
      where: {
        userId: "user_1",
        usedAt: null,
      },
    });
  });
});
