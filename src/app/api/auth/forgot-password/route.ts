import { NextResponse } from "next/server";
import { ZodError } from "zod";

import {
  isEmailDeliveryError,
  sendPasswordResetEmail,
} from "@/server/auth/email-delivery";
import { requestPasswordResetForEmail } from "@/server/auth/auth-service";
import { forgotPasswordSchema } from "@/server/auth/auth-schemas";

const forgotPasswordSuccessPayload = {
  success: true,
  message: "如果该邮箱已注册，我们会向你发送重置密码邮件。",
};

export async function POST(request: Request) {
  try {
    const body = forgotPasswordSchema.parse(await request.json());
    const delivery = await requestPasswordResetForEmail(body.email);

    if (delivery) {
      await sendPasswordResetEmail(delivery);
    }

    return NextResponse.json(forgotPasswordSuccessPayload, { status: 202 });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: "Invalid forgot password payload" },
        { status: 400 },
      );
    }

    if (isEmailDeliveryError(error)) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Forgot password route failed",
      },
      { status: 500 },
    );
  }
}
