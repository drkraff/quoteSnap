#!/usr/bin/env bash
# Backend integration tests against Postgres.
# Uses DATABASE_URL when it is already set (CI service container, or a host database).
# Otherwise starts docker compose (quotesnap-db on localhost:5433).
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"

if [[ -z "${DATABASE_URL:-}" ]]; then
  if ! command -v docker >/dev/null 2>&1; then
    echo "Set DATABASE_URL, or install Docker and run: docker compose up -d" >&2
    exit 1
  fi
  docker compose up -d --wait
  export DATABASE_URL="postgresql://postgres:postgres@localhost:5433/quotesnap"
fi

export JWT_ACCESS_SECRET="${JWT_ACCESS_SECRET:-integration-test-jwt-secret-32-chars-min}"
npm run test:integration --workspace=apps/backend
