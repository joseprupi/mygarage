# Work Log

Running record of what's shipped and what's next. Newest first. Update every slice.

## TODO (next up)
- [ ] Who-liked modal: `GET /posts/{id}/likes` + clickable count (P1, S).
- [ ] Simplify Share button → **copy-link only** (S). Drop `navigator.share`/OS share sheet; click = copy URL + transient "Copied!". Prefer a "Copy link" label + link icon. Do AFTER who-liked (both touch `ShareButton.tsx`/`PostCard.tsx`).
- [ ] Remaining redesign polish: empty states, `ImageCarousel` controls, comment list styling.
- [ ] Open PR `redesign → master` once polish is signed off.

## Done
> Branch `redesign` unless noted. Dates approximate.

### Social
- **Share button** (`components/ShareButton.tsx`): native share on mobile, copy-to-clipboard + transient "Copied!" on desktop. Added to vehicle header (`/v/{id}`) and post footer (`/posts/{id}`); visible to owner and visitors.

### Planning / docs
- Added project planning docs under `plan/`: NORTHSTAR + ARCHITECTURE, AGENTS, FEATURES, PROJECT_PLAN, LOG, ISSUES.

### History
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
