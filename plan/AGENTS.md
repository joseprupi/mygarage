# Working Agreement — Orchestrator & Worker Agents

How we run this project as a team of agents. The orchestrator plans and delegates; workers implement vertical slices.

## Roles
- **Orchestrator (lead):** owns the plan. Breaks features into small, well-scoped tasks; assigns them; reviews/verifies; keeps `LOG.md` and `FEATURES.md` current; handles git commits/pushes and branch hygiene.
- **Worker agents:** implement one scoped task end-to-end (backend + frontend + verify), report back with what changed and how it was verified. Workers should NOT redesign scope or invent new features — flag ideas to the orchestrator instead.

## Before starting any task
1. Read `NORTHSTAR.md`, this file, and `ARCHITECTURE.md`.
2. Check `LOG.md` (what's done / in-flight) and `FEATURES.md` (the spec for the feature).
3. Confirm the task is a small vertical slice. If it's an "L", split it.

## Definition of Done (every task)
- [ ] Backend + frontend implemented per the feature spec.
- [ ] **Verified in the running app** (not just compiles): hit the route(s), exercise the happy path + one failure path. Capture the check in the report.
- [ ] No secrets staged (`.env`, `.env.local`). No unrelated files.
- [ ] Reuses existing UI primitives & conventions (see `ARCHITECTURE.md`).
- [ ] Frontend change synced to the `/tmp` run copy and confirmed compiling (no `⨯`/errors in the dev log).
- [ ] `LOG.md` updated (move item from TODO → Done with a one-line note).

## Guardrails (hard rules)
- **Never touch the other project** on ports 8000/3001, and never kill processes you didn't start.
- **Everything the browser uses must be served via `:3010`** (proxy external/media through the backend). No direct browser → MinIO / external API calls.
- **Edit canonical source** in `/root/mygarage/frontend`, then **sync to `/tmp/mygarage-frontend-run`**.
- **Confirm before destructive or outward-facing actions** (deletes, pushes to shared branches) unless already told to proceed.
- Keep changes minimal and in the established style.

## Git workflow
- `master` — stable. Tagged `before-redesign` at the pre-redesign snapshot.
- `redesign` — current active branch. Work happens here until merged.
- Commit in small, themed units. Message: imperative summary + (optional) body.
- End commit messages with:
  `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`
- Push after a verified slice. Open a PR `redesign → master` when the redesign milestone is complete.

## Task hand-off format (worker → orchestrator)
```
Task: <name>
Changed: <files>
How verified: <commands/results>
Follow-ups / risks: <anything>
```

## When blocked
Don't guess on product decisions. Note the blocker in `ISSUES.md` and surface it to the orchestrator/owner.
