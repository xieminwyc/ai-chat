import Redis from "ioredis";

type RedisEnv = Record<string, string | undefined>;

export type RedisClientLike = Pick<Redis, "del" | "exists" | "get" | "set"> & {
  disconnect?: () => void;
  on?: (event: string, listener: (...args: unknown[]) => void) => void;
};

const globalForRedis = globalThis as typeof globalThis & {
  redisClient?: RedisClientLike | null;
};

function readEnvValue(env: RedisEnv, key: string) {
  const value = env[key]?.trim();
  return value ? value : null;
}

export function buildRedisConnectionUrl(env: RedisEnv = process.env) {
  const explicitUrl = readEnvValue(env, "REDIS_URL");

  if (explicitUrl) {
    return explicitUrl;
  }

  const host = readEnvValue(env, "REDIS_HOST");

  if (!host) {
    return null;
  }

  const port = readEnvValue(env, "REDIS_PORT") ?? "6379";
  const db = readEnvValue(env, "REDIS_DB");
  const username = readEnvValue(env, "REDIS_USERNAME");
  const password = readEnvValue(env, "REDIS_PASSWORD");
  const hasAuth = username != null || password != null;
  const auth = hasAuth
    ? `${encodeURIComponent(username ?? "")}:${encodeURIComponent(password ?? "")}@`
    : "";
  const path = db ? `/${db}` : "";

  // 兼容本地学习环境里把 Redis 拆成 host/port/password 的写法。
  return `redis://${auth}${host}:${port}${path}`;
}

export function createRedisClient(env: RedisEnv = process.env) {
  const connectionUrl = buildRedisConnectionUrl(env);

  if (!connectionUrl) {
    return null;
  }

  const client = new Redis(connectionUrl, {
    enableOfflineQueue: false,
    lazyConnect: true,
    maxRetriesPerRequest: 1,
  });

  client.on?.("error", () => {
    // Redis 在本项目里是增强层，不应该因为连接抖动把主流程打断。
  });

  return client;
}

export function getRedisClient(env: RedisEnv = process.env) {
  if (globalForRedis.redisClient !== undefined) {
    return globalForRedis.redisClient;
  }

  // Redis 连接只需要一份；开发热更新时复用全局单例，避免反复新建 socket。
  const client = createRedisClient(env);
  globalForRedis.redisClient = client;

  return client;
}

export function resetRedisClientForTests() {
  globalForRedis.redisClient?.disconnect?.();
  delete globalForRedis.redisClient;
}
