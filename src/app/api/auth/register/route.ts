import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { InvalidAuthPayloadError } from "@/server/auth/auth-errors";
import {
  sendVerificationEmail,
} from "@/server/auth/email-delivery";
import { registerUser } from "@/server/auth/auth-service";
import { registerSchema } from "@/server/auth/auth-schemas";
import { toErrorResponse } from "@/server/shared/errors/error-response";

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
      return toErrorResponse(
        new InvalidAuthPayloadError("Invalid registration payload"),
      );
    }

    return toErrorResponse(error, {
      fallbackMessage: "Register route failed",
    });
  }
}
