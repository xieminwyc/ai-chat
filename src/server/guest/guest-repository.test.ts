import { beforeEach, describe, expect, it, vi } from "vitest";

const { prisma } = vi.hoisted(() => ({
  prisma: {
    $transaction: vi.fn(),
    guestSession: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      updateManyAndReturn: vi.fn(),
    },
    chat: {
      findMany: vi.fn(),
      updateMany: vi.fn(),
    },
  },
}));

vi.mock("@/lib/prisma", () => ({
  prisma,
}));

import {
  assignGuestChatsToUser,
  createGuestSession,
  findGuestSessionById,
  findGuestSessionByToken,
  incrementGuestTrialCount,
  listGuestChats,
  markGuestSessionMerged,
  mergeGuestSessionIntoUser,
} from "@/server/guest/guest-repository";

describe("guest-repository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a guest session with token and expiry", async () => {
    const expiresAt = new Date("2026-04-22T00:00:00.000Z");
    prisma.guestSession.create.mockResolvedValue({
      id: "guest_1",
      guestToken: "guest-token",
      trialMessageCount: 0,
      mergedAt: null,
      expiresAt,
      createdAt: new Date("2026-04-08T00:00:00.000Z"),
      updatedAt: new Date("2026-04-08T00:00:00.000Z"),
    });

    await createGuestSession({
      guestToken: "guest-token",
      expiresAt,
    });

    expect(prisma.guestSession.create).toHaveBeenCalledWith({
      data: {
        guestToken: "guest-token",
        expiresAt,
      },
      select: {
        id: true,
        guestToken: true,
        trialMessageCount: true,
        mergedAt: true,
        expiresAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  });

  it("finds a guest session by token", async () => {
    prisma.guestSession.findUnique.mockResolvedValue(null);

    await findGuestSessionByToken("guest-token");

    expect(prisma.guestSession.findUnique).toHaveBeenCalledWith({
      where: { guestToken: "guest-token" },
      select: {
        id: true,
        guestToken: true,
        trialMessageCount: true,
        mergedAt: true,
        expiresAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  });

  it("finds a guest session by id", async () => {
    prisma.guestSession.findFirst.mockResolvedValue(null);

    await findGuestSessionById("guest_1");

    expect(prisma.guestSession.findFirst).toHaveBeenCalledWith({
      where: { id: "guest_1" },
      select: {
        id: true,
        guestToken: true,
        trialMessageCount: true,
        mergedAt: true,
        expiresAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  });

  it("increments trialMessageCount only when the guest is still under limit", async () => {
    prisma.guestSession.updateManyAndReturn.mockResolvedValue([
      {
        id: "guest_1",
        guestToken: "guest-token",
        trialMessageCount: 1,
        mergedAt: null,
        expiresAt: new Date("2026-04-22T00:00:00.000Z"),
        createdAt: new Date("2026-04-08T00:00:00.000Z"),
        updatedAt: new Date("2026-04-08T00:01:00.000Z"),
      },
    ]);

    await incrementGuestTrialCount("guest_1", 3);

    expect(prisma.guestSession.updateManyAndReturn).toHaveBeenCalledWith({
      where: {
        id: "guest_1",
        mergedAt: null,
        trialMessageCount: {
          lt: 3,
        },
        expiresAt: {
          gt: expect.any(Date),
        },
      },
      data: {
        trialMessageCount: {
          increment: 1,
        },
      },
      select: {
        id: true,
        guestToken: true,
        trialMessageCount: true,
        mergedAt: true,
        expiresAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  });

  it("returns null when the guest has already exhausted the quota", async () => {
    prisma.guestSession.updateManyAndReturn.mockResolvedValue([]);

    const updatedSession = await incrementGuestTrialCount("guest_1", 3);

    expect(updatedSession).toBeNull();
  });

  it("returns chats scoped by guestSessionId after schema refactor", async () => {
    prisma.chat.findMany.mockResolvedValue([]);

    await listGuestChats("guest_1");

    expect(prisma.chat.findMany).toHaveBeenCalledWith({
      where: { guestSessionId: "guest_1" },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        title: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  });

  it("reassigns guest chats to a user account during merge", async () => {
    prisma.chat.updateMany.mockResolvedValue({ count: 2 });

    await assignGuestChatsToUser("guest_1", "user_1");

    expect(prisma.chat.updateMany).toHaveBeenCalledWith({
      where: { guestSessionId: "guest_1" },
      data: {
        userId: "user_1",
        guestSessionId: null,
      },
    });
  });

  it("marks a guest session as merged", async () => {
    const mergedAt = new Date("2026-04-09T03:00:00.000Z");
    prisma.guestSession.update.mockResolvedValue({
      id: "guest_1",
      guestToken: "guest-token",
      trialMessageCount: 2,
      mergedAt,
      expiresAt: new Date("2026-04-22T00:00:00.000Z"),
      createdAt: new Date("2026-04-08T00:00:00.000Z"),
      updatedAt: mergedAt,
    });

    await markGuestSessionMerged("guest_1", mergedAt);

    expect(prisma.guestSession.update).toHaveBeenCalledWith({
      where: { id: "guest_1" },
      data: { mergedAt },
      select: {
        id: true,
        guestToken: true,
        trialMessageCount: true,
        mergedAt: true,
        expiresAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  });

  it("merges guest chats and marks the session merged in one transaction", async () => {
    const mergedAt = new Date("2026-04-09T03:00:00.000Z");
    prisma.chat.updateMany.mockResolvedValue({ count: 3 });
    prisma.guestSession.update.mockResolvedValue({
      id: "guest_1",
      guestToken: "guest-token",
      trialMessageCount: 2,
      mergedAt,
      expiresAt: new Date("2026-04-22T00:00:00.000Z"),
      createdAt: new Date("2026-04-08T00:00:00.000Z"),
      updatedAt: mergedAt,
    });
    prisma.$transaction.mockImplementation(async (callback) => callback(prisma));

    const result = await mergeGuestSessionIntoUser({
      guestSessionId: "guest_1",
      userId: "user_1",
      mergedAt,
    });

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      mergedGuestSession: {
        id: "guest_1",
        guestToken: "guest-token",
        trialMessageCount: 2,
        mergedAt,
        expiresAt: new Date("2026-04-22T00:00:00.000Z"),
        createdAt: new Date("2026-04-08T00:00:00.000Z"),
        updatedAt: mergedAt,
      },
      mergedChatCount: 3,
    });
  });
});
