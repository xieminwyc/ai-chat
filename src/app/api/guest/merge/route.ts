import { NextResponse } from "next/server";

import { getCurrentSession } from "@/server/auth/auth-service";
import { readSessionTokenFromCookieHeader } from "@/server/auth/session";
import { requireVerifiedUser } from "@/server/chat/chat-auth";
import { ForbiddenError, UnauthorizedError } from "@/server/chat/chat-errors";
import {
  getMergeableGuestSession,
  mergeGuestSessionIntoUserAccount,
} from "@/server/guest/guest-service";
import {
  getGuestAuthShellCookieName,
  getGuestAuthShellCookieOptions,
  getGuestCookieName,
  getGuestCookieOptions,
  readGuestTokenFromCookieHeader,
} from "@/server/guest/guest-session";

function toMergeErrorResponse(error: unknown) {
  if (error instanceof UnauthorizedError) {
    return NextResponse.json({ error: error.message }, { status: 401 });
  }

  if (error instanceof ForbiddenError) {
    return NextResponse.json({ error: error.message }, { status: 403 });
  }

  if (error instanceof Error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ error: "Guest merge route failed" }, { status: 500 });
}

export async function POST(request: Request) {
  try {
    const cookieHeader = request.headers.get("cookie");
    const sessionToken = readSessionTokenFromCookieHeader(cookieHeader);
    const session = await getCurrentSession(sessionToken);
    const verifiedUser = requireVerifiedUser(session?.user ?? null);

    const guestToken = readGuestTokenFromCookieHeader(cookieHeader);
    const mergeableGuestSession = await getMergeableGuestSession(guestToken);

    if (!mergeableGuestSession) {
      throw new UnauthorizedError("Guest session not found.");
    }

    const result = await mergeGuestSessionIntoUserAccount({
      guestSessionId: mergeableGuestSession.id,
      userId: verifiedUser.id,
    });

    const response = NextResponse.json({
      success: true,
      mergedChatCount: result.mergedChatCount,
    });

    response.cookies.set(getGuestCookieName(), "", {
      ...getGuestCookieOptions(),
      maxAge: 0,
    });
    response.cookies.set(getGuestAuthShellCookieName(), "1", {
      ...getGuestAuthShellCookieOptions(),
    });

    return response;
  } catch (error) {
    return toMergeErrorResponse(error);
  }
}
