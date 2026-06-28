# Feature: Webapp data pipeline (`build-data.mjs`)

- **Status:** Done
- **Last updated:** 2026-06-27

## Goal
Turn the raw Events sheet into all the static JSON the webapp renders. Deterministic,
stateless, fully regenerated each run. This is where ALL the computation lives.

## Files touched
- `build-data.mjs` — reads the full Events CSV (gviz), computes everything, writes JSON.
- `docs/data/*.json` — generated outputs (committed so Pages serves them).

## Outputs (schema owners — see architecture.md)
`meta.json`, `current-ranking.json`, `drivers-index.json`, `drivers/<slug>.json`
(profile 2.0: stats, division, badges, history with per-race dsr_gain/lpr_gain, `current`),
`leaderboards.json` (overall + by_division A/B/C + by_format Cup/3x3 + giant_killer),
`events.json`, `events/<id>.json` (strength-of-field, per-division results),
`stats.json` (totals, participants_over_time, activity_by_month, monthly_recap),
`halloffame.json`, `published-history.json` (frozen snapshot archive).

## Tasks
- [x] Reconstruct full history + per-cutoff snapshots from Events
- [x] Per-driver stats, divisions/formats, badges, biggest gains, consistency
- [x] Leaderboards incl. cross-driver Giant Killer join
- [x] Events index + per-event detail with Strength of Field
- [x] League stats + monthly recap
- [x] Frozen, append-only `published-history.json`

## Definition of Done
- [x] `node build-data.mjs` runs clean against the live Sheet
- [x] Top values match the official Ranking tab (spot-checked)
- [x] Numbers parse correctly despite German decimal commas (`parseNum`)
- [x] Leaderboard sort directions correct (was an inverted-sort bug — fixed)
- [x] Driver files include a `current` object (driver.js depends on it)

## Dependencies & Conflicts
- **Depends on:** Events tab columns (`Date, Event_Name, Driver, Tier, Position,
  FINAL_POINTS, Rating_before, Rating_after`). If the Sheet's columns are renamed/moved,
  update the header lookups in `loadEvents()`.
- **Consumed by:** the entire webapp frontend. Changing a JSON shape = update the
  matching page JS (see webapp-frontend plan).
- **Invariants:** #1 (read Rating_after, never recompute DSR), #2 (stateless + frozen
  published-history), #7 (driver `current` object).

## Notes / future
- LPR rolling-12mo window uses the cutoff date. Today it equals cumulative points
  (league <12mo); will start decaying once races age out.
- `MIN_STARTS = 5` gate for avg-finish/consistency boards. `TOP_N = 25` list length.
