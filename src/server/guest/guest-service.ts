import {
  createGuestSession,
  findGuestSessionById,
  findGuestSessionByToken,
  incrementGuestTrialCount,
  mergeGuestSessionIntoUser,
} from "@/server/guest/guest-repository";
import { ForbiddenError, UnauthorizedError } from "@/server/chat/chat-errors";
import {
  createGuestToken,
  getGuestExpiresAt,
} from "@/server/guest/guest-session";

export const GUEST_MESSAGE_LIMIT = 3;

async function requireActiveGuestSession(guestSessionId: string) {
  const currentGuestSession = await findGuestSessionById(guestSessionId);

  if (!currentGuestSession) {
    throw new UnauthorizedError("Guest session not found.");
  }

  if (currentGuestSession.expiresAt.getTime() <= Date.now()) {
    throw new UnauthorizedError(
      "Guest session expired. Please refresh to continue.",
    );
  }

  if (currentGuestSession.mergedAt) {
    throw new UnauthorizedError("Guest session has already been merged.");
  }

  return currentGuestSession;
}

export async function getCurrentGuestSession(guestToken?: string | null) {
  if (!guestToken) {
    return null;
  }

  const session = await findGuestSessionByToken(guestToken);
  if (!session) {
    return null;
  }

  if (session.mergedAt) {
    return null;
  }

  if (session.expiresAt.getTime() <= Date.now()) {
    return null;
  }

  return session;
}

export async function getOrCreateGuestSession(guestToken?: string | null) {
  const existingSession = await getCurrentGuestSession(guestToken);

  if (existingSession) {
    return {
      guestSession: existingSession,
      created: false,
    };
  }

  const guestSession = await createGuestSession({
    guestToken: createGuestToken(),
    expiresAt: getGuestExpiresAt(),
  });

  return {
    guestSession,
    created: true,
  };
}

export async function getMergeableGuestSession(guestToken?: string | null) {
  return getCurrentGuestSession(guestToken);
}

export async function assertGuestMessageQuotaAvailable(guestSessionId: string) {
  const currentGuestSession = await requireActiveGuestSession(guestSessionId);

  if (currentGuestSession.trialMessageCount >= GUEST_MESSAGE_LIMIT) {
    throw new ForbiddenError(
      "Guest trial limit reached. Please register to continue.",
    );
  }

  return currentGuestSession;
}

export async function consumeGuestMessageQuota(guestSessionId: string) {
  await assertGuestMessageQuotaAvailable(guestSessionId);

  const updatedGuestSession = await incrementGuestTrialCount(
    guestSessionId,
    GUEST_MESSAGE_LIMIT,
  );

  if (!updatedGuestSession) {
    throw new Error("Guest trial limit reached. Please register to continue.");
  }

  return updatedGuestSession;
}

export async function mergeGuestSessionIntoUserAccount({
  guestSessionId,
  userId,
}: {
  guestSessionId: string;
  userId: string;
}) {
  await requireActiveGuestSession(guestSessionId);

  return mergeGuestSessionIntoUser({
    guestSessionId,
    userId,
    mergedAt: new Date(),
  });
}
