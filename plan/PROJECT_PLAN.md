# Project Plan

Phased roadmap. The ordering reflects the North Star: **deepen the history moat first**, add social amplifiers when cheap. See `FEATURES.md` for the full backlog and effort/priority.

## Current state (2026-05)
Working MVP on the **`redesign`** branch: vehicle profiles, image posts, feed, comments/likes, full vehicle **history** (typed events with media, lightbox, color tags, filter, CSV/ZIP export), standardized make/model/year catalog, tunnel-safe media uploads, location autocomplete, generated avatars, and a clean minimal design system. `master` holds the pre-redesign snapshot (tag `before-redesign`).

## Phase 0 — Stabilize the redesign (in progress)
Goal: finish the visual/UX pass and merge `redesign → master`.
- [x] Design system + global theme (fonts, surfaces, primitives, white bg).
- [x] Instagram-style left rail; single scrollbar feed.
- [x] Vehicle page: integrated sticky header, icon actions, polished tabs.
- [x] History: color tags, filter, lightbox, export, cost-in-dollars, required date.
- [ ] Remaining polish (empty states, ImageCarousel controls, comment list).
- [ ] **Open PR `redesign → master`** once polish is signed off.

## Phase 1 — History deepening (next, P0/P1)
Goal: make My Garage unmistakably "the place to keep your car."
- [x] Cost summary / total spend on History tab (S–M).
- [x] Share button on vehicle + post (S) — copy-link.
- [~] ~~Public "service record" page~~ — SKIPPED (decided `/v/[id]` + Copy link is enough).
- [ ] Build sheet / mods list (M).
- [ ] Receipts/PDF document attachments on events (M).

## Phase 2 — Light social amplifiers (P1)
Goal: help the right people find the right cars; cheap wins first.
- [ ] Who-liked modal (S).
- [ ] Comment replies + comment-like UI (S–M).
- [ ] Follow users + follow vehicles (M each) — schema already supports both.
- [ ] "Following" feed toggle (M).

## Phase 3 — Heavier features (P2, only with traction)
- [ ] Notifications (L).
- [ ] Search/discovery + hashtags/mentions (M–L).
- [ ] Save/bookmark, tag users.
- [ ] Maps (capture lat/long first).

## Deferred / maybe-never (P3)
Direct messages, stories/reels/video — revisit only if the audience demands it; they pull away from the moat.

## Working cadence
Small verified slices → commit → push (see `AGENTS.md`). Update `LOG.md` every slice; revisit this plan when a phase completes or priorities change.
