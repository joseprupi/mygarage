# Feature Backlog

Prioritized list of features we know we want. Effort: **S** ≈ hour-ish · **M** ≈ half-day–day · **L** ≈ multi-day/new subsystem. Priority: **P0** now, **P1** next, **P2** later.

Legend: ✅ done · 🔜 next · 💤 backlog

---

## A. Vehicle History (the moat — bias toward these)
| Feature | Effort | Priority | Status | Notes |
|---|---|---|---|---|
| Event CRUD (type, title, date, mileage, cost, shop, location, notes, media) | M | P0 | ✅ | Date now required; cost entered in **dollars**. |
| Color-coded event type tags | S | P0 | ✅ | `lib/events.ts` `eventTypeBadge`. |
| Filter history by event type | S | P0 | ✅ | Chips + "All". |
| Photo lightbox (maximize, prev/next) | S | P0 | ✅ | `components/Lightbox.tsx`; used by history + gallery. |
| Export history (ZIP: `history.csv` + named per-row images) | M | P0 | ✅ | `/vehicles/{id}/history/export`. |
| **Cost summary / total spend** (total + per-type breakdown on History tab) | S–M | P0 | ✅ | Client-side card, per-type chips, hidden when $0. |
| ~~Public "service record" page~~ | M | — | ⏭️ skipped | NOT needed for now: `/v/[id]` (owner controls hidden from visitors) + "Copy link" already cover sharing a car for sale. Revisit only if a dedicated buyer page is wanted. |
| ~~Build sheet / mods list~~ | M | — | ⏭️ deferred | Overlaps with the `upgrade` event type (would invite double-entry). For now mods = `upgrade` events + the History type filter. Revisit only if filtered events feel insufficient. |
| Tidy event types: drop `track_day` + `road_trip` (keep `upgrade`) | S | P1 | ✅ | Removed from `EventType` Literal + `lib/events.ts`; Alembic `0003_retire_event_types` migrates existing rows → `other`. |
| Receipts/documents (PDF attachments on events) | M | P1 | ✅ | `vehicle_event_documents` table; PDF-only direct upload (25 MB); bundled in export ZIP under `documents/`. |
| Mileage timeline / chart | M | P2 | ✅ | Hand-rolled SVG line chart on History tab (`MileageChart.tsx`); frontend-only. |
| PDF export (pretty one-pager sibling of CSV/ZIP) | M | P2 | 💤 | Buyer-friendly. |
| Ownership transfer (hand vehicle + history to buyer's account) | M–L | P2 | 💤 | Trust/portability. |
| Service reminders / intervals | L | P2 | 💤 | e.g. oil every X miles. |

## B. Social (amplifiers — do when cheap or clearly moat-boosting)
| Feature | Effort | Priority | Status | Notes |
|---|---|---|---|---|
| Like / unlike posts & comments | S | P0 | ✅ | Endpoints exist. |
| **Share button (copy link / native share)** | S | P0 | ✅ | `components/ShareButton.tsx` on vehicle header + post footer. |
| **Who-liked modal** (click count → list) | S | P1 | ✅ | `GET /posts/{id}/likes`; clickable count → `UserListModal` (`PostCard.tsx`). |
| Comment replies (threads) + comment-like UI | S–M | P1 | 💤 | `comments.parent_comment_id` + comment-like endpoints already exist. |
| Follow **users** | M | P1 | 💤 | `follows` table exists (no API/UI yet). |
| Follow **vehicles** ("watch this build / car for sale") | M | P1 | 💤 | `follows.followed_vehicle_id` already in schema — differentiator. |
| "Following" feed (For You / Following toggle) | M | P1 | 💤 | Feed is global-newest today. |
| Save / bookmark posts (+ "Saved" tab) | S–M | P2 | 💤 | New `saves` table. |
| Notifications (liked/commented/followed you) | L | P2 | 💤 | New subsystem; polling MVP. |
| Search/discovery (users, makes/models, captions) | M (basic) / L (ranked) | P2 | 💤 | `/search` is a stub. |
| Hashtags & @mentions | M–L | P2 | 💤 | Parse captions, index, link. |
| Tag users in posts | M | P2 | 💤 | Mirror existing vehicle tagging. |
| Direct messages | L | P3 | 💤 | Big; moderation/abuse. |
| Stories / Reels / video | L | P3 | 💤 | Off-mission for a history log. |

## C. Platform / Infrastructure
| Feature | Effort | Priority | Status | Notes |
|---|---|---|---|---|
| Standardized make/model/year dropdowns (+ "Other") | M | P0 | ✅ | Vendored catalog + `/catalog/*`. |
| Direct media upload (tunnel-safe) | S | P0 | ✅ | `POST /media/upload`. |
| Location autocomplete | M | P0 | ✅ | Photon proxy `/geo/search`. |
| Generated per-user avatars + upload | S | P0 | ✅ | `lib/avatar.ts`. |
| Design system / UI primitives | M | P0 | ✅ | globals.css primitives; redesign branch. |
| Readable API error messages | S | P0 | ✅ | `formatApiError`. |
| Capture lat/long on locations (for future maps) | S–M | P2 | 💤 | Photon returns coords; we store only the label now. |
| Logo / favicon / brand | S | P0 | ✅ | `public/logo.svg`, `app/icon.svg`. |
| Image lazy-loading / thumbnails / CDN sizing | M | P2 | 💤 | Perf as media grows. |
| Tests (backend + critical flows) | M | P1 | 💤 | `backend/tests` exists; expand. |

---
Keep this list honest: when a feature ships, mark ✅ and add a one-liner to `LOG.md`. When priorities shift, edit here.
