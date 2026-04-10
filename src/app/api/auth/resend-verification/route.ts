import { NextResponse } from "next/server";

import {
  isEmailDeliveryError,
  sendVerificationEmail,
} from "@/server/auth/email-delivery";
import {
  getCurrentSession,
  resendVerificationEmailForUser,
} from "@/server/auth/auth-service";
import { readSessionTokenFromCookieHeader } from "@/server/auth/session";

function isResendVerificationClientError(error: unknown): error is Error {
  return (
    error instanceof Error &&
    [
      "User not found",
      "Email is already verified",
    ].includes(error.message)
  );
}

export async function POST(request: Request) {
  try {
    const sessionToken = readSessionTokenFromCookieHeader(
      request.headers.get("cookie"),
    );
    const session = await getCurrentSession(sessionToken);

    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const delivery = await resendVerificationEmailForUser(session.user.id);

    await sendVerificationEmail(delivery);

    return NextResponse.json({ success: true }, { status: 202 });
  } catch (error) {
    if (isResendVerificationClientError(error)) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    if (isEmailDeliveryError(error)) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Resend verification route failed",
      },
      { status: 500 },
    );
  }
}
