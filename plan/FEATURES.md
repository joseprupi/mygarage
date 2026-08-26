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

## VIN roadmap (decided 2026-08-03 — slice 1 shipped, rest queued)
- [x] **VIN privacy** (S): API masks `vin` for everyone but the owner (`_vehicle_out` in main.py + pytest). Field itself has existed since FE-4.
- [ ] **VIN exact-match search** (S–M): `GET /vehicles/by-vin/{vin}`, exact match only (no prefix/partial — prevents enumeration), public vehicles only. Search box on web + mobile. The "buyer checks the history" moat feature.
- [ ] **VIN decode on vehicle create** (M): NHTSA vPIC (free, no key) proxied via backend — type VIN, auto-fill make/model/year/engine/transmission. Same pattern as catalog/geo.
- [ ] **Ownership transfer** (L, own design session): seller generates one-time transfer code → buyer redeems → vehicle + full history move accounts. Events keep `author_user_id` (provenance). Auto-log `sale` event for seller, `purchase` for buyer. Needs transfers table + permission rules.

## Mobile follow-ups (2026-08-03)
- [ ] **Google sign-in on mobile** — BLOCKED on dev build: Google auth libs need custom native code, impossible in Expo Go. Do it in the TestFlight phase (paid Apple Developer account + EAS dev build). Backend /auth/google already works.
- [x] Mileage chart on mobile (react-native-svg, mirrors web geometry).

## Vehicle stats (backlog, 2026-08-03 — user request; UX decided)
**UX shape (owner's call):** do NOT build a wall of stats. Two levels:
1. **History tab** keeps the mileage chart + ONE headline stat next to it (pick the single most telling number — candidate: cost/mile or avg MPG).
2. **"Stats" detail screen** (link from the chart/History tab): a full table for geeks/number-neurotics — every derivable figure, updated as data grows.

Stats to derive (detail screen; headline picks one):
- Fuel consumption (MPG): miles between consecutive fuel-ups ÷ gallons — per fill-up + rolling average.
- Cost per mile: total history spend ÷ miles since purchase (purchase_date + initial mileage in DB). Variant: fuel-only $/mi.
- $/gal paid over time. Miles/year pace (chart slope). Spend by category (maintenance/repair/fuel/mods). Totals: miles driven, spend, days owned.

**Prerequisite:** gallons + price/gal are currently text in the fuel event description — add structured fields (e.g. `fuel_gallons`, `fuel_price_cents` on vehicle_events) BEFORE building MPG math; backfill the few existing fuel events by parsing descriptions.

## Fuel log correctness — skipped fill-ups (IN PROGRESS dev, 2026-08-23 — owner flagged)
Current MPG pairs *consecutive logged* fuel events; a missed fill-up makes the mileage delta span two tanks → MPG ~doubles. Spec (explicit flags + inference, owner-approved):
- [ ] Fields on fuel events: `fuel_full_tank: bool` (default true), `fuel_missed_previous: bool | null` (null = unknown → infer; true = owner says a fill was skipped; false = owner confirmed no gap). Fuel-up screen (mobile) + web event form (type=fuel) get the two toggles.
- [ ] Shared stats (`stats.ts`, mobile + web): segments run between consecutive **full** fills; partial fills add their gallons to the next full segment. Segment MPG excluded when `missed_previous === true`, or when inferred: baseline = **median** of ≥3 trusted segments and segment MPG > 1.6× median (and `missed_previous !== false`). <3 trusted segments → MPG shown but labelled unverified.
- [ ] Inferred gap → **estimated phantom fill-up** (date = midpoint, gallons = gap miles ÷ median MPG − logged gallons, price = mean of neighbouring $/gal) counted in fuel spend/gallons totals, always labelled "incl. ~$X estimated for N missed fill-up(s)". Never written to DB; never exported; never feeds back into MPG.
- [ ] Stats screen rows: "Probable missed fill-ups", "Segments excluded". History timeline shows a grey "Possible missed fill-up ~date" marker between the two events with **Add it** (prefilled fuel event) / **Not missed** (sets `missed_previous=false` on the later event).

## Receipt privacy & provenance (DEV 2026-08-26, not deployed — owner P0)
- [x] Receipts/documents private by default, private bucket + presigned owner URLs, blurred "Receipt on file" placeholder for visitors.
- [x] PII detection (Gemini) → locked private when detected; owner sees "Contains personal info: …" banner; "Visible to everyone" switch only when clean.
- [x] Provenance: From receipt / From receipt · edited (trust fields: date, cost, mileage, shop, gallons, $/gal); raw scan snapshot stored.
- [ ] Backlog: AI redaction (blur PII boxes) to allow sharing receipts; document (PDF) viewer + toggle on mobile; orphan-object sweep as scheduled job.

## Ownership & transfer (DESIGNED 2026-08-26 → plan/OWNERSHIP.md)
- [x] Slice 1 (M, DEV 2026-08-26, not deployed): `vehicle_ownerships` periods, attribution by event date, timeline divider + "previous owner" badge, ownership filter chips, chart boundaries, stats toggle (Your ownership / Lifetime), period label editing, export owner column.
- [ ] Slice 2 (L): transfer link/code → accept; options (show name, keep receipts, keep posts tagged); locking rule (editable iff current owner AND creator); hide-not-delete; "Previously owned" garage section.
- [ ] Slice 3: claim previous period by username, multiple historical periods, VIN-match "already on CarFable → request transfer".

## Owner feedback 2026-08-22 (post-launch)
- [x] Web: Log out visible in nav; event cards keep description newlines and show shop/location to everyone; export button relabeled "Export CSV + photos".
- [x] Mobile: delete own posts (trash on post screen).
- [ ] **Mobile: read-only event detail** — visitors (and owners) can tap an event to see full details (shop, location, notes, photos, documents) without edit rights; today only owners can open (edit form).
- [ ] **Mobile: history export** (CSV + photos ZIP) — web has it; mobile doesn't.
- [ ] **Password change / set password** in profile (web + mobile) — needed for Google-created accounts to use the phone app; owner's prod password was set via DB.
- [ ] cececar.com → 301 redirect to carfable.com; add www.carfable.com.

## Web parity: vehicle stats (backlog, 2026-08-22 — owner)
- [x] **Web History tab: same stat tiles as mobile** (events, total spend, miles driven, cost/mile, avg MPG when computable) next to the chart — port `mobile/src/lib/stats.ts` to `frontend/lib/stats.ts` (same math, single source of truth ideally shared).
- [x] **Web "All stats" detail** (ownership / money / fuel sections, incl. best/worst tank, $/gal, fuel cost per mile) — geek table, on demand like mobile.
- Keep the two apps' numbers identical by construction (same derivation code).
