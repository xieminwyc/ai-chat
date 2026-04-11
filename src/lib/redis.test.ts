import { beforeEach, describe, expect, it, vi } from "vitest";

const redisConstructor = vi.hoisted(() => vi.fn());

vi.mock("ioredis", () => ({
  default: redisConstructor,
}));

import {
  buildRedisConnectionUrl,
  createRedisClient,
  getRedisClient,
  resetRedisClientForTests,
} from "@/lib/redis";

describe("redis config", () => {
  beforeEach(() => {
    redisConstructor.mockReset();
    redisConstructor.mockImplementation(
      function MockRedisClient() {
        return {
          disconnect: vi.fn(),
          on: vi.fn(),
        };
      },
    );
    resetRedisClientForTests();
  });

  it("uses REDIS_URL when it is present", () => {
    expect(
      buildRedisConnectionUrl({
        REDIS_URL: "redis://cache.example.com:6379/2",
      }),
    ).toBe("redis://cache.example.com:6379/2");
  });

  it("builds a redis url from host based environment variables", () => {
    expect(
      buildRedisConnectionUrl({
        REDIS_HOST: "localhost",
        REDIS_PORT: "6380",
        REDIS_PASSWORD: "secret",
        REDIS_DB: "4",
      }),
    ).toBe("redis://:secret@localhost:6380/4");
  });

  it("returns null when no redis configuration is available", () => {
    expect(buildRedisConnectionUrl({})).toBeNull();
    expect(createRedisClient({})).toBeNull();
  });

  it("creates and reuses a singleton redis client", () => {
    const env = {
      REDIS_URL: "redis://localhost:6379",
    };

    const first = getRedisClient(env);
    const second = getRedisClient(env);

    expect(redisConstructor).toHaveBeenCalledTimes(1);
    expect(first).toBe(second);
  });
});
