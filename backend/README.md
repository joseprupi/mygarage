# My Garage — Backend

FastAPI + SQLAlchemy + Alembic + Postgres, media via S3-compatible storage (`boto3`).
Config is fully env-driven (`app/config.py`); see `.env.example` (dev) and
`.env.production.example` (prod) for every variable.

## Local development
See `../plan/ARCHITECTURE.md` ("Running it (dev)") for the canonical, environment-specific
instructions (ports 8010/3010, MinIO/Postgres via `docker-compose.yml`). In short:

```bash
docker compose up -d postgres minio          # from repo root
cd backend && .venv/bin/alembic upgrade head
.venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8010
```

Local dev needs no new env vars — defaults in `config.py` point at the local stack.

## Production container (Cloud Run)

The backend ships as a container that listens on `$PORT` (default 8080) and binds `0.0.0.0`.

### Build & run locally
```bash
docker build -t mygarage-backend backend/

docker run --rm -e PORT=8090 --network host \
  -e DATABASE_URL='postgresql+psycopg://carsocial:carsocial@localhost:5433/carsocial' \
  -e JWT_SECRET=dev \
  -e STORAGE_ENDPOINT_URL=http://localhost:9000 \
  -e STORAGE_ACCESS_KEY_ID=minioadmin -e STORAGE_SECRET_ACCESS_KEY=minioadmin \
  -e STORAGE_BUCKET=car-social -e PUBLIC_MEDIA_BASE_URL=/media \
  mygarage-backend
# curl localhost:8090/health  -> {"status":"ok"}
```

### Environment
Every prod variable is documented in [`.env.production.example`](./.env.production.example).
Highlights:
- `DATABASE_URL` — Cloud SQL Postgres (psycopg driver; Unix socket via `?host=/cloudsql/...`).
- `JWT_SECRET`, `GOOGLE_CLIENT_ID` — auth (store secrets in Secret Manager).
- `STORAGE_*` — GCS via the S3-compatible endpoint `https://storage.googleapis.com` + an HMAC
  key. No storage code changes: it's the same boto3 path used for MinIO locally.
- `PUBLIC_MEDIA_BASE_URL` — where media is served (proxy through the frontend, like local `/media`).
- `CORS_ORIGINS` — **comma-separated** list of allowed browser origins (e.g.
  `https://app.example.com,https://www.example.com`). Defaults to the local dev origin.
- `PORT` — injected by Cloud Run; default 8080.

### Database migrations (run separately — not on boot)
The container does **not** auto-migrate on startup. This is deliberate: with multiple Cloud Run
instances, auto-migrate-on-boot causes concurrent/racing migrations and can block rollouts. Run
migrations as a one-off step against the prod DB **before/after deploying** the new revision:

```bash
# Same image, override the command with the same env (at minimum DATABASE_URL):
docker run --rm \
  -e DATABASE_URL='<prod DATABASE_URL>' \
  mygarage-backend \
  alembic upgrade head
```

On GCP this is run as a Cloud Run **Job** (or `gcloud run jobs execute`) using the same image,
with the Cloud SQL instance attached. Alembic reads `DATABASE_URL` from the same config, so no
extra wiring is needed.
