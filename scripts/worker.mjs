#!/usr/bin/env node
/**
 * Worker 生产环境入口脚本
 * 用于 Docker 容器中启动 Worker
 */

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";
import dotenv from "dotenv";

// 设置环境变量
process.env.APP_ENV = "production";

// 加载环境配置 (内联 env.mjs 的逻辑)
const ENV_FILE_BY_TARGET = {
  local: ".env.local",
  test: ".env.test",
  production: ".env.production",
};

function getAppEnv(appEnv = process.env.APP_ENV) {
  if (appEnv === "test") {
    return "test";
  }
  if (appEnv === "production" || appEnv === "prod" || appEnv === "pro") {
    return "production";
  }
  return "local";
}

function getEnvFileName(appEnv = process.env.APP_ENV) {
  return ENV_FILE_BY_TARGET[getAppEnv(appEnv)];
}

function loadSelectedEnv({
  appEnv = process.env.APP_ENV,
  cwd = process.cwd(),
  processEnv = process.env,
} = {}) {
  const envFileName = getEnvFileName(appEnv);
  const envFilePath = path.join(cwd, envFileName);
  const parsed = existsSync(envFilePath)
    ? dotenv.parse(readFileSync(envFilePath))
    : {};

  dotenv.populate(processEnv, parsed, {
    override: false,
  });

  processEnv.APP_ENV = getAppEnv(appEnv);

  return {
    appEnv: processEnv.APP_ENV,
    envFileName,
    envFilePath,
    parsed,
  };
}

export function getWorkerRuntimeCommand({
  cwd = process.cwd(),
  execPath = process.execPath,
} = {}) {
  return {
    command: execPath,
    args: ["--import", "tsx", path.resolve(cwd, "scripts/worker.ts")],
  };
}

export async function runWorkerProcess({
  cwd = process.cwd(),
  execPath = process.execPath,
  processEnv = process.env,
} = {}) {
  const runtime = getWorkerRuntimeCommand({ cwd, execPath });

  await new Promise((resolve, reject) => {
    const child = spawn(runtime.command, runtime.args, {
      cwd,
      env: processEnv,
      stdio: "inherit",
    });

    const forwardSignal = (signal) => {
      if (!child.killed) {
        child.kill(signal);
      }
    };

    process.once("SIGINT", forwardSignal);
    process.once("SIGTERM", forwardSignal);

    child.once("error", (error) => {
      reject(error);
    });

    child.once("exit", (code, signal) => {
      process.removeListener("SIGINT", forwardSignal);
      process.removeListener("SIGTERM", forwardSignal);

      if (signal) {
        process.kill(process.pid, signal);
        return;
      }

      if (code === 0) {
        resolve(undefined);
        return;
      }

      reject(new Error(`Worker process exited with code ${code ?? "unknown"}`));
    });
  });
}

export async function main({
  appEnv = process.env.APP_ENV,
  cwd = process.cwd(),
  execPath = process.execPath,
  processEnv = process.env,
} = {}) {
  const result = loadSelectedEnv({
    appEnv,
    cwd,
    processEnv,
  });

  console.log(
    `[env-loader] using ${result.envFileName} (APP_ENV=${result.appEnv})`,
  );

  await runWorkerProcess({
    cwd,
    execPath,
    processEnv,
  });
}

const isEntrypoint =
  process.argv[1] &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;

if (isEntrypoint) {
  main().catch((error) => {
    console.error("[worker.mjs] Failed to start worker:", error);
    process.exit(1);
  });
}
