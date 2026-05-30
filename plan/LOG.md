# Work Log

Running record of what's shipped and what's next. Newest first. Update every slice.

## TODO (next up)

### Productionize / ops (the app is LIVE — harden it)  ← focus next session
- [x] **Google login in prod** — created a DEDICATED OAuth web client in the mygarage project (`147573336932-mm59b4qpu7nj6pbicu9f5forrnospa9a.apps.googleusercontent.com`, replaces the old `autocriba` 543… client) with JS origins for .web.app/.firebaseapp.com/cececar.com/www/localhost:3010. Wired into Cloud Run `GOOGLE_CLIENT_ID` + frontend `NEXT_PUBLIC_GOOGLE_CLIENT_ID` (redeployed) + local `.env`s. NOTE: consent screen is in **Testing** → add test users or Publish for non-dev sign-ins.
- [ ] **Deploy automation**: capture the exact commands as repeatable scripts — `scripts/deploy-backend.sh` (gcloud run deploy w/ env+secrets+cloudsql), `scripts/deploy-frontend.sh` (firebase deploy w/ NEXT_PUBLIC_API_BASE_URL), `scripts/migrate.sh` (cloud-sql-proxy + alembic). Right now the deploy knowledge lives only in chat history.
- [ ] **Migrations as a Cloud Run Job** (same image, `alembic upgrade head`) instead of the manual proxy run (P1 worker's suggestion).
- [ ] (later) CI/CD: auto-deploy on push to `master` (GitHub Actions or Firebase App Hosting GitHub connect).
- [ ] **Budget alert** (~$25) on the billing account.
- [ ] Decide: seed prod DB vs start fresh (prod DB is currently empty; local data not migrated).

### Custom domain (cececar.com, via Cloudflare) — P5
Domain bought on Squarespace; DNS/CDN to be managed by **Cloudflare**.
- [ ] Add `cececar.com` to Cloudflare; point Squarespace **nameservers** → Cloudflare.
- [ ] Firebase Hosting → Add custom domain `cececar.com` (+ `www`); it issues a TXT verify + A/AAAA (or CNAME) records.
- [ ] Add those records in Cloudflare. **SSL gotcha:** Firebase manages the cert — set the Firebase records **DNS-only (grey cloud)** during provisioning, or if proxied (orange) use Cloudflare SSL mode **Full (strict)**. Don't leave it "Flexible".
- [ ] (Optional, cleaner) map **api.cececar.com → Cloud Run** (domain mapping), then rebuild frontend with `NEXT_PUBLIC_API_BASE_URL=https://api.cececar.com`.
- [ ] Update backend `CORS_ORIGINS` + Google OAuth origins to include `https://cececar.com` + `https://www.cececar.com`.
- [ ] Logo swap (cosmetic, anytime).

### Product backlog
- [ ] (later) Ownership transfer (M–L) — transfer vehicle + history to buyer's account (riskiest).
- [ ] Remaining redesign polish: empty states, `ImageCarousel` controls, comment list styling.
- (deferred) Build sheet / mods list — overlaps with `upgrade` events; revisit only if needed.
- Note: `redesign` branch already merged to `master` (tag `v0.1.0`); trunk is `master`.

## Done
> Branch `redesign` unless noted. Dates approximate.

### Production (Phase P)
- **P1 — Containerize + cloud-ready backend** (`master`): `backend/Dockerfile` (python:3.13-slim, `pip install .`, non-root, uvicorn on `0.0.0.0:$PORT` default 8080) + `.dockerignore` + `.env.production.example` + `backend/README.md`. CORS now env-driven via comma-separated `CORS_ORIGINS` (`config.py`, defaults to local origin; `NoDecode` validator). Migrations run as a documented one-off (`alembic upgrade head`, not on boot). No local-dev or storage-code changes (still boto3/S3-compat). Verified: `docker build` OK; container against local stack → `/health` 200, `/catalog/makes` 200, CORS preflight reflects allowed origin; `alembic upgrade head` connects to local DB.

### Social
- **Login/Logout UI** (dev): "Log out" button (`.btn-secondary`) in the profile header card (`ProfileEditor.tsx`) → `setToken(null)`, invalidate `["me"]`+`["feed"]`, `router.push("/auth")`. New `GuestPrompt.tsx` client component renders a slim `.surface` line ("Browsing as a guest — Log in or Sign up", petrol link to `/auth`) above the feed in `app/page.tsx`, shown only to guests (gated on settled `["me"]` query so logged-in users get no flash; `<Feed/>` untouched).
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
