import { NextResponse } from "next/server";

import type { EntryState } from "@/server/auth/entry-state";
import { resolveEntryStateFromCookieHeader } from "@/server/auth/entry-state";
import {
  getOrCreateGuestSession,
  GUEST_MESSAGE_LIMIT,
} from "@/server/guest/guest-service";
import {
  getGuestCookieName,
  getGuestCookieOptions,
  readGuestTokenFromCookieHeader,
} from "@/server/guest/guest-session";

function assertNeverEntryState(state: never): never {
  throw new Error(`Unhandled entry state: ${(state as EntryState).kind}`);
}

export async function GET(request: Request) {
  const cookieHeader = request.headers.get("cookie");
  const entryState = await resolveEntryStateFromCookieHeader(cookieHeader);

  switch (entryState.kind) {
    case "authenticated_verified":
      return NextResponse.json({
        authenticated: true,
        user: {
          ...entryState.user,
          isEmailVerified: true,
        },
        mergeCandidate: entryState.mergeCandidate,
        guest: null,
      });
    case "authenticated_unverified":
      return NextResponse.json({
        authenticated: true,
        user: {
          ...entryState.user,
          isEmailVerified: false,
        },
        mergeCandidate: null,
        guest: null,
      });
    case "signed_out_auth_shell":
      return NextResponse.json({
        authenticated: false,
        user: null,
        guest: null,
      });
    case "signed_out_guest_workspace":
      return NextResponse.json({
        authenticated: false,
        user: null,
        guest: {
          active: true,
          trialMessageCount: entryState.guestSession.trialMessageCount,
          messageLimit: GUEST_MESSAGE_LIMIT,
        },
      });
    case "signed_out_guest_preview": {
      // This route is allowed to activate a guest session for preview requests.
      const guestToken = readGuestTokenFromCookieHeader(cookieHeader);
      const { guestSession, created } = await getOrCreateGuestSession(guestToken);
      const response = NextResponse.json({
        authenticated: false,
        user: null,
        guest: {
          active: true,
          trialMessageCount: guestSession.trialMessageCount,
          messageLimit: GUEST_MESSAGE_LIMIT,
        },
      });

      if (created || !guestToken) {
        response.cookies.set(getGuestCookieName(), guestSession.guestToken, {
          ...getGuestCookieOptions(),
          expires: guestSession.expiresAt,
        });
      }

      return response;
    }
    default:
      return assertNeverEntryState(entryState);
  }
}
