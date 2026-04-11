import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createCacheService,
  createMemoryCacheBackend,
} from "@/server/cache/cache-service";

describe("cache-service", () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it("remembers a computed value until the ttl expires", async () => {
    vi.useFakeTimers();
    const backend = createMemoryCacheBackend();
    const cache = createCacheService(backend);
    const loader = vi.fn().mockResolvedValue({
      id: "user_1",
      email: "alice@example.com",
    });

    const first = await cache.remember(
      "auth:user:user_1",
      { ttlSeconds: 60 },
      loader,
    );
    const second = await cache.remember(
      "auth:user:user_1",
      { ttlSeconds: 60 },
      loader,
    );

    vi.advanceTimersByTime(61_000);

    const third = await cache.remember(
      "auth:user:user_1",
      { ttlSeconds: 60 },
      loader,
    );

    expect(first).toEqual(second);
    expect(third).toEqual(first);
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it("drops broken json values instead of throwing", async () => {
    const backend = createMemoryCacheBackend();
    const cache = createCacheService(backend);

    await backend.set("broken-key", "{not-json", 60);

    await expect(cache.getJson("broken-key")).resolves.toBeNull();
    await expect(backend.get("broken-key")).resolves.toBeNull();
  });

  it("degrades to the source loader when the backend is unavailable", async () => {
    const cache = createCacheService({
      get: vi.fn().mockRejectedValue(new Error("redis down")),
      set: vi.fn().mockRejectedValue(new Error("redis down")),
      delete: vi.fn().mockResolvedValue(undefined),
      exists: vi.fn().mockResolvedValue(false),
    });
    const loader = vi.fn().mockResolvedValue({
      id: "user_2",
    });

    await expect(
      cache.remember("auth:user:user_2", { ttlSeconds: 60 }, loader),
    ).resolves.toEqual({ id: "user_2" });

    expect(loader).toHaveBeenCalledTimes(1);
  });
});
