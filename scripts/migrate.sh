#!/usr/bin/env bash
# Run Alembic migrations against the Cloud SQL (prod) database via the Cloud SQL Auth Proxy.
# Auth: uses your gcloud access token (no ADC needed). DB password is read from Secret Manager.
# Requires the backend dev venv (backend/.venv) for alembic + deps.
set -euo pipefail
cd "$(dirname "$0")/.."
source scripts/_config.sh

PORT="${MIGRATE_PORT:-5436}"
PROXY_BIN="${PROXY_BIN:-/tmp/cloud-sql-proxy}"

if [ ! -x "${PROXY_BIN}" ]; then
  echo "→ Downloading cloud-sql-proxy…"
  curl -sSL -o "${PROXY_BIN}" "https://storage.googleapis.com/cloud-sql-connectors/cloud-sql-proxy/v2.14.1/cloud-sql-proxy.linux.amd64"
  chmod +x "${PROXY_BIN}"
fi

echo "→ Starting Cloud SQL Auth Proxy on 127.0.0.1:${PORT}…"
"${PROXY_BIN}" "${SQL_INSTANCE}" --port "${PORT}" --token "$(gcloud auth print-access-token)" \
  > /tmp/mygarage-migrate-proxy.log 2>&1 &
PROXY_PID=$!
trap 'kill ${PROXY_PID} 2>/dev/null || true' EXIT
sleep 7

DBPASS="$(gcloud secrets versions access latest --secret=db-password --project="${PROJECT_ID}")"
echo "→ alembic upgrade head (prod)…"
( cd backend && DATABASE_URL="postgresql+psycopg://carsocial:${DBPASS}@127.0.0.1:${PORT}/carsocial" .venv/bin/alembic upgrade head )

echo "✓ Migrations applied to Cloud SQL."
