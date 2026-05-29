# Work Log

Running record of what's shipped and what's next. Newest first. Update every slice.

## TODO (next up)
- [ ] Cost summary / total spend on the History tab (P0, S–M).
- [ ] Share button (copy link + native share) on vehicle + post (P0, S).
- [ ] Who-liked modal: `GET /posts/{id}/likes` + clickable count (P1, S).
- [ ] Remaining redesign polish: empty states, `ImageCarousel` controls, comment list styling.
- [ ] Open PR `redesign → master` once polish is signed off.

## Done
> Branch `redesign` unless noted. Dates approximate.

### Planning / docs
- Added project planning docs: `NORTHSTAR.md`, `docs/{ARCHITECTURE,AGENTS,FEATURES,PROJECT_PLAN,LOG,ISSUES}.md`.

### History
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
