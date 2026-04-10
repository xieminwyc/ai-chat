#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
GITIGNORE_PATH="${ROOT_DIR}/.gitignore"

assert_contains() {
  local file_path="$1"
  local expected="$2"

  if ! grep -Fq "$expected" "$file_path"; then
    echo "expected to find '${expected}' in ${file_path}"
    exit 1
  fi
}

assert_contains "${GITIGNORE_PATH}" '.env'
assert_contains "${GITIGNORE_PATH}" '.env.*'
assert_contains "${GITIGNORE_PATH}" '!.env.example'

cd "${ROOT_DIR}"

tracked_env_files="$(git ls-files '.env*')"

if [ "${tracked_env_files}" != ".env.example" ]; then
  echo "expected only .env.example to be tracked, got:"
  printf '%s\n' "${tracked_env_files}"
  exit 1
fi

echo "env file regression checks passed"
