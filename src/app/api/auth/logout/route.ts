import { NextResponse } from "next/server";

import { logoutUser } from "@/server/auth/auth-service";
import {
  getSessionCookieName,
  getSessionCookieOptions,
  readSessionTokenFromCookieHeader,
} from "@/server/auth/session";

export async function POST(request: Request) {
  const sessionToken = readSessionTokenFromCookieHeader(
    request.headers.get("cookie"),
  );

  if (sessionToken) {
    await logoutUser(sessionToken);
  }

  const response = NextResponse.json({ success: true });
  // 退出时除了删数据库里的 session，也要把浏览器里的 cookie 立即过期掉。
  response.cookies.set(getSessionCookieName(), "", {
    ...getSessionCookieOptions(),
    maxAge: 0,
  });

  return response;
}
