#!/bin/bash
# 服务器上的 Docker 部署脚本
# 由 GitHub Actions Deploy workflow 通过 SSH 触发执行
# 职责：登录 GHCR → 拉取最新镜像 → 重启容器 → 数据库迁移 → 健康检查
set -e

PROJECT_DIR="/root/apps/ai-chat"
COMPOSE_FILE="$PROJECT_DIR/compose.yml"
APP_URL="http://localhost:3000"
HEALTH_RETRIES=10
HEALTH_INTERVAL=5

log() {
  echo "[docker-deploy] $1"
}

# ── 1. 进入项目目录 ──────────────────────────────────────────
cd "$PROJECT_DIR"
log "working directory: $PROJECT_DIR"

# ── 2. 更新代码（compose.yml / scripts 等配置文件跟着更新）──
log "pulling latest code..."
git pull origin main

# ── 3. 登录 GHCR，让 docker compose pull 能拉到私有镜像 ──────
# GHCR_TOKEN 需要提前在服务器 ~/.bashrc 或 /etc/environment 里配置：
#   export GHCR_TOKEN=<Personal Access Token，需要 read:packages 权限>
# 公开仓库的镜像可以跳过这一步
if [ -n "$GHCR_TOKEN" ]; then
  log "logging in to GHCR..."
  echo "$GHCR_TOKEN" | docker login ghcr.io -u "$GHCR_USER" --password-stdin
else
  log "GHCR_TOKEN not set, skipping login (only works for public images)"
fi

# ── 4. 拉取最新镜像 ─────────────────────────────────────────
log "pulling latest image..."
docker compose -f "$COMPOSE_FILE" pull

# ── 5. 执行数据库迁移（可选，仅在 schema 变更时需要）──────────
# 如需手动执行迁移，在服务器上运行：
#   docker compose -f /root/apps/ai-chat/compose.yml run --rm --entrypoint "" \
#     ai-chat sh -c "npx --yes prisma migrate deploy --schema=prisma/schema.prisma"

# ── 6. 重启应用容器（使用新拉取的镜像）─────────────────────
log "starting containers..."
docker compose -f "$COMPOSE_FILE" up -d

# ── 7. 健康检查 ─────────────────────────────────────────────
log "waiting for app to be healthy..."
for i in $(seq 1 $HEALTH_RETRIES); do
  if curl -sf "$APP_URL" > /dev/null 2>&1; then
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

# ── 8. 清理旧镜像（避免磁盘空间被历史镜像撑满）────────────
log "cleaning up dangling images..."
docker image prune -f

log "deployment completed successfully"
