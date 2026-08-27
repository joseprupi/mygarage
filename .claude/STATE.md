# STATE — CarFable (formerly MyGarage / CeCeCar) handoff

## 2026-08-27 — APP REVIEW: v1.0 REJECTED (2.1 Information Needed: recording + notes). Built ACCOUNT DELETION (DELETE /users/me, Settings→Danger zone web+mobile; privacy/support updated) — DEPLOYED (backend/web/EAS) and iOS BUILD 7 on TestFlight. Reply text + recording script in plan/APPSTORE.md. OWNER: update to build 7, record, reply in ASC, select build 7, resubmit. master = account-deletion.

## 2026-08-27 — DEPLOYED: VIN/recalls (0018+0019) AND simplified receipt visibility (0020) — prod backfill 12 rows/0 errors, all 11 4Runner receipts redactionReady, visibility private. master = media-simplify. Owner picks Private/Redacted/Original per receipt in prod now. Simplified receipt visibility — migration 0020 `visibility` private|redacted|original, three versions rendered at upload, PII guard, propose/publish removed, regenerate + backfill `--regenerate`; web+mobile segmented control. Backend 84 tests. Deploy batch on "deploy": migration 0020, backend, web, prod backfill (redacted copies), EAS update.

## 2026-08-26 (late night) — DEV, branches vin-decode → pii-redaction (not deployed): VIN decode + recalls (migration 0018, NHTSA proxies, specs on vehicle, "from VIN" tags, web cover uploader) and receipt PII REDACTION (migration 0019; Gemini boxes → preview/final in public bucket; propose/boxes/publish/unpublish; opt-in per receipt; review UIs web+mobile). Backend 82 tests. Deploy batch on "deploy": migrations 0018+0019, backend, web, EAS update. Dev transmission receipt is in status "proposed" (owner to publish in UI).

## 2026-08-26 (night, fixes) — LIVE: chart x-labels by pixel spacing (web+mobile); export fixed 3 ways (client used hardcoded /api → apiUrl(); ZIP reads receipts from private bucket; response STREAMED because Cloud Run caps buffered responses at 32MB — prod ZIP is 41MB/11 photos). Verified prod export 200. Tool: scripts/owner-view.js (playwright-core in scratchpad) renders pages logged-in, screenshots the chart svg.

## 2026-08-26 (late) — DEPLOYED: transfer slice 2 + report/block + password (migrations 0016+0017, backend, web, EAS update). Verified prod owner view (scripts/owner-view.js) desktop+phone: Copy link/Edit/Transfer, no errors. Header-clip bug fixed (actions wrap). All slices through today are LIVE.

## 2026-08-26 (night) — DEV: transfer slice 2 (migrations 0016 reports/blocks + 0017 transfers/hidden), report/block, password change — backend 66 tests, web+mobile UIs. Pending test transfer on fake Subaru: code R5GPVZNN22 (visitor→anyone). Deploy batch on "deploy": migrations 0016+0017, backend, web, EAS update. Owner tool: backend/scripts/list_reports.py (needs prod env like the backfill script).

## 2026-08-26 (evening) — PROD BATCH DEPLOYED: migrations 0014+0015, backend, web, EAS update; 4Runner back to PUBLIC. Prod backfill moved 12 receipts → private bucket + blur + PII (9 detected, 2 none, 1 doc/other). First backfill run silently skipped (absolute URLs) — fixed `_object_key_from_url` + skips now count as errors; GCS needs AWS_*_CHECKSUM=when_required (script sets it). Verified: guest sees 0 urls/11 blurs, owner signed URLs OK, browser render clean. Dev fake user visitor@carfable.dev / devtest1234 (otherguy, Subaru w/ PII receipt). Backend redeploy for key fix in flight.

## 2026-08-26 (late) — DEV: receipt privacy (private bucket `car-social-private` local / `mygarage-app-9feafd-private` prod [created, public-access-prevention], PII detection, provenance) — migration 0015. PROD STOPGAP: 4Runner set PRIVATE (flip back public after deploy); 2 orphan receipt files purged from public bucket. Deploy batch = migrations 0014+0015, backend (needs STORAGE_PRIVATE_BUCKET — already in deploy-backend.sh), web, `backend/scripts/backfill_media_privacy.py` against prod (moves 12 files), EAS update. Leftover cloud-sql-proxy on :5437 was killed.

## 2026-08-26 — DEV: ownership slice 1 built (migration 0014, periods API, attribution by date, lock rule editable iff owner AND creator; web+mobile dividers/chips/badges/chart boundaries/stats scope/period editor). Deployed today: web React #310 hotfix, mobile keyboard fix (EAS update). Apple: WAITING_FOR_REVIEW. Next prod batch on "deploy": migration 0014 + backend + web + EAS update. Design: plan/OWNERSHIP.md (slice 2 = transfer).

## 2026-08-25 (later) — SEO slice deployed (e92a1ad): robots.txt, sitemap.xml (GET /sitemap/entries), guest hero on /. plan/GROWTH.md written. GA4 kept (G-QRNM94B2EE live), Plausible skipped. Play Console: new account joseprubiopique@gmail.com created+paid; ID verification + Android device check pending (trying Pixelbook). Android AAB vc2 built; keystore SHA-1 60:18:02:D4:63:3B:AF:40:D7:8A:FF:D5:09:34:D3:FA:21:8C:94:E7.

## 2026-08-25 (late) — **SUBMITTED TO APP STORE REVIEW** (13+, auto-release on approval; demo acct reviewer@carfable.com in prod; hello@carfable.com forwards via Cloudflare)

## 2026-08-25 — DEPLOYED batch + logins + Android build (commit 978ea86 on `carfable-rename`, not pushed)
- **Prod (all verified)**: migrations 0011–0013 (fuel flags, users.settings, apple_sub), backend w/ /auth/apple + fuel gaps + settings, web w/ settings/gap cards + carfable.com/privacy + /support, EAS update published.
- **iOS build 6 on TestFlight** (Google+Apple login, fuel gaps, settings, icon). Build 5 errored: provisioning profile lacked Apple-sign-in entitlement → fixed via ASC API (enabled APPLE_ID_AUTH on bundle id 4TW86BAML2, deleted stale profile), build 6 regenerated it. OWNER: update in TestFlight, test both login buttons.
- **Android build 1 finished** (AAB, versionCode 2, keystore auto-generated). Play Store needs owner's Play Console account ($25); Android Google login later needs Android OAuth client (SHA-1 from keystore).
- App Store prep: plan/APPSTORE.md checklist; privacy+support pages LIVE; Apple login done; remaining owner steps: listing, screenshots, privacy questionnaire, reviewer demo account, hello@carfable.com forwarding (Cloudflare Email Routing).
- iOS Google OAuth client: 147573336932-13dil6egmkp50tqur0lrl7cbb5oona98 (in app.json iosUrlScheme + google-signin.ts fallback).

## 2026-08-23 — DEV ONLY (uncommitted on `carfable-rename`): fuel-gap detection + Settings screen + Google login (mobile)
- **Fuel gaps**: migration 0011 (`fuel_full_tank`, `fuel_missed_previous`), segment-based MPG with median/1.6× inference + estimated phantom fill-up (never stored/exported), toggles on fuel forms, gap cards ("Add it"/"Not missed") on mobile + web timelines. Spec in plan/FEATURES.md.
- **Settings**: migration 0012 (`users.settings` JSON), `UserSettings` (detectMissedFillups, includeEstimatedFuel); mobile `/settings` (Profile ⚙️, log out moved there), web ProfileEditor section; stats take options. Owner-verified toggles in Expo Go.
- **Google login mobile**: code done (`google-signin.ts` guarded for Expo Go via expo-constants); WAITING on owner's iOS OAuth client ID → app.json `iosUrlScheme` + `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` → build 5. Build 4 (icon) is on TestFlight.
- Dev+prod password for joseprupi@gmail.com now both `devtest1234`. EAS secrets moved to `/root/.carfable/eas.env` (Metro choked on `.env.eas.local` inside mobile/). Expo Go: phone connects by scanning a QR of `exp://10.0.3.15:8081` with the Camera app (VPN on).
- NOT deployed. Prod batch when owner says "deploy": migrations 0011+0012, backend, web, EAS update + build 5.

## 2026-08-22 (late) — batch deployed: service tags + web stats parity; mobile prod published (EAS Update, branch `production`)
- Prod: migration 0010 (tags), backend revision w/ tags, prod 4Runner receipts re-tagged, web deployed, mobile update group 7b368ded. EAS project @joseprupi/carfable linked; token in /root/.carfable/eas.env (gitignored).
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
