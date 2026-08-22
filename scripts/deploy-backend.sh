#!/usr/bin/env bash
# Deploy the FastAPI backend to Cloud Run (builds the image from backend/Dockerfile via Cloud Build).
# Secrets come from Secret Manager (database-url, jwt-secret, storage-hmac-access, storage-hmac-secret).
# The botocore checksum env (AWS_*_CHECKSUM_*) for GCS compat is baked into backend/Dockerfile.
set -euo pipefail
cd "$(dirname "$0")/.."
source scripts/_config.sh

# Secrets/env: AI scanning (Gemini) always; Cloudflare Stream only when configured.
SECRETS="DATABASE_URL=database-url:latest,JWT_SECRET=jwt-secret:latest,STORAGE_ACCESS_KEY_ID=storage-hmac-access:latest,STORAGE_SECRET_ACCESS_KEY=storage-hmac-secret:latest,GEMINI_API_KEY=gemini-api-key:latest"
ENV_VARS="^@^STORAGE_ENDPOINT_URL=https://storage.googleapis.com@STORAGE_REGION=${REGION}@STORAGE_BUCKET=${MEDIA_BUCKET}@PUBLIC_MEDIA_BASE_URL=https://storage.googleapis.com/${MEDIA_BUCKET}@GOOGLE_CLIENT_ID=${GOOGLE_CLIENT_ID}@CORS_ORIGINS=${CORS_ORIGINS}"
if [ -n "${CLOUDFLARE_ACCOUNT_ID}" ] && [ -n "${CLOUDFLARE_STREAM_CUSTOMER_CODE}" ]; then
  SECRETS="${SECRETS},CLOUDFLARE_STREAM_API_TOKEN=cloudflare-stream-token:latest"
  ENV_VARS="${ENV_VARS}@CLOUDFLARE_ACCOUNT_ID=${CLOUDFLARE_ACCOUNT_ID}@CLOUDFLARE_STREAM_CUSTOMER_CODE=${CLOUDFLARE_STREAM_CUSTOMER_CODE}"
fi

echo "→ Deploying '${BACKEND_SERVICE}' to Cloud Run (${PROJECT_ID} / ${REGION})…"
gcloud run deploy "${BACKEND_SERVICE}" \
  --source backend \
  --region "${REGION}" --project "${PROJECT_ID}" \
  --service-account "${SERVICE_ACCOUNT}" \
  --add-cloudsql-instances "${SQL_INSTANCE}" \
  --allow-unauthenticated \
  --set-secrets "${SECRETS}" \
  --set-env-vars "${ENV_VARS}"

echo "✓ Backend deployed: ${BACKEND_URL}"
echo "  Smoke test: curl -s ${BACKEND_URL}/health"
