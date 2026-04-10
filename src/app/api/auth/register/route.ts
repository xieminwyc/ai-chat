import { NextResponse } from "next/server";
import { ZodError } from "zod";

import {
  isEmailDeliveryError,
  sendVerificationEmail,
} from "@/server/auth/email-delivery";
import { registerUser } from "@/server/auth/auth-service";
import { registerSchema } from "@/server/auth/auth-schemas";

function isDuplicateRegistrationError(error: unknown): error is Error {
  return (
    error instanceof Error &&
    error.message === "A user with this email already exists"
  );
}

export async function POST(request: Request) {
  try {
    const body = registerSchema.parse(await request.json());
    const result = await registerUser(body);

    await sendVerificationEmail({
      email: result.email,
      verificationUrl: result.verificationUrl,
    });

    return NextResponse.json(
      {
        user: result.user,
        requiresEmailVerification: true,
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: "Invalid registration payload" }, { status: 400 });
    }

    if (isDuplicateRegistrationError(error)) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }

    if (isEmailDeliveryError(error)) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Register route failed" },
      { status: 500 },
    );
  }
}
