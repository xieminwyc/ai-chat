#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEPLOY_SCRIPT_PATH="${ROOT_DIR}/scripts/docker-deploy.sh"
DEPLOY_WORKFLOW_PATH="${ROOT_DIR}/.github/workflows/deploy.yml"

assert_contains() {
  local file_path="$1"
  local expected="$2"

  if ! grep -Fq "$expected" "$file_path"; then
    echo "expected to find '${expected}' in ${file_path}"
    exit 1
  fi
}

assert_contains "${DEPLOY_SCRIPT_PATH}" 'git fetch origin main'
assert_contains "${DEPLOY_SCRIPT_PATH}" 'git reset --hard origin/main'
assert_contains "${DEPLOY_SCRIPT_PATH}" 'set -a'
assert_contains "${DEPLOY_SCRIPT_PATH}" '. "$ENV_FILE"'
assert_contains "${DEPLOY_SCRIPT_PATH}" 'require_env_var "APP_URL"'
assert_contains "${DEPLOY_SCRIPT_PATH}" 'require_env_var "REDIS_URL"'
assert_contains "${DEPLOY_SCRIPT_PATH}" 'APP_ENV=production node scripts/env.mjs npx prisma migrate deploy'
assert_contains "${DEPLOY_SCRIPT_PATH}" 'require_env_var "RESEND_API_KEY"'
assert_contains "${DEPLOY_SCRIPT_PATH}" 'require_env_var "RESEND_FROM_EMAIL"'

assert_contains "${DEPLOY_WORKFLOW_PATH}" 'ref: ${{ github.event.workflow_run.head_sha }}'

echo "docker deploy runtime regression checks passed"
