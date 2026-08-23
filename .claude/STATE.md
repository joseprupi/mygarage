# STATE — CarFable (formerly MyGarage / CeCeCar) handoff

## 2026-08-22 (late) — batch deployed: service tags + web stats parity; mobile prod published (EAS Update, branch `production`)
- Prod: migration 0010 (tags), backend revision w/ tags, prod 4Runner receipts re-tagged, web deployed, mobile update group 7b368ded. EAS project @joseprupi/carfable linked; token in mobile/.env.eas.local (gitignored).
- Dev/prod rule now enforced: deploy only on owner's "deploy", batched (memory + plan/ENVIRONMENTS.md).
- Apple Developer enrollment PAID, awaiting approval → then App Store Connect API key → EAS build → TestFlight.

## 2026-08-22 — REBRAND + PRODUCTION REFRESH (branch `carfable-rename`)
- Product is now **CarFable** (carfable.com bought by owner; Cloudflare). Bundle id `com.carfable.app`. cececar.com still serves during transition (kept in CORS).
- **Prod backend redeployed** with everything since spring: mods, fuel event type, purchase_date, fuel fields, AI receipt/fuel scan (GEMINI_API_KEY in Secret Manager), VIN masking. Cloud SQL migrated to 0009. `httpx` added to runtime deps (image had crashed without it). Cloudflare Stream stays OFF in prod (config empty; video untested).
- **Prod frontend redeployed** (Firebase). PENDING owner steps: add carfable.com as Firebase custom domain + Cloudflare DNS (grey-cloud!), Google OAuth origins for carfable.com, rotate the leaked Google client secret.
- **Mobile prod path**: API base env-driven (prod default; `mobile/.env.development` → home stack). `eas.json` ready. Next: EAS Update via Expo Go (needs owner's EXPO_TOKEN), then TestFlight once Apple Developer enrollment clears.
- Dev stack reminder: Metro must be started from `mobile/` so `.env.development` loads; otherwise the dev app hits PROD.

_Last updated: 2026-07-31. Newest-first details live in `plan/LOG.md`; this is the quick orientation._

## NEW: Mobile app (branch `mobile-app`) — Expo/React Native in `mobile/`
- Expo SDK 57 + expo-router + TS, own folder beside frontend/. Dev: Metro on **:8081** in the container (`REACT_NATIVE_PACKAGER_HOSTNAME=10.0.3.15 npx expo start`); browser via http://10.0.3.15:8081, iPhone via Expo Go `exp://10.0.3.15:8081` (VPN).
- Implemented (3 commits): login/signup/logout (JWT via SecureStore/localStorage), feed with likes + infinite scroll, post detail + comments, new post (camera/library upload via `/media/upload`, tag vehicles), Garage tab, vehicle page (History with badges/total spend, Build mods CRUD, Posts), event form with photo upload + delete, profile view/edit. tsc clean, web bundle compiles; **user-verified through login+feed only** — rest needs browser/phone verification.
- Backend dev server must run with mobile CORS: `CORS_ORIGINS="http://localhost:3010,http://10.0.3.15:3010,http://localhost:8081,http://10.0.3.15:8081"` (only needed for web build; native has no CORS). Deferred: Google sign-in, video upload, vehicle create/edit, exports.
- Also in flight: **receipt→AI extraction test bench** in `tmp/receipt-test/` (Anthropic/OpenAI/Gemini, portal-aligned schema; all 3 verified on one receipt; Gemini fastest, Anthropic strict-schema mode flaky → JSON fallback). Dev password for joseprupi@gmail.com reset to `garage123` (local only).

## Where we are
- **App is LIVE in production.** Frontend: https://carfable.com (also `*.web.app`/`*.firebaseapp.com`). Backend: Cloud Run `https://mygarage-backend-147573336932.us-central1.run.app`. Cloud SQL Postgres + GCS media. Prod DB is currently **empty** (local data not migrated).
- **Active branch: `improvements`** (frontend hardening from `plan/REVIEW.md`). Trunk is `master`. No open PR — work lands on `master`; `redesign` already merged + deleted. Tags: `before-redesign`, `v0.1.0`.
- Working tree has uncommitted frontend edits + new files (`.claude/`, `CLAUDE.md`, `not-found.tsx`, `useDialogFocus.ts`, `plan/archive*`).

## Recently done (this branch) — FE-1→FE-7 hardening backlog CLEARED ✅
- **FE-1** request/form robustness; **FE-2** guest/auth states; **FE-3** share-the-history trust; **FE-4** missing CRUD. All verified earlier.
- **FE-5 (`1e8b4be`)** shareable OG/Twitter metadata on /v,/posts,/u — server `page.tsx` + `*Client.tsx` split; `lib/api/serverBase.ts` (SSR base resolver + `absoluteMediaUrl`); `metadataBase` in layout. Verified live via curl.
- **FE-6 (`3cd75e4`)** a11y + polish + rebrand to **CarFable** (three capital Cs) — modal focus-trap `lib/useDialogFocus.ts` in both modals, `not-found.tsx`, dropped dead `images.remotePatterns`. Verified.
- **FE-7 (`dbc7d4c`)** refactor — `lib/useMe.ts` centralizes `["me"]` (8 sites); PostCard like state moved into query cache (optimistic patch across `["post"]`/`["feed"]`/`["vehiclePosts"]`/`["userPosts"]` + rollback). `.tab` already adopted. Verified tsc clean.
- **Backend fix (`60de96d`)**: `DELETE /vehicles/{id}` deletes child rows first (no more 500).
- **Prod/ops**: Google login in prod, deploy scripts, $25/mo budget alert, carfable.com + SSL.

## Build sheet / mods list — DONE ✅ (PROJECT_PLAN Phase 1)
- `improvements` merged → `master` (fast-forward). All work since is committed on `master`, **not pushed**.
- Backend `2048005`: `vehicle_mods` table + Alembic `0005`, owner CRUD (`/vehicles/{id}/mods`, `/mods/{id}`), wired into `delete_vehicle` cleanup; pytest 11 passed.
- Frontend `eb19ace`: **Build** tab on `/v` (`?tab=build`, category-grouped, owner add/edit/delete via `VehicleModForm`, read-only for visitors).
- Caveat: interactive render reasoned vs the working History tab — no headless browser this session. Backend CRUD was curl-verified end-to-end.

## Next step (pick up here)
- **Verify the Build tab in a real browser** (the one thing not yet UI-driven) — add/edit/delete a mod as the dev owner, confirm grouping + owner-gating render.
- Then candidate next slices: **mods in the ZIP export** (so the build list travels with the history — small, moat-aligned); or pick the next Phase 1/2 item from PROJECT_PLAN.
- **Nothing has been pushed** — decide when to `git push origin master`.

Queued ops: migrations as a Cloud Run Job; decide seed-vs-fresh prod DB; optional `www.`/`api.carfable.com`; logo swap; post-deploy design+performance review.
Hygiene: `plan/archive.txt` + `plan/archive/` are NOT gitignored despite CLAUDE.md saying so — add to `.gitignore`.

## How to work here (from CLAUDE.md / ARCHITECTURE.md)
- Orchestrator delegates scoped tasks to the **implementer** (opus); explorer = haiku. Never push/PR unless tests green. Update this file + `plan/LOG.md` each cycle.
- **Repo path:** `/root/mygarage`. Canonical frontend source: `/root/mygarage/frontend` — after editing, sync to the running copy `/tmp/mygarage-frontend-run/` (see ARCHITECTURE.md cp block).
- **Ports:** backend **8010**, frontend **3010** (NOT README's 8000/3001). Browser is tunneled, reaches only `:3010`; everything proxies through it (`/api/*`, `/media/*`). Backend has no --reload — restart uvicorn after edits.

## Test gate
- **Backend:** `cd backend && .venv/bin/pytest` (config in `backend/pyproject.toml`, `testpaths=["tests"]`; `tests/test_mvp.py` uses FastAPI TestClient). Coverage thin for newer endpoints.
- **Frontend:** no automated suite — verify **manually in the running app** (headless browser vs `:3010`), report "Verified: …".

## Open issues / debt (see `plan/ISSUES.md`)
- Dev DB has harmless leftover `review-*` rows (5 vehicles/4 events/5 posts) — clean up when convenient.
- Thin backend test coverage for catalog/geo/media-upload/history-export/event-media.
- Legacy presigned upload (`/media/upload-url`, `mediaApi.uploadUrl`) unused — removal candidate.
- Old/seed media rows may hold absolute `http://localhost:9000/...` URLs (break through tunnel); new rows are relative `/media/...`.

## Read on demand
`plan/LOG.md` (newest-first), `plan/REVIEW.md` (FE-1..7 detail), `plan/ISSUES.md`, `plan/FEATURES.md`, `plan/PROJECT_PLAN.md`. `plan/archive.txt` is a 844K dump — **grep only, never read whole**.
