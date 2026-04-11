import { describe, expect, it } from "vitest";

import {
  createMemoryRateLimitStore,
  createTokenBucketRateLimiter,
} from "@/server/rate-limit/token-bucket";

describe("token-bucket rate limiter", () => {
  it("blocks once the bucket is empty and recovers after refill", async () => {
    const limiter = createTokenBucketRateLimiter({
      keyPrefix: "chat:user",
      capacity: 2,
      refillTokens: 2,
      refillWindowMs: 60_000,
      store: createMemoryRateLimitStore(),
    });
    const now = new Date("2026-04-11T10:00:00.000Z").getTime();

    await expect(limiter.consume("user_1", { nowMs: now })).resolves.toMatchObject({
      allowed: true,
      remaining: 1,
    });
    await expect(limiter.consume("user_1", { nowMs: now })).resolves.toMatchObject({
      allowed: true,
      remaining: 0,
    });
    await expect(limiter.consume("user_1", { nowMs: now })).resolves.toMatchObject({
      allowed: false,
      remaining: 0,
      retryAfterSeconds: 30,
    });
    await expect(
      limiter.consume("user_1", { nowMs: now + 30_000 }),
    ).resolves.toMatchObject({
      allowed: true,
      remaining: 0,
    });
  });
});
