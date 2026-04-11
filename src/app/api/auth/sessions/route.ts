import { NextResponse } from "next/server";

import {
  getAllUserSessions,
  revokeAllOtherSessions,
} from "@/server/auth/auth-service";
import { getCurrentSession } from "@/server/auth/auth-service";
import { readSessionTokenFromCookieHeader } from "@/server/auth/session";

/**
 * GET /api/auth/sessions
 * 获取当前用户的所有活跃 session
 */
export async function GET(request: Request) {
  const cookieHeader = request.headers.get("cookie");
  const sessionToken = readSessionTokenFromCookieHeader(cookieHeader);
  const currentSession = await getCurrentSession(sessionToken);

  if (!currentSession) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    );
  }

  const sessions = await getAllUserSessions(currentSession.userId);

  // 标记当前 session
  const sessionsWithCurrent = sessions.map((session) => ({
    ...session,
    isCurrent: session.token === currentSession.token,
    // 不暴露完整 token 给前端
    token: session.token === currentSession.token ? session.token : null,
  }));

  return NextResponse.json({ sessions: sessionsWithCurrent });
}

/**
 * DELETE /api/auth/sessions
 * 撤销所有其他 session（除了当前这个）
 */
export async function DELETE(request: Request) {
  const cookieHeader = request.headers.get("cookie");
  const sessionToken = readSessionTokenFromCookieHeader(cookieHeader);
  const currentSession = await getCurrentSession(sessionToken);

  if (!currentSession) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    );
  }

  await revokeAllOtherSessions(currentSession.token);

  return NextResponse.json({
    success: true,
    message: "All other sessions have been revoked",
  });
}
