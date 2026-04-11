import { getRedisClient, type RedisClientLike } from "@/lib/redis";

export type CacheBackend = {
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds?: number): Promise<void>;
};

type CacheRememberOptions = {
  ttlSeconds: number;
};

type MemoryCacheEntry = {
  expiresAt: number | null;
  value: string;
};

const globalForCache = globalThis as typeof globalThis & {
  cacheService?: ReturnType<typeof createCacheService>;
};

function createNoopCacheBackend(): CacheBackend {
  return {
    async delete() {},
    async exists() {
      return false;
    },
    async get() {
      return null;
    },
    async set() {},
  };
}

function getFreshMemoryValue(
  map: Map<string, MemoryCacheEntry>,
  key: string,
) {
  const entry = map.get(key);

  if (!entry) {
    return null;
  }

  // 纯内存 fallback 也要自己处理 TTL，不然测试和无 Redis 场景会越跑越脏。
  if (entry.expiresAt != null && entry.expiresAt <= Date.now()) {
    map.delete(key);
    return null;
  }

  return entry;
}

export function createMemoryCacheBackend(): CacheBackend {
  const map = new Map<string, MemoryCacheEntry>();

  return {
    async delete(key) {
      map.delete(key);
    },
    async exists(key) {
      return getFreshMemoryValue(map, key) != null;
    },
    async get(key) {
      return getFreshMemoryValue(map, key)?.value ?? null;
    },
    async set(key, value, ttlSeconds) {
      map.set(key, {
        value,
        expiresAt:
          ttlSeconds == null ? null : Date.now() + ttlSeconds * 1000,
      });
    },
  };
}

export function createRedisCacheBackend(
  client: RedisClientLike | null = getRedisClient(),
): CacheBackend {
  if (!client) {
    // Redis 没配置时直接退成空 backend，调用方继续走原始 loader。
    return createNoopCacheBackend();
  }

  return {
    async delete(key) {
      await client.del(key);
    },
    async exists(key) {
      return (await client.exists(key)) > 0;
    },
    async get(key) {
      return client.get(key);
    },
    async set(key, value, ttlSeconds) {
      if (ttlSeconds == null) {
        await client.set(key, value);
        return;
      }

      await client.set(key, value, "EX", ttlSeconds);
    },
  };
}

export function createCacheService(backend: CacheBackend) {
  return {
    async delete(key: string) {
      try {
        await backend.delete(key);
      } catch {
        // cache 永远只做加速，不应该反向影响主流程。
      }
    },
    async exists(key: string) {
      try {
        return await backend.exists(key);
      } catch {
        return false;
      }
    },
    async getJson<T>(key: string) {
      try {
        const rawValue = await backend.get(key);

        if (rawValue == null) {
          return null;
        }

        return JSON.parse(rawValue) as T;
      } catch {
        // 读到坏数据时顺手清掉，避免后续请求反复命中同一份脏缓存。
        await this.delete(key);
        return null;
      }
    },
    async remember<T>(
      key: string,
      options: CacheRememberOptions,
      loader: () => Promise<T>,
    ) {
      // 这里实现的就是最常见的 Cache-Aside：先读缓存，miss 再回源。
      const cachedValue = await this.getJson<T>(key);

      if (cachedValue != null) {
        return cachedValue;
      }

      const freshValue = await loader();
      await this.setJson(key, freshValue, options);
      return freshValue;
    },
    async setJson(key: string, value: unknown, options: CacheRememberOptions) {
      try {
        await backend.set(key, JSON.stringify(value), options.ttlSeconds);
      } catch {
        // 写缓存失败时忽略，直接继续让主流程走数据库/原始逻辑。
      }
    },
  };
}

export function getCacheService() {
  if (globalForCache.cacheService) {
    return globalForCache.cacheService;
  }

  // 业务层永远拿统一的 cache service，不关心底下是 Redis 还是 fallback。
  globalForCache.cacheService = createCacheService(
    createRedisCacheBackend(),
  );

  return globalForCache.cacheService;
}
