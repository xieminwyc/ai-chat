import { NextResponse } from "next/server";

import { revokeSessionById } from "@/server/auth/auth-service";
import { getCurrentSession } from "@/server/auth/auth-service";
import { readSessionTokenFromCookieHeader } from "@/server/auth/session";

type RouteContext = {
  params: Promise<{ id: string }>;
};

/**
 * DELETE /api/auth/sessions/:id
 * 撤销指定的 session（用于"登出某个设备"）
 */
export async function DELETE(request: Request, routeContext: RouteContext) {
  const cookieHeader = request.headers.get("cookie");
  const sessionToken = readSessionTokenFromCookieHeader(cookieHeader);
  const currentSession = await getCurrentSession(sessionToken);

  if (!currentSession) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    );
  }

  const { id } = await routeContext.params;

  try {
    await revokeSessionById(id, currentSession.userId);
    return NextResponse.json({
      success: true,
      message: "Session revoked successfully",
    });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "Session not found") {
        return NextResponse.json(
          { error: "Session not found" },
          { status: 404 }
        );
      }
      if (error.message === "You can only revoke your own sessions") {
        return NextResponse.json(
          { error: "Forbidden" },
          { status: 403 }
        );
      }
    }
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
