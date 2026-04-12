#!/usr/bin/env node
/**
 * Worker 生产环境入口脚本
 * 用于 Docker 容器中启动 Worker
 */

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import dotenv from "dotenv";
import { execute } from "tsx";

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

// 加载环境
const result = loadSelectedEnv();
console.log(
  `[env-loader] using ${result.envFileName} (APP_ENV=${result.appEnv})`,
);

// 动态导入并运行 TypeScript worker
const workerPath = path.resolve(process.cwd(), "scripts/worker.ts");
execute(workerPath);
