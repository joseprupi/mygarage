# Work Log

Running record of what's shipped and what's next. Newest first. Update every slice.

## TODO (next up)

### Productionize / ops (the app is LIVE — harden it)  ← focus next session
- [x] **Google login in prod** — created a DEDICATED OAuth web client in the mygarage project (`147573336932-mm59b4qpu7nj6pbicu9f5forrnospa9a.apps.googleusercontent.com`, replaces the old `autocriba` 543… client) with JS origins for .web.app/.firebaseapp.com/cececar.com/www/localhost:3010. Wired into Cloud Run `GOOGLE_CLIENT_ID` + frontend `NEXT_PUBLIC_GOOGLE_CLIENT_ID` (redeployed) + local `.env`s. NOTE: consent screen is in **Testing** → add test users or Publish for non-dev sign-ins.
- [x] **Deploy automation**: `scripts/` now holds `_config.sh` (non-secret config), `deploy-backend.sh` (Cloud Run w/ secrets+cloudsql+env), `deploy-frontend.sh` (firebase deploy w/ NEXT_PUBLIC_* baked), `migrate.sh` (Cloud SQL proxy + alembic), + README. Syntax-checked; NOT run (dev-only). Deploy knowledge is now in-repo, not chat.
- [ ] **Migrations as a Cloud Run Job** (same image, `alembic upgrade head`) instead of the manual proxy run (P1 worker's suggestion).
- [ ] (later) CI/CD: auto-deploy on push to `master` (GitHub Actions or Firebase App Hosting GitHub connect).
- [x] **Budget alert** — $25/mo on the mygarage project, alerts at 50/90/100% to billing admins (notify-only, not a hard cap).
- [ ] Decide: seed prod DB vs start fresh (prod DB is currently empty; local data not migrated).

### Custom domain (cececar.com, via Cloudflare) — P5
- [x] **`https://cececar.com` is LIVE** — Cloudflare nameservers (apex `A → 199.36.158.100` **DNS-only**, TXT verify), Firebase custom domain Connected w/ SSL. CORS updated (`scripts/_config.sh`) + backend redeployed (rev 00006); Google OAuth origins already include it. Verified: page 200, CORS `allow-origin: https://cececar.com`. **Gotcha hit & fixed:** apex must be grey-cloud or Firebase's ACME challenge 403s.
- [ ] (Optional) `www.cececar.com` — add as a 2nd Firebase custom domain (the `www` CNAME still points to Squarespace); CORS already allows it.
- [ ] (Optional, cleaner) map **api.cececar.com → Cloud Run**, then rebuild frontend `NEXT_PUBLIC_API_BASE_URL=https://api.cececar.com`.
- [ ] Logo swap (cosmetic, anytime).

### Frontend hardening — from review (branch `improvements`; see plan/REVIEW.md for detail)
- [x] FE-1 Request & form robustness (S): typed ApiError + retry-skips-4xx (F3), disable submits while pending (F1), allowedDevOrigins (F18). Verified live: missing vehicle errors in ~1.4s (was ~8s/8 fetches), double-click Publish creates 1 post (was 2), app hydrates on 127.0.0.1.
- [x] FE-2 Guest & auth states (S): login-to-act (F5: guest like → /auth, guest comment form → "Log in to comment"), AuthGate card on create/edit pages (F6), garage/posts-new wait for ["me"] to settle before showing guest card (F12). Verified headless-browser both states: guest sees login cards everywhere + like fires no POST; logged-in sees forms, likes 204, no garage guest-card flash. Gotcha: on the virtualized feed `me.isPending` flickers true on PostCard remount, so the like guard treats "no token" as the guest signal.
- [x] FE-3 Share-the-history trust (S–M): styled "private or no longer exists" card (LoadErrorCard) on /v, /posts, /u (F3-UI); tab in `?tab=` URL param, shareable + reload-safe (F10); visitors' Specs hides empty rows + mileage falls back to latest recorded history reading, labeled (F14); lib/format.ts is the one date/money formatter — PostCard/Comments timestamps lose seconds, event dates humanized, costs unified (F9). Verified headless: 15/15 checks (error cards ~0.6s, ?tab=history deep link, guest vs owner specs, formats).
- [x] FE-4 Missing CRUD (S–M): delete event/vehicle from their edit forms w/ confirm (F2), Edit-profile toggle for display name/bio/location on /profile (F4), Publish disabled until caption-or-media w/ hint (F7), VIN input on vehicle form, maxLength 32, saves on create+edit, shows on Specs (F20). Verified headless (Playwright vs :3010): create→delete round-trips for vehicle+event incl. API 404 after, profile fields persist across reload + bio on /u, empty post blocked. **Backend bug found (NOT fixed — out of scope): DELETE /vehicles/{id} 500s if the vehicle has any vehicle_events rows (even soft-deleted ones) — `db.delete(vehicle)` tries to NULL `vehicle_events.vehicle_id` (no cascade) → NotNullViolation. UI shows the error cleanly; needs a backend fix (cascade or delete events first).**
- [ ] FE-5 Shareable metadata/OG (M): F11.
- [ ] FE-6 A11y + polish + rebrand (S–M): modal focus (F13), polish bundle (F19), adopt/remove .tab (F16), "Car Social"→"CeCeCar" (F17).
- [ ] FE-7 Cleanup/refactor (S): useMe hook + types (F15), like via query cache (F8).

### Product backlog
- [ ] (later, post-deploy) **Dedicated design + performance frontend review** — separate report-only reviewer (visual hierarchy, spacing/typography, color/contrast, motion, mobile/responsive, Core Web Vitals/bundle/image strategy/perceived speed). Run AFTER FE-5/6/7 land + deploy, against the polished live app. Distinct from the correctness/UX review in REVIEW.md.
- [ ] (later) Ownership transfer (M–L) — transfer vehicle + history to buyer's account (riskiest).
- [ ] Remaining redesign polish: empty states, `ImageCarousel` controls, comment list styling.
- (deferred) Build sheet / mods list — overlaps with `upgrade` events; revisit only if needed.
- Note: `redesign` branch already merged to `master` (tag `v0.1.0`); trunk is `master`.

## Done
> Branch `redesign` unless noted. Dates approximate.

### Production (Phase P)
- **P1 — Containerize + cloud-ready backend** (`master`): `backend/Dockerfile` (python:3.13-slim, `pip install .`, non-root, uvicorn on `0.0.0.0:$PORT` default 8080) + `.dockerignore` + `.env.production.example` + `backend/README.md`. CORS now env-driven via comma-separated `CORS_ORIGINS` (`config.py`, defaults to local origin; `NoDecode` validator). Migrations run as a documented one-off (`alembic upgrade head`, not on boot). No local-dev or storage-code changes (still boto3/S3-compat). Verified: `docker build` OK; container against local stack → `/health` 200, `/catalog/makes` 200, CORS preflight reflects allowed origin; `alembic upgrade head` connects to local DB.

### Social
- **Login/Logout UI** (dev): "Log out" button (`.btn-secondary`) in the profile header card (`ProfileEditor.tsx`) → `setToken(null)`, invalidate `["me"]`+`["feed"]`, `router.push("/auth")`. Subtle guest "Log in" affordance in `Nav.tsx` (petrol `LogIn` icon link to `/auth`): desktop left-rail item just under the logo, plus a mobile bottom-bar entry. Shown only to guests, gated on the settled `["me"]` query so logged-in users get no flash. (Earlier "Browsing as a guest" feed bar was replaced by this per owner feedback.)
- **UI cleanup**: Share button simplified to **copy-link only** (dropped `navigator.share`/OS share sheet; click copies URL + transient "Copied!"; `Link2` icon + "Copy link" label, both variants). Removed the "Car Social / The feed…" heading block atop the feed (`app/page.tsx`) — feed starts clean.
- **Who-liked modal**: `GET /posts/{id}/likes` (reuses `PublicUser` + post-visibility helper) → clickable like count on `PostCard` opens a reusable `UserListModal` listing likers (avatar + @username link). Empty state "No likes yet."
- **Share button** (`components/ShareButton.tsx`): native share on mobile, copy-to-clipboard + transient "Copied!" on desktop. Added to vehicle header (`/v/{id}`) and post footer (`/posts/{id}`); visible to owner and visitors.

### Planning / docs
- Added project planning docs under `plan/`: NORTHSTAR + ARCHITECTURE, AGENTS, FEATURES, PROJECT_PLAN, LOG, ISSUES.

### History
- **Mileage timeline / chart**: History tab now shows a hand-rolled responsive SVG line chart (`components/MileageChart.tsx`) of mileage over time — points derived client-side from events with `mileage != null` (one per `event_date`, sorted ascending), x scaled by real date so gaps show, petrol line + subtle fill + dots, min/max-mile and first/last-date labels, inside a `.surface` card. No backend/schema changes. Renders only with ≥2 mileage points (component returns `null` below that; parent also guards). Placed below the cost-summary card.
- **Receipts / documents on events**: owners can attach PDF documents to a history event alongside photos. New `vehicle_event_documents` table + Alembic `0004_vehicle_event_documents`; direct-upload endpoint accepts `purpose=vehicle_event_document` (application/pdf, 25 MB cap; images unchanged). `documents` added to event create/read and update (replace-semantics like media, with `db.expire`). History export ZIP now bundles PDFs under `documents/` and lists them in a `documents` CSV column. Form has a PDF uploader (filename + ×); cards show 📄 download links.
- **Tidy event types**: removed `track_day` + `road_trip` from the `EventType` Literal (`schemas.py`) and from `EVENT_TYPES`/badge map (`lib/events.ts`); kept `upgrade`. Alembic data migration `0003_retire_event_types` reassigns existing rows of those types → `other` (varchar column, no type change). New-event Type dropdown no longer lists them.
- Cost summary card on the History tab: total spent + per-type colored chips + event count, computed client-side over all events, hidden when total is 0.
- Export history as ZIP (`history.csv` + per-row named images) — `/vehicles/{id}/history/export`.
- Cost entered in **dollars** (stored as cents); fixed "cost in cents" UX.
- Location autocomplete (Photon/OSM proxy) `/geo/search`.
- Event **date required** (backend + form validation).
- Photo **lightbox** (maximize, prev/next, Esc) for history + gallery.
- **Color-coded** event type tags + **filter by type**.
- History event cards now show attached **photo thumbnails**.
- Edit existing events (incl. replacing media); reusable create/edit form.

### Vehicle page / design
- Integrated **sticky** header (logo/name/owner/actions + underline tabs); Edit (top-right, icon) + accent "Add event".
- Clean design pass across all screens; reusable UI primitives (`.surface/.btn/.chip/.input/.tab/.hover-lift`).
- Instagram-style **left rail** (icons, hover-expand, logo top, no divider); single-scrollbar window-virtualized feed.
- Fonts (Inter + Space Grotesk), white background, brand logo + favicon.

### Platform
- Standardized **make/model/year** dropdowns with "Other" escape hatch (vendored catalog + `/catalog/*`).
- **Tunnel-safe media upload** via `POST /media/upload` (replaced presigned PUT in `ImageUploader`); media served through `/media` proxy.
- Generated **per-user pixel-car avatars** + avatar upload; default-avatar fallback.
- **Readable API errors** (`formatApiError`) — no more `[object Object]`.
- Repo bootstrapped to git; pushed to GitHub. `master` tagged `before-redesign`.

## Notes
- A buyer/seller "service record" page and a "build sheet" are the next big moat-deepening bets (see `PROJECT_PLAN.md` Phase 1).
