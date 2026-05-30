# Architecture & Dev Guide

Practical reference for anyone (human or agent) working on My Garage. Read `NORTHSTAR.md` first for the *why*.

## Stack
- **Backend:** FastAPI + SQLAlchemy + Alembic, Postgres, Pydantic, JWT auth (+ Google OAuth). Media via S3-compatible storage (MinIO locally, `boto3`).
- **Frontend:** Next.js (App Router, v16, Turbopack) + TypeScript, Tailwind CSS v4, TanStack Query, TanStack Virtual.
- **Infra (local):** `docker-compose.yml` → Postgres (host port **5433**) + MinIO (**9000** API / **9001** console), bucket `car-social` (public-read).

## Repo layout
```
backend/app/
  main.py        # all FastAPI routes
  services.py    # business logic, storage, catalog, geo, history export
  models.py      # SQLAlchemy models
  schemas.py     # Pydantic request/response models
  security.py    # JWT, password hashing, current-user deps
  config.py      # Settings (env-driven)
  database.py    # engine/session (NOTE: expire_on_commit=False)
  data/vehicle_catalog.json  # vendored make/model/year catalog
frontend/
  app/           # routes (App Router)
  components/     # UI components
  lib/api/client.ts   # fetch wrapper + typed API objects + error formatting
  lib/avatar.ts  # generated pixel-car avatars (per-user color)
  lib/events.ts  # event types, labels, badge colors
  app/globals.css     # theme tokens + UI primitives (.surface/.btn/.input/.chip/.tab/.hover-lift)
plan/          # NORTHSTAR.md + planning docs (this set)
```

## Running it (dev) — IMPORTANT, non-obvious
This environment has quirks. Read carefully before "just running" things.

- **Ports are 8010 (backend) and 3010 (frontend), NOT the README's 8000/3001.** Another unrelated project occupies 8000/3001 — **do not touch it**. If a port is busy, pick another; never kill processes you didn't start.
- **The browser is remote/tunneled and can only reach `:3010`.** It CANNOT reach Postgres, MinIO (`:9000`), or external APIs directly. Therefore **everything the browser needs must be served through `:3010`**:
  - `/api/*` → Next rewrite → backend `:8010` (set via `BACKEND_ORIGIN`). NOTE: `/api` is only the frontend-origin prefix — curl the **backend directly on :8010 WITHOUT `/api`** (e.g. `:8010/auth/login`), but **via :3010 WITH `/api`** (e.g. `:3010/api/auth/login`).
  - `/media/*` → Next rewrite → MinIO `:9000/car-social` (set via `MEDIA_ORIGIN`).
  - Stored media URLs are **relative** (`/media/...`) because `PUBLIC_MEDIA_BASE_URL=/media`.
- **Uploads do NOT use presigned PUT** (browser can't reach MinIO). Use the **direct-upload** endpoint `POST /media/upload` which streams through the backend. `ImageUploader` already does this.
- **The running frontend dev server runs from a COPY at `/tmp/mygarage-frontend-run`** (with `node_modules` bind-mounted) to avoid Next's single-dev-server lock on the canonical path. **After editing `frontend/...`, sync to the running copy:**
  ```bash
  cp -a /root/mygarage/frontend/app/.        /tmp/mygarage-frontend-run/app/
  cp -a /root/mygarage/frontend/components/.  /tmp/mygarage-frontend-run/components/
  cp -a /root/mygarage/frontend/lib/.         /tmp/mygarage-frontend-run/lib/
  # (also tailwind.config.ts / next.config.mjs / public/* if changed)
  ```
  The canonical source of truth is `/root/mygarage/frontend` — always edit there, then sync.
- **Backend has no --reload**; after backend edits, restart uvicorn on `:8010`.
- **Dev login:** a seeded user `joseprupi@gmail.com` exists (email/password). Password is a local dev value — ask the owner / check local env, not committed. Google login won't work on `:3010` (origin not authorized).

### Start from cold
```bash
docker compose up -d postgres minio
# backend
cd backend && .venv/bin/alembic upgrade head
.venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8010   # background it
# frontend (canonical) — if lock conflict, run from /tmp copy as above
cd frontend && BACKEND_ORIGIN=http://127.0.0.1:8010 MEDIA_ORIGIN=http://127.0.0.1:9000 npx next dev -p 3010
```

## Production (Cloud Run)
The backend deploys as a container (`backend/Dockerfile`, `python:3.13-slim`): it `pip install`s
the package, runs as a non-root user, and starts uvicorn bound to `0.0.0.0:$PORT` (default 8080,
injected by Cloud Run). `backend/.dockerignore` keeps `.venv`, caches, tests, and `.env` out of
the image. Nothing about local dev changes — config defaults still point at the local stack.

- **Config stays env-driven** (`app/config.py`). All prod vars are documented in
  `backend/.env.production.example`: `DATABASE_URL` (Cloud SQL Postgres, psycopg driver),
  `JWT_SECRET`, `GOOGLE_CLIENT_ID`, `STORAGE_*` (GCS via the S3-compatible endpoint
  `https://storage.googleapis.com` + an HMAC key — **no storage code change**, same boto3 path as
  MinIO), `PUBLIC_MEDIA_BASE_URL`, `CORS_ORIGINS`, `PORT`.
- **CORS is env-driven**: `CORS_ORIGINS` is a **comma-separated** list (defaults to the local dev
  origin), so the prod domain is added by config, not code.
- **Migrations run as a separate one-off**, not on boot (safer with multiple Cloud Run instances —
  avoids racing migrations). Use the same image with an overridden command:
  ```bash
  docker run --rm -e DATABASE_URL='<prod url>' mygarage-backend alembic upgrade head
  ```
  (On GCP: a Cloud Run Job with the Cloud SQL instance attached.) Alembic reads `DATABASE_URL`
  from the same config. See `backend/README.md` for full build/run/migrate steps.

## Data model (current)
`users`, `vehicles`, `posts`, `post_media`, `post_vehicle_tags`, `comments` (has `parent_comment_id` → threads), `post_likes`, `comment_likes`, `follows` (supports following a **user** OR a **vehicle** — schema only, no API/UI yet), `vehicle_events`, `vehicle_event_media`.

## External integrations (all proxied via backend, no API keys)
- **Vehicle catalog:** vendored JSON (`backend/app/data/vehicle_catalog.json`, derived from the `us-car-models-data` open dataset). Endpoints `/catalog/makes|years|models`.
- **Location autocomplete:** Photon (Komoot, OSM-based). Endpoint `/geo/search?q=`.

## Frontend conventions
- **UI primitives (globals.css):** `.surface` (card), `.hover-lift`, `.btn` + `.btn-primary|secondary|accent`, `.chip`, `.input`, `.tab` + `.tab-active|tab-idle`. Reuse these; don't hand-roll new button/input styles.
- **Type:** Inter (`--font-sans`) for body, Space Grotesk (`--font-display`) for headings/brand (headings auto-apply it).
- **Color:** `asphalt` #0b1120 (dark/neutral), `petrol` #2563eb (blue accent). Background is plain **white**.
- **API errors:** `formatApiError` in `lib/api/client.ts` turns FastAPI 422 arrays into readable strings — don't reintroduce `[object Object]`.
- **Dropdowns with free-text fallback:** the "Other…" escape-hatch pattern (see `VehicleForm`).

## Backend conventions
- Sessions use `expire_on_commit=False` — after mutating a relationship (e.g. replacing event media), **`db.expire(obj, ["rel"])`** before returning, or you'll serialize stale data.
- Visibility is enforced in `get_*_or_404` / `list_*` helpers; reuse them.
- New external calls go in `services.py`, proxied, with a timeout and a graceful failure (return empty rather than 500 where sensible).
