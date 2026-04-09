import { NextResponse } from "next/server";

import { getCurrentSession } from "@/server/auth/auth-service";
import { readSessionTokenFromCookieHeader } from "@/server/auth/session";
import {
  getOrCreateGuestSession,
  GUEST_MESSAGE_LIMIT,
} from "@/server/guest/guest-service";
import {
  getGuestCookieName,
  getGuestCookieOptions,
  readGuestTokenFromCookieHeader,
} from "@/server/guest/guest-session";

export async function GET(request: Request) {
  const sessionToken = readSessionTokenFromCookieHeader(
    request.headers.get("cookie"),
  );
  const session = await getCurrentSession(sessionToken);

  if (session) {
    // 这个接口的作用是：把 httpOnly cookie 背后的服务端登录态，翻译成前端可读状态。
    return NextResponse.json({
      authenticated: true,
      user: session.user,
      guest: null,
    });
  }

  const guestToken = readGuestTokenFromCookieHeader(request.headers.get("cookie"));
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
