import { NextResponse } from "next/server";

import { sendVerificationEmail } from "@/server/auth/email-delivery";
import {
  getCurrentSession,
  resendVerificationEmailForUser,
} from "@/server/auth/auth-service";
import { readSessionTokenFromCookieHeader } from "@/server/auth/session";

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
    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json(
      { error: "Resend verification route failed" },
      { status: 500 },
    );
  }
}
