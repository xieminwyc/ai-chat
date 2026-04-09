import { prisma } from "@/lib/prisma";
import type { ChatSummary } from "@/server/chat/chat-types";
import type {
  CreateGuestSessionInput,
  GuestSessionRecord,
} from "@/server/guest/guest-types";

const guestSessionSelect = {
  id: true,
  guestToken: true,
  trialMessageCount: true,
  mergedAt: true,
  expiresAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

export async function createGuestSession(
  data: CreateGuestSessionInput,
): Promise<GuestSessionRecord> {
  return prisma.guestSession.create({
    data,
    select: guestSessionSelect,
  });
}

export async function findGuestSessionByToken(
  guestToken: string,
): Promise<GuestSessionRecord | null> {
  return prisma.guestSession.findUnique({
    where: { guestToken },
    select: guestSessionSelect,
  });
}

export async function findGuestSessionById(
  guestSessionId: string,
): Promise<GuestSessionRecord | null> {
  return prisma.guestSession.findFirst({
    where: { id: guestSessionId },
    select: guestSessionSelect,
  });
}

export async function incrementGuestTrialCount(
  guestSessionId: string,
  messageLimit: number,
): Promise<GuestSessionRecord | null> {
  const [guestSession] = await prisma.guestSession.updateManyAndReturn({
    where: {
      id: guestSessionId,
      mergedAt: null,
      trialMessageCount: {
        lt: messageLimit,
      },
      expiresAt: {
        gt: new Date(),
      },
    },
    data: {
      trialMessageCount: {
        increment: 1,
      },
    },
    select: guestSessionSelect,
  });

  return guestSession ?? null;
}

export async function listGuestChats(
  guestSessionId: string,
): Promise<ChatSummary[]> {
  return prisma.chat.findMany({
    where: { guestSessionId },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      title: true,
      createdAt: true,
      updatedAt: true,
    },
  });
}
