import { beforeEach, describe, expect, it, vi } from "vitest";

const { prisma } = vi.hoisted(() => ({
  prisma: {
    guestSession: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      updateManyAndReturn: vi.fn(),
    },
    chat: {
      findMany: vi.fn(),
    },
  },
}));

vi.mock("@/lib/prisma", () => ({
  prisma,
}));

import {
  createGuestSession,
  findGuestSessionById,
  findGuestSessionByToken,
  incrementGuestTrialCount,
  listGuestChats,
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
});
