import { describe, expect, it, vi } from "vitest";

import { createBrowserId } from "@/lib/browser-id";

describe("createBrowserId", () => {
  it("uses crypto.randomUUID when available", () => {
    const originalCrypto = globalThis.crypto;

    Object.defineProperty(globalThis, "crypto", {
      configurable: true,
      value: {
        randomUUID: vi.fn(() => "uuid-from-crypto"),
      },
    });

    expect(createBrowserId()).toBe("uuid-from-crypto");

    Object.defineProperty(globalThis, "crypto", {
      configurable: true,
      value: originalCrypto,
    });
  });

  it("falls back when crypto.randomUUID is unavailable", () => {
    const originalCrypto = globalThis.crypto;

    Object.defineProperty(globalThis, "crypto", {
      configurable: true,
      value: {},
    });

    const id = createBrowserId();

    expect(typeof id).toBe("string");
    expect(id.length).toBeGreaterThan(10);

    Object.defineProperty(globalThis, "crypto", {
      configurable: true,
      value: originalCrypto,
    });
  });
});
