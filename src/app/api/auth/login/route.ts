import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { InvalidAuthPayloadError } from "@/server/auth/auth-errors";
import { loginUser } from "@/server/auth/auth-service";
import { loginSchema } from "@/server/auth/auth-schemas";
import {
  getSessionCookieName,
  getSessionCookieOptions,
} from "@/server/auth/session";
import { enforceLoginRateLimit } from "@/server/rate-limit/rate-limit-policies";
import { toErrorResponse } from "@/server/shared/errors/error-response";
import { extractRequestInfo } from "@/server/auth/device-info";

export async function POST(request: Request) {
  try {
    const body = loginSchema.parse(await request.json());
    const { deviceInfo, ipAddress } = extractRequestInfo(request);

    // 先挡掉明显的暴力尝试，再进入真正的密码校验和 session 创建。
    await enforceLoginRateLimit({
      email: body.email,
      ipAddress,
    });

    const result = await loginUser({
      ...body,
      deviceInfo,
      ipAddress,
    });

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
      return toErrorResponse(new InvalidAuthPayloadError("Invalid login payload"));
    }

    return toErrorResponse(error, {
      fallbackMessage: "Login route failed",
    });
  }
}
