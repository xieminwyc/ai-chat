import { describe, expect, it } from "vitest";

import {
  createMemoryRateLimitStore,
  createSlidingWindowRateLimiter,
} from "@/server/rate-limit/sliding-window";

describe("sliding-window rate limiter", () => {
  it("counts requests inside the current window only", async () => {
    const limiter = createSlidingWindowRateLimiter({
      keyPrefix: "auth:login:ip",
      limit: 2,
      windowMs: 60_000,
      store: createMemoryRateLimitStore(),
    });
    const now = new Date("2026-04-11T10:00:00.000Z").getTime();

    await expect(limiter.consume("203.0.113.10", { nowMs: now })).resolves.toMatchObject({
      allowed: true,
      remaining: 1,
    });
    await expect(
      limiter.consume("203.0.113.10", { nowMs: now + 1_000 }),
    ).resolves.toMatchObject({
      allowed: true,
      remaining: 0,
    });
    await expect(
      limiter.consume("203.0.113.10", { nowMs: now + 2_000 }),
    ).resolves.toMatchObject({
      allowed: false,
      remaining: 0,
      retryAfterSeconds: 58,
    });
    await expect(
      limiter.consume("203.0.113.10", { nowMs: now + 61_000 }),
    ).resolves.toMatchObject({
      allowed: true,
      remaining: 1,
    });
  });
});
