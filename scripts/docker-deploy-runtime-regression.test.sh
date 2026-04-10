#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DOCKERFILE_PATH="${ROOT_DIR}/Dockerfile"
DEPLOY_SCRIPT_PATH="${ROOT_DIR}/scripts/docker-deploy.sh"

assert_contains() {
  local file_path="$1"
  local expected="$2"

  if ! grep -Fq "$expected" "$file_path"; then
    echo "expected to find '${expected}' in ${file_path}"
    exit 1
  fi
}

assert_contains "${DOCKERFILE_PATH}" 'COPY --from=builder --chown=nextjs:nodejs /app/node_modules/prisma ./node_modules/prisma'
assert_contains "${DOCKERFILE_PATH}" 'COPY --from=builder --chown=nextjs:nodejs /app/prisma.config.ts ./prisma.config.ts'
assert_contains "${DOCKERFILE_PATH}" 'COPY --from=builder --chown=nextjs:nodejs /app/scripts/env.mjs ./scripts/env.mjs'

assert_contains "${DEPLOY_SCRIPT_PATH}" 'git fetch origin main'
assert_contains "${DEPLOY_SCRIPT_PATH}" 'git reset --hard origin/main'
assert_contains "${DEPLOY_SCRIPT_PATH}" 'node node_modules/prisma/build/index.js migrate deploy --schema=prisma/schema.prisma'

echo "docker deploy runtime regression checks passed"
