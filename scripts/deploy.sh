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

git_path_changed() {
  local from_ref="$1"
  local to_ref="$2"
  shift 2

  if [ "${from_ref}" = "${to_ref}" ]; then
    return 1
  fi

  git diff --quiet "${from_ref}" "${to_ref}" -- "$@"
  local diff_exit_code=$?

  if [ "${diff_exit_code}" -eq 1 ]; then
    return 0
  fi

  return "${diff_exit_code}"
}

echo "[deploy] entering ${APP_DIR}"
cd "${APP_DIR}"

PREVIOUS_HEAD="$(git rev-parse HEAD)"

echo "[deploy] pulling latest main branch"
git pull origin main

CURRENT_HEAD="$(git rev-parse HEAD)"

should_install_dependencies=false
should_generate_prisma=false

if [ ! -d node_modules ]; then
  echo "[deploy] node_modules is missing, dependencies must be installed"
  should_install_dependencies=true
elif git_path_changed "${PREVIOUS_HEAD}" "${CURRENT_HEAD}" package.json package-lock.json .npmrc; then
  echo "[deploy] dependency files changed, reinstalling dependencies"
  should_install_dependencies=true
elif [ -d patches ] && git_path_changed "${PREVIOUS_HEAD}" "${CURRENT_HEAD}" patches; then
  echo "[deploy] patch files changed, reinstalling dependencies"
  should_install_dependencies=true
else
  echo "[deploy] dependency files unchanged, skipping npm ci"
fi

if [ "${should_install_dependencies}" = true ]; then
  echo "[deploy] installing dependencies from ${NPM_REGISTRY}"
  run_with_heartbeat "installing dependencies" npm ci --registry="${NPM_REGISTRY}"
else
  if git_path_changed "${PREVIOUS_HEAD}" "${CURRENT_HEAD}" prisma/schema.prisma prisma.config.ts; then
    should_generate_prisma=true
  fi
fi

if [ "${should_generate_prisma}" = true ]; then
  echo "[deploy] prisma files changed, regenerating prisma client"
  run_with_heartbeat "generating prisma client" npx prisma generate
fi

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
