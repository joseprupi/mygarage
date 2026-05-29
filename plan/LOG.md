# Work Log

Running record of what's shipped and what's next. Newest first. Update every slice.

## TODO (next up)
History/moat sequence (one worker each — overlapping files, so strictly sequential):
- [ ] (later) Ownership transfer (M–L) — transfer vehicle + history to buyer's account (riskiest).
- (deferred) Build sheet / mods list — overlaps with `upgrade` events; revisit only if needed.

Then:
- [ ] Remaining redesign polish: empty states, `ImageCarousel` controls, comment list styling.
- [ ] Open PR `redesign → master` once polish is signed off.

## Done
> Branch `redesign` unless noted. Dates approximate.

### Social
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
