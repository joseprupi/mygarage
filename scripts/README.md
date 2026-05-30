# Deploy scripts

Repeatable deploys for the production stack (Cloud Run + Cloud SQL + GCS + Firebase Hosting),
all in the **`mygarage-app-9feafd`** project. Non-secret config lives in `_config.sh`; secrets stay
in Secret Manager. See `../plan/ARCHITECTURE.md` for the full picture.

> ⚠️ Running these **deploys to production.** Per `plan/AGENTS.md`, only deploy when the owner says so.

## Prerequisites (one-time)
- `gcloud auth login` (as the project owner) and `firebase login`.
- `firebase experiments:enable webframeworks`.
- `backend/.venv` present (for `migrate.sh`'s alembic) — `cd backend && python -m venv .venv && .venv/bin/pip install -e ".[dev]"`.

## Usage (from repo root or anywhere)
```bash
./scripts/deploy-backend.sh     # build + deploy FastAPI to Cloud Run
./scripts/migrate.sh            # run alembic migrations against Cloud SQL (do after a schema change)
./scripts/deploy-frontend.sh    # build + deploy Next.js to Firebase Hosting
```
Typical full release after code changes: **migrate (if schema changed) → deploy-backend → deploy-frontend.**

## Notes / gotchas (learned the hard way)
- **CORS / domain:** when the custom domain goes live, add it to `CORS_ORIGINS` in `_config.sh` (and to the
  Google OAuth client's authorized origins), then re-run `deploy-backend.sh` + `deploy-frontend.sh`.
- **Frontend calls Cloud Run directly** (`NEXT_PUBLIC_API_BASE_URL`) — the Next `/api` rewrite hangs under
  Firebase SSR, so don't rely on it in prod.
- **GCS S3-compat** needs path-style addressing (in `services.py`) + the `AWS_*_CHECKSUM_*=when_required`
  env (baked into `backend/Dockerfile`) — otherwise PutObject fails with `SignatureDoesNotMatch`.
- **Secrets** (`database-url`, `jwt-secret`, `storage-hmac-access`, `storage-hmac-secret`) are referenced by
  name from Secret Manager — never put their values in these scripts.
- `migrate.sh` uses the Cloud SQL Auth Proxy with `gcloud auth print-access-token` (no ADC setup needed).
