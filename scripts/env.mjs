import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import process from "node:process";
import { fileURLToPath } from "node:url";

import dotenv from "dotenv";

const ENV_FILE_BY_TARGET = {
  local: ".env.local",
  test: ".env.test",
  production: ".env.production",
};

export function getAppEnv(appEnv = process.env.APP_ENV) {
  if (appEnv === "test") {
    return "test";
  }

  if (appEnv === "production" || appEnv === "prod" || appEnv === "pro") {
    return "production";
  }

  return "local";
}

export function getEnvFileName(appEnv = process.env.APP_ENV) {
  return ENV_FILE_BY_TARGET[getAppEnv(appEnv)];
}

export function loadSelectedEnv({
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

function runCommand(commandAndArgs) {
  if (commandAndArgs.length === 0) {
    return;
  }

  const child = spawn(commandAndArgs[0], commandAndArgs.slice(1), {
    stdio: "inherit",
    env: process.env,
    shell: process.platform === "win32",
  });

  child.on("exit", (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }

    process.exit(code ?? 0);
  });

  child.on("error", (error) => {
    console.error(`[env-loader] failed to start command: ${error.message}`);
    process.exit(1);
  });
}

const currentFilePath = fileURLToPath(import.meta.url);
const isDirectRun =
  Boolean(process.argv[1]) &&
  path.resolve(process.argv[1]) === path.resolve(currentFilePath);

if (isDirectRun) {
  const result = loadSelectedEnv();
  console.log(`[env-loader] using ${result.envFileName} (APP_ENV=${result.appEnv})`);
  runCommand(process.argv.slice(2));
}
