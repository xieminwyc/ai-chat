import { NextResponse } from "next/server";

import { getCurrentSession } from "@/server/auth/auth-service";
import { readSessionTokenFromCookieHeader } from "@/server/auth/session";

export async function GET(request: Request) {
  const sessionToken = readSessionTokenFromCookieHeader(
    request.headers.get("cookie"),
  );
  const session = await getCurrentSession(sessionToken);

  if (!session) {
    return NextResponse.json({
      authenticated: false,
      user: null,
    });
  }

  // 这个接口的作用是：把 httpOnly cookie 背后的服务端登录态，翻译成前端可读状态。
  return NextResponse.json({
    authenticated: true,
    user: session.user,
  });
}
