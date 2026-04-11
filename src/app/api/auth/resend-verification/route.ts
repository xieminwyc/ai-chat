import { NextResponse } from "next/server";

import { UnauthorizedAuthError } from "@/server/auth/auth-errors";
import { sendVerificationEmail } from "@/server/auth/email-delivery";
import {
  getCurrentSession,
  resendVerificationEmailForUser,
} from "@/server/auth/auth-service";
import { readSessionTokenFromCookieHeader } from "@/server/auth/session";
import { toErrorResponse } from "@/server/shared/errors/error-response";

export async function POST(request: Request) {
  try {
    const sessionToken = readSessionTokenFromCookieHeader(
      request.headers.get("cookie"),
    );
    const session = await getCurrentSession(sessionToken);

    if (!session) {
      return toErrorResponse(new UnauthorizedAuthError());
    }

    const delivery = await resendVerificationEmailForUser(session.user.id);

    await sendVerificationEmail(delivery);

    return NextResponse.json({ success: true }, { status: 202 });
  } catch (error) {
    return toErrorResponse(error, {
      fallbackMessage: "Resend verification route failed",
    });
  }
}
