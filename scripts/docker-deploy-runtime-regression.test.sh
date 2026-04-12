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

line_number_of() {
  local file_path="$1"
  local pattern="$2"

  grep -nF "$pattern" "$file_path" | head -n1 | cut -d: -f1
}

assert_occurs_before() {
  local file_path="$1"
  local first_pattern="$2"
  local second_pattern="$3"
  local first_line
  local second_line

  first_line="$(line_number_of "$file_path" "$first_pattern")"
  second_line="$(line_number_of "$file_path" "$second_pattern")"

  if [ -z "$first_line" ] || [ -z "$second_line" ]; then
    echo "expected both '${first_pattern}' and '${second_pattern}' in ${file_path}"
    exit 1
  fi

  if [ "$first_line" -ge "$second_line" ]; then
    echo "expected '${first_pattern}' to appear before '${second_pattern}' in ${file_path}"
    exit 1
  fi
}

assert_contains "${DEPLOY_SCRIPT_PATH}" 'git fetch origin main'
assert_contains "${DEPLOY_SCRIPT_PATH}" 'git reset --hard origin/main'
assert_contains "${DEPLOY_SCRIPT_PATH}" 'set -a'
assert_contains "${DEPLOY_SCRIPT_PATH}" '. "$ENV_FILE"'
assert_contains "${DEPLOY_SCRIPT_PATH}" 'require_env_var "APP_URL"'
assert_contains "${DEPLOY_SCRIPT_PATH}" 'require_env_var "REDIS_URL"'
assert_contains "${DEPLOY_SCRIPT_PATH}" 'node node_modules/prisma/build/index.js migrate deploy'
assert_occurs_before "${DEPLOY_SCRIPT_PATH}" 'docker compose -f "$COMPOSE_FILE" pull' 'docker run --rm \'
assert_contains "${DEPLOY_SCRIPT_PATH}" 'require_env_var "RESEND_API_KEY"'
assert_contains "${DEPLOY_SCRIPT_PATH}" 'require_env_var "RESEND_FROM_EMAIL"'

assert_contains "${DEPLOY_WORKFLOW_PATH}" 'ref: ${{ github.event.workflow_run.head_sha }}'

echo "docker deploy runtime regression checks passed"
