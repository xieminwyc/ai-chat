import { AppError } from "@/server/shared/errors/app-error";

import type { RateLimitResult } from "@/server/rate-limit/rate-limiter";

export const RATE_LIMIT_ERROR_CODES = {
  EXCEEDED: "rate_limit.exceeded",
} as const;

export class RateLimitExceededError extends AppError {
  limit: number;
  resetAt: Date;
  retryAfterSeconds: number;

  constructor(
    result: RateLimitResult,
    message = "Too many requests. Please try again later.",
  ) {
    // 除了标准 429 之外，把 reset/retry 信息也带上，后面要接响应头会更方便。
    super({
      code: RATE_LIMIT_ERROR_CODES.EXCEEDED,
      message,
      httpStatus: 429,
    });
    this.limit = result.limit;
    this.resetAt = result.resetAt;
    this.retryAfterSeconds = result.retryAfterSeconds;
  }
}
