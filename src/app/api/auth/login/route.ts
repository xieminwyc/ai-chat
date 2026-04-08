import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { loginUser } from "@/server/auth/auth-service";
import { loginSchema } from "@/server/auth/auth-schemas";
import {
  getSessionCookieName,
  getSessionCookieOptions,
} from "@/server/auth/session";

export async function POST(request: Request) {
  try {
    const body = loginSchema.parse(await request.json());
    const result = await loginUser(body);
    const response = NextResponse.json({ user: result.user });

    // cookie 里只写 session token，真正的用户身份仍然通过数据库恢复。
    response.cookies.set(
      getSessionCookieName(),
      result.sessionToken,
      {
        ...getSessionCookieOptions(),
        expires: result.expiresAt,
      },
    );

    return response;
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: "Invalid login payload" }, { status: 400 });
    }

    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    return NextResponse.json({ error: "Login route failed" }, { status: 500 });
  }
}
