import { describe, expect, it } from "vitest";

import { getPrismaDatabaseUrl } from "@/lib/prisma-config";

describe("getPrismaDatabaseUrl", () => {
  it("returns DATABASE_URL from the provided process env", () => {
    expect(
      getPrismaDatabaseUrl({
        DATABASE_URL: "postgresql://ci:ci@localhost:5432/ai_chat_app",
      }),
    ).toBe("postgresql://ci:ci@localhost:5432/ai_chat_app");
  });

  it("throws when DATABASE_URL is missing", () => {
    expect(() => getPrismaDatabaseUrl({})).toThrowError(
      "DATABASE_URL is required for Prisma config.",
    );
  });
});
