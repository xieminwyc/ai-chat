import {
  buildRateLimitKey,
  getDefaultRateLimitStore,
  parseStoredRateLimitState,
  type RateLimitConsumeOptions,
  type RateLimitResult,
  type RateLimitStore,
} from "@/server/rate-limit/rate-limiter";

type TokenBucketState = {
  // 上次计算补充 token 的时间点。
  lastRefillAt: number;
  // 当前桶里剩余多少 token，允许是小数，便于按时间连续恢复。
  tokens: number;
};

type CreateTokenBucketRateLimiterOptions = {
  capacity: number;
  keyPrefix: string;
  refillTokens: number;
  refillWindowMs: number;
  store?: RateLimitStore;
};

export { createMemoryRateLimitStore } from "@/server/rate-limit/rate-limiter";

export function createTokenBucketRateLimiter(
  options: CreateTokenBucketRateLimiterOptions,
) {
  const store = options.store ?? getDefaultRateLimitStore();
  const refillRatePerMs = options.refillTokens / options.refillWindowMs;
  const fullRefillMs = Math.ceil(options.capacity / refillRatePerMs);
  const ttlMs = Math.max(fullRefillMs, options.refillWindowMs);

  return {
    async consume(
      subject: string,
      consumeOptions: RateLimitConsumeOptions = {},
    ): Promise<RateLimitResult> {
      const nowMs = consumeOptions.nowMs ?? Date.now();
      const key = buildRateLimitKey(options.keyPrefix, subject);
      const storedState = parseStoredRateLimitState<TokenBucketState>(
        await store.get(key),
      );
      const previousTokens = storedState?.tokens ?? options.capacity;
      const previousRefillAt = storedState?.lastRefillAt ?? nowMs;
      const elapsedMs = Math.max(0, nowMs - previousRefillAt);
      const availableTokens = Math.min(
        options.capacity,
        previousTokens + elapsedMs * refillRatePerMs,
      );

      if (availableTokens < 1) {
        // token 不够时不重置整个窗口，只告诉调用方“还差多久恢复出 1 个 token”。
        const retryAfterMs = Math.ceil((1 - availableTokens) / refillRatePerMs);

        await store.set(
          key,
          JSON.stringify({
            lastRefillAt: nowMs,
            tokens: availableTokens,
          } satisfies TokenBucketState),
          ttlMs,
        );

        return {
          allowed: false,
          limit: options.capacity,
          remaining: 0,
          resetAt: new Date(nowMs + retryAfterMs),
          retryAfterSeconds: Math.ceil(retryAfterMs / 1000),
        };
      }

      const remainingTokens = availableTokens - 1;

      // 这里把“扣完后的桶状态”写回去，下次请求从当前余额继续算恢复量。
      await store.set(
        key,
        JSON.stringify({
          lastRefillAt: nowMs,
          tokens: remainingTokens,
        } satisfies TokenBucketState),
        ttlMs,
      );

      return {
        allowed: true,
        limit: options.capacity,
        remaining: Math.max(0, Math.floor(remainingTokens)),
        resetAt: new Date(nowMs + ttlMs),
        retryAfterSeconds: 0,
      };
    },
  };
}
