import { getRedisClient, type RedisClientLike } from "@/lib/redis";

export type RateLimitStore = {
  delete(key: string): Promise<void>;
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlMs: number): Promise<void>;
};

export type RateLimitConsumeOptions = {
  nowMs?: number;
};

export type RateLimitResult = {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: Date;
  retryAfterSeconds: number;
};

type MemoryRateLimitEntry = {
  expiresAt: number;
  value: string;
};

const globalForRateLimit = globalThis as typeof globalThis & {
  memoryRateLimitStore?: RateLimitStore;
};

function createRedisRateLimitStore(client: RedisClientLike | null): RateLimitStore {
  if (!client) {
    // 本地开发或 Redis 不可用时，限流仍然能在单进程里工作。
    return createMemoryRateLimitStore();
  }

  return {
    async delete(key) {
      await client.del(key);
    },
    async get(key) {
      return client.get(key);
    },
    async set(key, value, ttlMs) {
      await client.set(key, value, "PX", ttlMs);
    },
  };
}

export function buildRateLimitKey(prefix: string, subject: string) {
  return `${prefix}:${subject}`;
}

export function createMemoryRateLimitStore(): RateLimitStore {
  const map = new Map<string, MemoryRateLimitEntry>();

  const getFreshEntry = (key: string) => {
    const entry = map.get(key);

    if (!entry) {
      return null;
    }

    // memory store 没有 Redis 的自动过期能力，只能在读取时顺手回收。
    if (entry.expiresAt <= Date.now()) {
      map.delete(key);
      return null;
    }

    return entry;
  };

  return {
    async delete(key) {
      map.delete(key);
    },
    async get(key) {
      return getFreshEntry(key)?.value ?? null;
    },
    async set(key, value, ttlMs) {
      map.set(key, {
        value,
        expiresAt: Date.now() + ttlMs,
      });
    },
  };
}

export function getDefaultRateLimitStore() {
  const redisClient = getRedisClient();

  if (redisClient) {
    return createRedisRateLimitStore(redisClient);
  }

  if (!globalForRateLimit.memoryRateLimitStore) {
    // 复用同一个进程内 store，避免每次检查限流都丢失计数状态。
    globalForRateLimit.memoryRateLimitStore = createMemoryRateLimitStore();
  }

  return globalForRateLimit.memoryRateLimitStore;
}

export function parseStoredRateLimitState<T>(rawValue: string | null) {
  if (!rawValue) {
    return null;
  }

  try {
    return JSON.parse(rawValue) as T;
  } catch {
    // 脏状态直接当 miss 处理，比让整个请求因为 JSON 坏掉更合理。
    return null;
  }
}
