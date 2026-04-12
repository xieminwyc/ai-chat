// @vitest-environment node

import path from "node:path";

import { describe, expect, it } from "vitest";

import { getWorkerRuntimeCommand } from "./worker.mjs";

describe("worker.mjs", () => {
  it("launches the worker through node with the tsx loader", () => {
    const command = getWorkerRuntimeCommand({
      cwd: "/app",
      execPath: "/usr/local/bin/node",
    });

    expect(command).toEqual({
      command: "/usr/local/bin/node",
      args: ["--import", "tsx", path.resolve("/app", "scripts/worker.ts")],
    });
  });
});
