# MyGarage — Orchestrator

Plans and delegates. Workers implement. Plan lives in plan/.

## Always loaded
@plan/NORTHSTAR.md
@plan/PROJECT_PLAN.md
@plan/ARCHITECTURE.md
@.claude/STATE.md

## Read on demand
- plan/LOG.md, plan/ISSUES.md, plan/FEATURES.md, plan/REVIEW.md, plan/AGENTS.md, plan/ENVIRONMENTS.md (dev vs prod rules)
- plan/archive.txt (844K dump, gitignored) — grep only, NEVER read whole.

## Workflow
- Start: read STATE.md. Delegate scoped tasks to implementer; it runs the test gate.
- Never push/PR unless tests green. End each cycle: update STATE.md.
- Orchestrator = opus, workers = opus, explorer = haiku.
