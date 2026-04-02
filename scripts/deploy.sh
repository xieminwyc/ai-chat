#!/usr/bin/env bash

set -euo pipefail

APP_DIR="/root/apps/ai-chat"
HEALTHCHECK_URL="http://127.0.0.1:3000"
NPM_REGISTRY="https://registry.npmmirror.com"

run_with_heartbeat() {
  local label="$1"
  shift

  local start_time
  start_time="$(date +%s)"

  "$@" &
  local command_pid=$!

  while kill -0 "${command_pid}" 2>/dev/null; do
    sleep 20

    if kill -0 "${command_pid}" 2>/dev/null; then
      local now elapsed
      now="$(date +%s)"
      elapsed="$((now - start_time))"
      echo "[deploy] ${label} still running (${elapsed}s elapsed)"
    fi
  done

  wait "${command_pid}"
}

echo "[deploy] entering ${APP_DIR}"
cd "${APP_DIR}"

echo "[deploy] pulling latest main branch"
git pull origin main

echo "[deploy] installing dependencies from ${NPM_REGISTRY}"
run_with_heartbeat "installing dependencies" npm ci --registry="${NPM_REGISTRY}"

echo "[deploy] running prisma migrations"
run_with_heartbeat "running prisma migrations" npx prisma migrate deploy

echo "[deploy] building next app"
run_with_heartbeat "building next app" npm run build

echo "[deploy] restarting pm2 process"
pm2 restart ai-chat

echo "[deploy] waiting for app to respond"
sleep 2

echo "[deploy] running health check"
curl --fail --silent --show-error "${HEALTHCHECK_URL}" >/dev/null

echo "[deploy] deployment completed"
