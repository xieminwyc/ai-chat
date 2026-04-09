import { describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";

describe("generated prisma client", () => {
  it("includes the GuestSession model after guest trial schema changes", () => {
    expect(Prisma.ModelName.GuestSession).toBe("GuestSession");
  });
});
