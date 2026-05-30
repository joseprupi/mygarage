#!/usr/bin/env bash
# Build + deploy the Next.js frontend to Firebase Hosting (web frameworks / SSR).
# Run from anywhere; it cd's to the repo root (firebase.json there, source=frontend).
# NEXT_PUBLIC_* are baked at build time, so they MUST be exported before `firebase deploy`.
#   - NEXT_PUBLIC_API_BASE_URL: browser calls Cloud Run directly (the Next /api rewrite hangs under Firebase SSR).
#   - NEXT_PUBLIC_GOOGLE_CLIENT_ID: Google Sign-In client.
# Prereqs: `firebase login`, and `firebase experiments:enable webframeworks` (once).
set -euo pipefail
cd "$(dirname "$0")/.."
source scripts/_config.sh

export NEXT_PUBLIC_API_BASE_URL="${BACKEND_URL}"
export NEXT_PUBLIC_GOOGLE_CLIENT_ID="${GOOGLE_CLIENT_ID}"

echo "→ Building + deploying frontend to Firebase Hosting (${PROJECT_ID})…"
echo "  API base: ${NEXT_PUBLIC_API_BASE_URL}"
firebase deploy --only hosting --project "${PROJECT_ID}"

echo "✓ Frontend deployed: https://${PROJECT_ID}.web.app"
