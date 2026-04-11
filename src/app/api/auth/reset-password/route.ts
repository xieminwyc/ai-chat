import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { resetPasswordWithToken } from "@/server/auth/auth-service";
import { resetPasswordSchema } from "@/server/auth/auth-schemas";

function isResetPasswordClientError(error: unknown): error is Error {
  return (
    error instanceof Error &&
    [
      "Password reset link is invalid or has already been used",
      "Password reset link has expired",
    ].includes(error.message)
  );
}

export async function POST(request: Request) {
  try {
    const body = resetPasswordSchema.parse(await request.json());

    await resetPasswordWithToken({
      token: body.token,
      nextPassword: body.nextPassword,
    });

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: "Invalid password reset payload" },
        { status: 400 },
      );
    }

    if (isResetPasswordClientError(error)) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Reset password route failed",
      },
      { status: 500 },
    );
  }
}
