import { prisma } from "@/lib/prisma";
import type { ChatSummary } from "@/server/chat/chat-types";
import type {
  CreateGuestSessionInput,
  GuestSessionRecord,
  MergeGuestSessionInput,
  MergeGuestSessionResult,
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

export async function assignGuestChatsToUser(
  guestSessionId: string,
  userId: string,
) {
  return prisma.chat.updateMany({
    where: { guestSessionId },
    data: {
      userId,
      guestSessionId: null,
    },
  });
}

export async function markGuestSessionMerged(
  guestSessionId: string,
  mergedAt: Date,
): Promise<GuestSessionRecord> {
  return prisma.guestSession.update({
    where: { id: guestSessionId },
    data: { mergedAt },
    select: guestSessionSelect,
  });
}

export async function mergeGuestSessionIntoUser({
  guestSessionId,
  userId,
  mergedAt,
}: MergeGuestSessionInput): Promise<MergeGuestSessionResult> {
  return prisma.$transaction(async (tx) => {
    const { count } = await tx.chat.updateMany({
      where: { guestSessionId },
      data: {
        userId,
        guestSessionId: null,
      },
    });

    const mergedGuestSession = await tx.guestSession.update({
      where: { id: guestSessionId },
      data: { mergedAt },
      select: guestSessionSelect,
    });

    return {
      mergedGuestSession,
      mergedChatCount: count,
    };
  });
}
