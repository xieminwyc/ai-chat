import { NextResponse } from "next/server";

import { isAppErrorLike } from "@/server/shared/errors/app-error";

type ErrorResponseOptions = {
  fallbackCode?: string;
  fallbackMessage?: string;
  fallbackStatus?: number;
};

export function createErrorResponse(
  code: string,
  message: string,
  status: number,
) {
  return NextResponse.json(
    {
      error: {
        code,
        message,
      },
    },
    { status },
  );
}

export function toErrorResponse(
  error: unknown,
  {
    fallbackCode = "auth.internal_error",
    fallbackMessage = "Internal server error",
    fallbackStatus = 500,
  }: ErrorResponseOptions = {},
) {
  if (isAppErrorLike(error)) {
    return createErrorResponse(error.code, error.message, error.httpStatus);
  }

  return createErrorResponse(fallbackCode, fallbackMessage, fallbackStatus);
}
