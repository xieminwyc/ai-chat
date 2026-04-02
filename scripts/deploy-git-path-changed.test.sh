#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEPLOY_SCRIPT="${ROOT_DIR}/scripts/deploy.sh"

extract_git_path_changed() {
  awk '
    /^git_path_changed\(\) \{/ { capture = 1 }
    capture { print }
    capture && /^}/ { exit }
  ' "${DEPLOY_SCRIPT}"
}

eval "$(extract_git_path_changed)"

WORK_DIR="$(mktemp -d)"
trap 'rm -rf "${WORK_DIR}"' EXIT

cd "${WORK_DIR}"

git init --quiet
git config user.name "Codex"
git config user.email "codex@example.com"

printf '{\"name\":\"demo\"}\n' > package.json
printf '{\"lockfileVersion\":3}\n' > package-lock.json

git add package.json package-lock.json
git commit --quiet -m "initial"

before_empty_commit="$(git rev-parse HEAD)"
git commit --allow-empty --quiet -m "empty"
after_empty_commit="$(git rev-parse HEAD)"

if git_path_changed "${before_empty_commit}" "${after_empty_commit}" package.json package-lock.json; then
  echo "expected unchanged dependency files to return false for an empty commit"
  exit 1
fi

printf '{\"name\":\"demo\",\"version\":\"1.0.0\"}\n' > package.json
git add package.json
git commit --quiet -m "dependency update"

after_dependency_commit="$(git rev-parse HEAD)"

if ! git_path_changed "${after_empty_commit}" "${after_dependency_commit}" package.json package-lock.json; then
  echo "expected changed dependency files to return true"
  exit 1
fi

echo "deploy git_path_changed regression checks passed"
