#!/bin/bash
# 服务器上的 Docker 部署脚本
# 由 GitHub Actions Deploy workflow 通过 SSH 触发执行
# 职责：校验生产 env → 登录 ACR → 拉取最新镜像 → 重启容器 → 健康检查
set -euo pipefail

PROJECT_DIR="/root/apps/ai-chat"
COMPOSE_FILE="$PROJECT_DIR/compose.yml"
ENV_FILE="$PROJECT_DIR/.env.production"
APP_IMAGE="crpi-y387mtxqhofw4ibe.cn-guangzhou.personal.cr.aliyuncs.com/xieminwyc/ai-chat:latest"
HEALTHCHECK_URL="http://localhost:3000"
HEALTH_RETRIES=10
HEALTH_INTERVAL=5

log() {
  echo "[docker-deploy] $1"
}

require_env_var() {
  local variable_name="$1"

  if [ -z "${!variable_name:-}" ]; then
    log "missing required env var in ${ENV_FILE}: ${variable_name}"
    exit 1
  fi
}

# ── 1. 进入项目目录 ──────────────────────────────────────────
cd "$PROJECT_DIR"
log "working directory: $PROJECT_DIR"

# ── 2. 更新代码（compose.yml / scripts 等配置文件跟着更新）──
log "pulling latest code..."
git fetch origin main
git reset --hard origin/main

# ── 3. 校验生产环境变量 ───────────────────────────────────────
if [ ! -f "$ENV_FILE" ]; then
  log "missing env file: $ENV_FILE"
  exit 1
fi

log "loading runtime env from $ENV_FILE"
set -a
. "$ENV_FILE"
set +a

require_env_var "APP_URL"
require_env_var "DATABASE_URL"
require_env_var "REDIS_URL"
require_env_var "RESEND_API_KEY"
require_env_var "RESEND_FROM_EMAIL"
require_env_var "SILICONFLOW_API_KEY"
require_env_var "SILICONFLOW_BASE_URL"
require_env_var "SILICONFLOW_MODEL"

# ── 4. 登录阿里云 ACR ──────────────────────────────────────────
# ACR_PASSWORD 需要提前在服务器 ~/.bashrc 或 /etc/environment 里配置：
#   export ACR_PASSWORD=<阿里云容器镜像服务密码>
# 仓库设置为公开时可跳过登录
if [ -n "${ACR_PASSWORD:-}" ]; then
  log "logging in to Alibaba Cloud ACR..."
  echo "$ACR_PASSWORD" | docker login crpi-y387mtxqhofw4ibe.cn-guangzhou.personal.cr.aliyuncs.com -u "$ACR_USERNAME" --password-stdin
else
  log "ACR_PASSWORD not set, skipping login (only works for public images)"
fi

# ── 5. 拉取最新镜像 ─────────────────────────────────────────
log "pulling latest image..."
docker compose -f "$COMPOSE_FILE" pull

# ── 6. 使用刚拉取的镜像执行 Prisma migration ────────────────
# 使用容器运行 migration，避免宿主机网络问题，同时确保 schema 与部署镜像一致
# 注意：使用 -e 传递已加载的环境变量，而不是 --env-file
# 因为 --env-file 会把引号当作值的一部分，导致 DATABASE_URL 解析失败
log "running prisma migrations using container..."
docker run --rm \
  --network ai-chat_default \
  -e DATABASE_URL \
  -e REDIS_URL \
  -e APP_URL \
  -e RESEND_API_KEY \
  -e RESEND_FROM_EMAIL \
  -e SILICONFLOW_API_KEY \
  -e SILICONFLOW_BASE_URL \
  -e SILICONFLOW_MODEL \
  "$APP_IMAGE" \
  node node_modules/prisma/build/index.js migrate deploy

# ── 7. 重启应用容器（使用新拉取的镜像）─────────────────────
log "starting containers..."
docker compose -f "$COMPOSE_FILE" up -d

# ── 8. 健康检查 ─────────────────────────────────────────────
log "waiting for app to be healthy..."
for i in $(seq 1 $HEALTH_RETRIES); do
  if curl -sf "$HEALTHCHECK_URL" > /dev/null 2>&1; then
    log "health check passed"
    break
  fi
  if [ "$i" -eq "$HEALTH_RETRIES" ]; then
    log "health check failed after ${HEALTH_RETRIES} retries"
    exit 1
  fi
  log "not ready yet, retrying in ${HEALTH_INTERVAL}s... ($i/$HEALTH_RETRIES)"
  sleep "$HEALTH_INTERVAL"
done

# ── 9. 清理旧镜像（避免磁盘空间被历史镜像撑满）────────────
log "cleaning up dangling images..."
docker image prune -f

log "deployment completed successfully"
