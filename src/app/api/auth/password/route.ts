import { NextResponse } from "next/server";

import {
  changePasswordForUser,
  getCurrentSession,
} from "@/server/auth/auth-service";
import { changePasswordSchema } from "@/server/auth/auth-schemas";
import { readSessionTokenFromCookieHeader } from "@/server/auth/session";

function isChangePasswordClientError(error: unknown): error is Error {
  return (
    error instanceof Error &&
    ["User not found", "Current password is incorrect", "New password must be different"].includes(
      error.message,
    )
  );
}

export async function POST(request: Request) {
  const sessionToken = readSessionTokenFromCookieHeader(
    request.headers.get("cookie"),
  );
  const session = await getCurrentSession(sessionToken);

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rawBody = (await request.json()) as unknown;
  const parsed = changePasswordSchema.safeParse(rawBody);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid password change payload" }, { status: 400 });
  }

  try {
    await changePasswordForUser({
      userId: session.user.id,
      currentPassword: parsed.data.currentPassword,
      nextPassword: parsed.data.nextPassword,
    });

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    if (isChangePasswordClientError(error)) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Change password route failed",
      },
      { status: 500 },
    );
  }
}
