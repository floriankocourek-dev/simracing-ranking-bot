# Plans & Feature Tracking

Internal planning notes for the TRCrating system. **Not published** — this folder lives
at the repo root, *outside* `docs/`, so GitHub Pages never serves it.

## Why this exists
Before building or changing a feature, skim the relevant plan(s) and
[`architecture.md`](architecture.md) to check whether your change touches something
another feature depends on. Each feature plan lists the files it owns, its
**Definition of Done**, and a **Dependencies & Conflicts** section.

## How to use
1. **New feature:** copy [`TEMPLATE.md`](TEMPLATE.md) to `features/<name>.md`, fill it in,
   set status `Planned`. Add a row to the table below.
2. **While building:** tick the task checkboxes; keep "Files touched" current.
3. **Before merging/deploying:** verify every Definition-of-Done item.
4. **Conflict check:** read [`architecture.md`](architecture.md) → "Invariants /
   must-not-break" and the touched features' "Dependencies & Conflicts".

Status values: `Planned` · `In progress` · `Done` · `Parked`

## Feature index

| Feature | Status | Plan |
|---|---|---|
| Architecture & invariants (read first) | — | [architecture.md](architecture.md) |
| Discord posting (GitHub runner) | Done | [features/discord-posting.md](features/discord-posting.md) |
| Webapp data pipeline (`build-data.mjs`) | Done | [features/data-pipeline.md](features/data-pipeline.md) |
| Webapp frontend (pages, nav, logo, mobile) | Done | [features/webapp-frontend.md](features/webapp-frontend.md) |
| One-click trigger from the Sheet | Done | [features/sheet-trigger.md](features/sheet-trigger.md) |
| Custom domain (theracingclub.online) | Done | [features/custom-domain.md](features/custom-domain.md) |

## Backlog / ideas (not yet built)
- V2 webapp: head-to-head comparison, league timeline (Top-N highlight), more badges.
- Optional: scheduled (cron) auto-update in addition to the Sheet trigger.
- Optional: disconnect GoDaddy Website Builder from the domain (cleanup, not urgent).
