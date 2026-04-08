import { beforeEach, describe, expect, it, vi } from "vitest";

const { prisma } = vi.hoisted(() => ({
  prisma: {
    user: {
      create: vi.fn(),
      findUnique: vi.fn(),
    },
    session: {
      create: vi.fn(),
      deleteMany: vi.fn(),
      findUnique: vi.fn(),
    },
  },
}));

vi.mock("@/lib/prisma", () => ({
  prisma,
}));

import {
  createSessionRecord,
  createUser,
  deleteSessionByToken,
  findSessionByToken,
  findUserByEmail,
  findUserById,
} from "@/server/auth/auth-repository";

describe("auth-repository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a user with the selected safe fields", async () => {
    prisma.user.create.mockResolvedValue({
      id: "user_1",
      email: "alice@example.com",
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
        passwordHash: "hashed-password",
        createdAt: new Date("2026-04-08T01:00:00.000Z"),
        updatedAt: new Date("2026-04-08T01:00:00.000Z"),
      })
      .mockResolvedValueOnce({
        id: "user_1",
        email: "alice@example.com",
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
});
