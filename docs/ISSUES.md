# Known Issues, Gotchas & Tech Debt

Things that bite. Check here before debugging something weird. Add new entries as discovered.

## Environment / dev gotchas (operational)
- **Ports moved to 8010 (backend) / 3010 (frontend).** The README says 8000/3001, but another unrelated project occupies those. Don't use or touch 8000/3001.
- **Browser can only reach `:3010`** (remote/tunnel). It cannot reach MinIO `:9000`, Postgres, or external APIs. Anything browser-facing must be proxied through `:3010`. Symptom when violated: `net::ERR_CONNECTION_REFUSED` on `localhost:9000` images, or CORS errors.
- **Running frontend = a copy at `/tmp/mygarage-frontend-run`** (node_modules bind-mounted), due to Next's single-dev-server lock on the canonical path. **Edits in `/root/mygarage/frontend` won't show until synced** (`cp -a`). Risk: source/run divergence if someone forgets to sync. Canonical source is always the repo path.
- **Backend runs without `--reload`** — restart uvicorn after backend edits.
- **Google login doesn't work on `:3010`** — `http://localhost:3010` isn't an authorized JS origin for the OAuth client (only `:3001` was set up). Use email/password (`joseprupi@gmail.com`) in dev. Fix later: add the origin in Google Cloud or make it env-driven.

## Code / data
- **`expire_on_commit=False`** (in `database.py`): after mutating a relationship and re-reading in the same request, the ORM may return **stale** related data. Fix pattern: `db.expire(obj, ["relationship"])` before re-serializing. (Already applied in `update_vehicle_event` for media — watch for this elsewhere.)
- **Legacy presigned-upload flow still exists** (`/media/upload-url`, `mediaApi.uploadUrl`) but is unused by the UI (replaced by direct upload). Candidate for removal to avoid confusion.
- **Stored media URLs are relative `/media/...`.** Old/seed rows may have absolute `http://localhost:9000/...` — those break through the tunnel. New uploads are correct. If old data resurfaces broken, rewrite the URLs.
- **History export pulls images from storage by deriving the object key from the media URL** (`_object_key_from_url`). If the URL scheme changes, update that helper.

## External dependencies
- **Photon geocoder** (`/geo/search`) is a free public instance with fair-use limits — fine for dev/light use; would need self-hosting or a keyed provider (Mapbox/Google) at scale. The swap is isolated to `services.geo_search`.
- **Vehicle catalog** is a vendored snapshot (US-market, 1992–2026) from the `us-car-models-data` open dataset. It goes stale; needs a periodic refresh script (not built yet). "Other" escape-hatch covers gaps.

## Process / quality
- **Commit trailer:** going forward, end commit messages with `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>` (earlier commits predate this convention).
- **Thin test coverage** for newer endpoints (catalog, geo, media upload, history export, event media edit). `backend/tests` exists — expand.
- **No `frontend/.env.local` in git** (correct — it's gitignored). New clones must create it; `BACKEND_ORIGIN`/`MEDIA_ORIGIN` are passed at dev runtime, not committed.
