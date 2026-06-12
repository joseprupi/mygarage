# Review findings & triage

Audits of the live app, captured here as source of truth. Fixes happen on branch `improvements`,
one small slice at a time (report-only reviewers; orchestrator triages; owner greenlights).

## Frontend review — 2026-06 (Fable 5 reviewer, verified by orchestrator)
Overall health: **good**. Design system is real and mostly respected; history tab, virtualized
feed, and error formatting are strong. Gaps cluster in: form-submit robustness, missing CRUD
affordances the backend already supports, and the guest / shared-link experience (exactly the
audience the North Star says the history must impress).

### Findings (F#  · severity · effort)
| ID | Sev | Eff | What | Where |
|----|-----|-----|------|-------|
| F1 | HIGH | S | Submit buttons not disabled while pending → double-submit dupes (reproduced) | posts/new, VehicleForm, VehicleEventForm, auth, Comments |
| F2 | HIGH | S–M | No UI to delete events/vehicles (backend has DELETE) | client.ts; event/vehicle edit forms |
| F3 | HIGH | S | Shared link to private/deleted vehicle = ~8s spinner + 8×404 retries + bare error (api() has no status; no retry policy) | client.ts:44-50; providers.tsx; v/[id] |
| F4 | HIGH | M | Profile fields (display_name/bio/location) can't be edited; only avatar | ProfileEditor.tsx |
| F5 | MED | S | Guest like/comment fails silently (401 swallowed) | PostCard, Comments |
| F6 | MED | S | Create/edit pages open to guests; only fail at Save; no ownership guard | posts/new, vehicles/new, edit pages |
| F7 | MED | S | Empty posts publishable (no caption/media/vehicle required) | posts/new |
| F8 | MED | M | Like state in local useState, not query cache → reverts on virtualizer remount (SUSPECTED) | PostCard, Comments |
| F9 | MED | S | 3 date formats + seconds in timestamps; cost formatted 2 ways. "Dates are the product." | PostCard, v/[id], MileageChart |
| F10 | MED | S–M | Vehicle tabs not in URL → can't share a link that opens History | v/[id]:20 |
| F11 | MED | M | No per-page metadata/OG; everything titled "Car Social" → weak share unfurls | layout.tsx; needs server wrappers + generateMetadata |
| F12 | MED | S | Signed-in users flash "Log in to see your garage" (guard renders during pending) | garage/page.tsx:18 |
| F13 | MED | S–M | Modals/lightbox lack dialog role + focus trap/restore | Lightbox, UserListModal |
| F14 | MED/LOW | S | Specs tab mostly "Not set" for visitors; header "Mileage: Not set" contradicts history | v/[id] |
| F15 | LOW | S | `me.data as {id}` cast in 5 files; authApi.me returns unknown → extract useMe()/AuthUser, dedup query keys | client.ts + 5 |
| F16 | LOW | S | `.tab/.tab-active/.tab-idle` primitives defined but unused (vehicle page hand-rolls) | globals.css; v/[id] |
| F17 | LOW | S | Brand still "Car Social" (title, auth wordmark, logo alt, carSocialToken key) | layout, auth, Nav |
| F18 | LOW(env) | S | Missing `allowedDevOrigins` → app SSRs but never hydrates on non-localhost origin (silent) | next.config.mjs |
| F19 | LOW | S | Polish bundle: carousel arrows off-center; Feed error==empty ("End of the road"); export no busy/err state; no app/not-found.tsx; avatar onError fallback; text-slate-400 contrast <AA; post img alt always "" (no alt in data model); posts/new vehicle checkboxes need nickname; dead images.remotePatterns; MileageChart axis ~6px on mobile | various |

Not flagged (documented decisions): /search stub, no thumbnails/CDN, empty-state polish &
ImageCarousel & comment styling (already on LOG), legacy presigned upload (ISSUES), local Google
login (ISSUES), comment replies/follows/following-feed (FEATURES backlog), USD-only.

### Proposed fix order (slices, all FRONTEND / dev-only / branch `improvements`)
- [x] **FE-1 Request & form robustness** (S): F3 (typed ApiError + QueryClient retry skips 4xx) + F1 (disable submits while pending) + F18 (allowedDevOrigins). Foundational; kills the worst shared-link bug and dupes. **Done 2026-06-11** — verified: 404 vehicle fails in ~1.4s (was ~8s), double-submit creates 1 post (was 2), hydration works on 127.0.0.1.
- [x] **FE-2 Guest & auth states** (S): F5 (login-to-act), F6 (guard create/edit for guests), F12 (garage pending flash). **Done 2026-06-12** — verified headless both states: guest like → /auth (no POST), comment form → login prompt, create/edit pages → AuthGate login card; logged-in unaffected, no garage flash.
- [x] **FE-3 Share-the-history trust** (S–M): styled private/deleted state (F3 UI), F10 (tab in URL), F14 (hide empty specs for visitors + mileage), F9 (one date/money formatter in lib/). **Done 2026-06-12** — LoadErrorCard on /v //posts //u, `?tab=` param (posts default, replace+no-scroll), visitor specs hide empties + mileage derives from latest history reading ("(latest recorded, <date>)"), lib/format.ts (formatDate/formatShortDate/formatDateTime/formatMoney) replaces all ad-hoc date/cost formatting incl. Comments + MileageChart axis. Verified headless 15/15. Note: backend returns 404 (not 403) for private-to-guest, so one card covers both.
- [x] **FE-4 Missing CRUD** (S–M): F2 (delete event/vehicle w/ confirm), F4 (edit profile fields), F7 (require content to publish), F20 (add VIN input to vehicle form — owner-requested; vin is in schema + Specs but has no form field). **Done 2026-06-12** — vehicleApi.delete/eventApi.delete; red "Delete event"/"Delete vehicle" actions on the edit forms (window.confirm → invalidate → redirect, PostCard pattern); /profile "Edit profile" toggle (display name, bio textarea, LocationInput) via PATCH /users/me + ["me"] invalidate; Publish disabled until caption-or-media w/ inline hint; VIN input (maxLength 32) saves on create+edit, renders on Specs. Verified headless (delete round-trips incl. API 404 after; profile persists across reload + bio on /u; empty post blocked). ⚠️ Backend follow-up: DELETE /vehicles/{id} 500s when the vehicle has vehicle_events rows (even soft-deleted) — `db.delete(vehicle)` NULLs `vehicle_events.vehicle_id` (no cascade) → NotNullViolation; UI surfaces the error, deletion needs a backend fix.
- [ ] **FE-5 Shareable metadata** (M): F11 (generateMetadata/OG for /v, /posts, /u).
- [ ] **FE-6 A11y + polish + rebrand** (S–M): F13 (dialog/focus), F19 bundle, F16 (adopt/remove .tab), F17 (Car Social → CeceCar).
- [ ] **FE-7 Cleanup/refactor** (S): F15 (useMe hook + types), F8 (like via query cache).

Backend review: pending (run later; security-framed prompt trips Fable 5's filter — use Opus 4.8 or a high-level rewrite).
