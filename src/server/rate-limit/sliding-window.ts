import {
  buildRateLimitKey,
  getDefaultRateLimitStore,
  parseStoredRateLimitState,
  type RateLimitConsumeOptions,
  type RateLimitResult,
  type RateLimitStore,
} from "@/server/rate-limit/rate-limiter";

type CreateSlidingWindowRateLimiterOptions = {
  keyPrefix: string;
  limit: number;
  store?: RateLimitStore;
  windowMs: number;
};

export { createMemoryRateLimitStore } from "@/server/rate-limit/rate-limiter";

export function createSlidingWindowRateLimiter(
  options: CreateSlidingWindowRateLimiterOptions,
) {
  const store = options.store ?? getDefaultRateLimitStore();

  return {
    async consume(
      subject: string,
      consumeOptions: RateLimitConsumeOptions = {},
    ): Promise<RateLimitResult> {
      const nowMs = consumeOptions.nowMs ?? Date.now();
      const windowStartMs = nowMs - options.windowMs;
      const key = buildRateLimitKey(options.keyPrefix, subject);
      const storedTimestamps =
        parseStoredRateLimitState<number[]>(await store.get(key)) ?? [];
      const activeTimestamps = storedTimestamps.filter(
        (timestamp) => timestamp > windowStartMs,
      );

      if (activeTimestamps.length >= options.limit) {
        // 滑动窗口的关键是只看“当前窗口内还活着的时间戳”，而不是固定整点重置。
        const resetAtMs = activeTimestamps[0] + options.windowMs;

        await store.set(key, JSON.stringify(activeTimestamps), options.windowMs);

        return {
          allowed: false,
          limit: options.limit,
          remaining: 0,
          resetAt: new Date(resetAtMs),
          retryAfterSeconds: Math.ceil((resetAtMs - nowMs) / 1000),
        };
      }

      const nextTimestamps = [...activeTimestamps, nowMs];
      const oldestTimestamp = nextTimestamps[0] ?? nowMs;

      // 成功请求也要把新时间戳写回去，这样后续请求能看到最新窗口。
      await store.set(key, JSON.stringify(nextTimestamps), options.windowMs);

      return {
        allowed: true,
        limit: options.limit,
        remaining: options.limit - nextTimestamps.length,
        resetAt: new Date(oldestTimestamp + options.windowMs),
        retryAfterSeconds: 0,
      };
    },
  };
}
