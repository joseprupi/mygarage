# Project Plan

Phased roadmap. The ordering reflects the North Star: **deepen the history moat first**, add social amplifiers when cheap. See `FEATURES.md` for the full backlog and effort/priority.

## Current state (2026-05)
Working MVP on the **`redesign`** branch: vehicle profiles, image posts, feed, comments/likes, full vehicle **history** (typed events with media, lightbox, color tags, filter, CSV/ZIP export), standardized make/model/year catalog, tunnel-safe media uploads, location autocomplete, generated avatars, and a clean minimal design system. `master` holds the pre-redesign snapshot (tag `before-redesign`).

## Phase 0 — Stabilize the redesign (in progress)
Goal: finish the visual/UX pass and merge `redesign → master`.
- [x] Design system + global theme (fonts, surfaces, primitives, white bg).
- [x] Instagram-style left rail; single scrollbar feed.
- [x] Vehicle page: integrated sticky header, icon actions, polished tabs.
- [x] History: color tags, filter, lightbox, export, cost-in-dollars, required date.
- [ ] Remaining polish (empty states, ImageCarousel controls, comment list).
- [ ] **Open PR `redesign → master`** once polish is signed off.

## Phase 1 — History deepening (next, P0/P1)
Goal: make My Garage unmistakably "the place to keep your car."
- [x] Cost summary / total spend on History tab (S–M).
- [x] Share button on vehicle + post (S) — copy-link.
- [~] ~~Public "service record" page~~ — SKIPPED (decided `/v/[id]` + Copy link is enough).
- [x] Build sheet / mods list (M). `vehicle_mods` table + owner CRUD (`/vehicles/{id}/mods`, `/mods/{id}`); Build tab on `/v` (category-grouped, URL-shareable `?tab=build`, owner add/edit/delete). Backend `2048005`, frontend `eb19ace`.
- [ ] Receipts/PDF document attachments on events (M).

## Phase 2 — Light social amplifiers (P1)
Goal: help the right people find the right cars; cheap wins first.
- [ ] Who-liked modal (S).
- [ ] Comment replies + comment-like UI (S–M).
- [ ] Follow users + follow vehicles (M each) — schema already supports both.
- [ ] "Following" feed toggle (M).

## Phase 3 — Heavier features (P2, only with traction)
- [ ] Notifications (L).
- [ ] Search/discovery + hashtags/mentions (M–L).
- [ ] Save/bookmark, tag users.
- [ ] Maps (capture lat/long first).

## Phase P — Production deploy (Google Cloud, all-native) — ACTIVE
Target: Cloud Run (FastAPI backend) + Cloud SQL Postgres + GCS (media) + Firebase App Hosting (Next.js). ~$10–20/mo idle (Cloud SQL is the floor). Steps:
- [x] P1. Containerize backend + make it fully cloud-ready (Dockerfile, $PORT, env/Secret-driven config, healthcheck, .dockerignore, prod env template). Verify locally with Docker.
- [x] P2. Provision GCP (project `mygarage-app-9feafd`, region us-central1): Cloud SQL `mygarage-db` (Postgres 16, db-f1-micro) + db/user `carsocial`; GCS bucket `mygarage-app-9feafd-media` + app SA + HMAC keys; Artifact Registry `mygarage`; Secret Manager (database-url, db-password, jwt-secret, storage-hmac-access, storage-hmac-secret). SA has secretAccessor + cloudsql.client. Conn name: `mygarage-app-9feafd:us-central1:mygarage-db`.
- [x] P3. Backend live on **Cloud Run**: `https://mygarage-backend-147573336932.us-central1.run.app`. Migrations ran on Cloud SQL (13 tables). Smoke-tested: health/catalog/feed(DB)/geo/media-upload(GCS)+public-serve all 200. Fixes: path-style S3 addressing + botocore checksum env (GCS S3-compat); baked into Dockerfile.
- [x] P4. Frontend live on **Firebase Hosting** (web frameworks, SSR fn in us-central1): https://mygarage-app-9feafd.web.app. Browser calls Cloud Run **directly** via `NEXT_PUBLIC_API_BASE_URL` (the Next `/api` external rewrite hangs under Firebase SSR); backend `CORS_ORIGINS` set to the .web.app/.firebaseapp.com origins. Media served from absolute GCS URLs.
- [x] P5. **carfable.com live** (Cloudflare DNS + Firebase custom domain + SSL); CORS + Google OAuth origins include it. (`www` + `api.carfable.com` optional, pending.) Deploy scripts (`scripts/`) used for first real release.
- [ ] P6. Billing budget alert; logo swap (cosmetic, anytime). Optional: migrations as Cloud Run Job, CI/CD.
Note: cloud steps need the owner's authenticated gcloud/Firebase CLIs — orchestrator prepares code/config + exact commands; owner executes the cloud calls.

## Deferred / maybe-never (P3)
Direct messages, stories/reels/video — revisit only if the audience demands it; they pull away from the moat.

## Working cadence
Small verified slices → commit → push (see `AGENTS.md`). Update `LOG.md` every slice; revisit this plan when a phase completes or priorities change.
