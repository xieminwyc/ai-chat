import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  getAppEnv,
  getEnvFileName,
  loadSelectedEnv,
} from "../../scripts/env.mjs";

describe("env loader", () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const dir of tempDirs) {
      rmSync(dir, { recursive: true, force: true });
    }

    tempDirs.length = 0;
  });

  it("defaults to local when APP_ENV is missing", () => {
    expect(getAppEnv(undefined)).toBe("local");
    expect(getEnvFileName(undefined)).toBe(".env.local");
  });

  it("maps test and production targets to their dedicated env files", () => {
    expect(getAppEnv("test")).toBe("test");
    expect(getEnvFileName("test")).toBe(".env.test");
    expect(getAppEnv("production")).toBe("production");
    expect(getEnvFileName("production")).toBe(".env.production");
  });

  it("loads the selected env file into process.env-like objects", () => {
    const cwd = mkdtempSync(path.join(tmpdir(), "ai-chat-env-"));
    tempDirs.push(cwd);

    writeFileSync(path.join(cwd, ".env.test"), "DATABASE_URL=test-db\nFEATURE_FLAG=1\n");

    const processEnv: NodeJS.ProcessEnv = {
      NODE_ENV: "test",
    };
    const result = loadSelectedEnv({ appEnv: "test", cwd, processEnv });

    expect(result.envFileName).toBe(".env.test");
    expect(result.parsed.DATABASE_URL).toBe("test-db");
    expect(processEnv.DATABASE_URL).toBe("test-db");
    expect(processEnv.FEATURE_FLAG).toBe("1");
  });

  it("does not overwrite values that are already present on process.env", () => {
    const cwd = mkdtempSync(path.join(tmpdir(), "ai-chat-env-"));
    tempDirs.push(cwd);

    writeFileSync(
      path.join(cwd, ".env.production"),
      "DATABASE_URL=prod-db\nSILICONFLOW_MODEL=remote-model\n",
    );

    const processEnv: NodeJS.ProcessEnv = {
      DATABASE_URL: "already-set-db",
      NODE_ENV: "test",
    };

    loadSelectedEnv({ appEnv: "production", cwd, processEnv });

    expect(processEnv.DATABASE_URL).toBe("already-set-db");
    expect(processEnv.SILICONFLOW_MODEL).toBe("remote-model");
  });
});
