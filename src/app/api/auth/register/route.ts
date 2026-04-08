import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { registerUser } from "@/server/auth/auth-service";
import { registerSchema } from "@/server/auth/auth-schemas";

export async function POST(request: Request) {
  try {
    const body = registerSchema.parse(await request.json());
    const user = await registerUser(body);

    return NextResponse.json({ user }, { status: 201 });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: "Invalid registration payload" }, { status: 400 });
    }

    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }

    return NextResponse.json({ error: "Register route failed" }, { status: 500 });
  }
}
