import { NextResponse } from "next/server";

import {
  InvalidAuthPayloadError,
  UnauthorizedAuthError,
} from "@/server/auth/auth-errors";
import {
  changePasswordForUser,
  getCurrentSession,
} from "@/server/auth/auth-service";
import { changePasswordSchema } from "@/server/auth/auth-schemas";
import { readSessionTokenFromCookieHeader } from "@/server/auth/session";
import { toErrorResponse } from "@/server/shared/errors/error-response";

export async function POST(request: Request) {
  const sessionToken = readSessionTokenFromCookieHeader(
    request.headers.get("cookie"),
  );
  const session = await getCurrentSession(sessionToken);

  if (!session) {
    return toErrorResponse(new UnauthorizedAuthError());
  }

  const rawBody = (await request.json()) as unknown;
  const parsed = changePasswordSchema.safeParse(rawBody);

  if (!parsed.success) {
    return toErrorResponse(
      new InvalidAuthPayloadError("Invalid password change payload"),
    );
  }

  try {
    await changePasswordForUser({
      userId: session.user.id,
      currentPassword: parsed.data.currentPassword,
      nextPassword: parsed.data.nextPassword,
      currentSessionToken: sessionToken ?? undefined,
    });

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    return toErrorResponse(error, {
      fallbackMessage: "Change password route failed",
    });
  }
}
