# My Garage — North Star

> The single source of truth for **why** this project exists. When in doubt, decisions should serve this document. Read this first.

## One-liner
A car-specific social network where every vehicle has a **durable, shareable life history** — service, mods, drives, ownership — that enthusiasts actually want to keep, and buyers actually trust.

## Who it's for
- **Car enthusiasts** who want a real home for their car's story (builds, mods, maintenance) — not scattered receipts and forum posts.
- **Buyers & sellers** who want a credible, exportable service/build record attached to a specific vehicle.
- Secondary: the social layer (following, likes) that helps these people find each other and the cars they care about.

## The moat (what we protect and deepen)
**The vehicle history is the product.** A durable, structured, media-rich, exportable timeline per vehicle is the thing competitors (generic social apps, marketplaces) don't have. Everything else is an amplifier.

If a feature deepens the history or makes it more trustworthy/shareable → high priority.
If a feature is "social network table stakes" → do it only when it's cheap or clearly amplifies the moat.

## Principles
1. **History first.** Social features are sprinkles, not the cake.
2. **Minimal, clean, integrated UI.** Instagram-ish layout, restrained styling, consistent primitives. No visual clutter.
3. **Trust & portability.** Owners can export and take their data (CSV/ZIP today, more later). History should feel permanent.
4. **Ship small, verified slices.** Every change is run and verified in the real app, then committed.
5. **Don't reinvent data.** Reuse free, authoritative sources (NHTSA-derived car catalog, OSM/Photon geocoding) proxied through our backend.

## Definition of "good"
- An enthusiast says: "this is where I keep my car."
- A seller says: "here's the link — full history, exportable."
- The UI feels calm and consistent everywhere.

## Pointers
- Roadmap & phases → `docs/PROJECT_PLAN.md`
- Feature backlog (priority/effort) → `docs/FEATURES.md`
- What's done / in-flight → `docs/LOG.md`
- How the system works + dev gotchas → `docs/ARCHITECTURE.md`
- How agents should operate → `docs/AGENTS.md`
- Known issues / tech debt → `docs/ISSUES.md`
