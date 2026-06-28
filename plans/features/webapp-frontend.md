# Feature: Webapp frontend

- **Status:** Done
- **Last updated:** 2026-06-27

## Goal
Static, dark-themed webapp that renders the JSON: ranking, driver profiles, leaderboards,
events, stats, hall of fame. Every stat carries a short English explanation.

## Files touched
- `docs/index.html` + `docs/assets/overview.js` — ranking table (sort/search/trend)
- `docs/driver.html` + `docs/assets/driver.js` — profile 2.0 (cards, stats, badges,
  DSR/LPR chart, race list with ΔDSR/ΔLPR)
- `docs/leaderboards.html` + `docs/assets/leaderboards.js`
- `docs/stats.html` + `docs/assets/stats.js` — scatter, participants-per-event,
  activity-per-month, monthly recap
- `docs/events.html` + `docs/assets/events.js`, `docs/event.html` + `docs/assets/event.js`
- `docs/halloffame.html` + `docs/assets/halloffame.js`
- `docs/assets/common.js` — shared: nav, glossary (stat explanations), badge defs,
  helpers, header-logo injection
- `docs/assets/app.css` — all styling
- `docs/assets/logo.svg` — club logo (recolored light for dark theme)

## Tasks
- [x] All pages + shared nav + glossary explanations
- [x] Charts via Chart.js (CDN): driver curve, scatter, activity, participants
- [x] Club logo top-right in header on every page (120px)
- [x] Readable accent link color (not browser blue)
- [x] Mobile: no horizontal overflow (ranking table in scroll container + compact layout)
- [x] Removed Closest Battles + Division Distribution from Stats (per request)

## Definition of Done
- [x] Each page loads its JSON and renders without console errors
- [x] Every stat has an explanation (GLOSSARY in common.js)
- [x] No horizontal page overflow at 375px on any page
- [x] Live URLs return 200

## Dependencies & Conflicts
- **Depends on:** the JSON shapes from the data pipeline. If you add a stat, add it in
  `build-data.mjs` first, then render it + add a GLOSSARY entry.
- **Shared files (high conflict risk):** `app.css` and `common.js` affect EVERY page —
  change with care. `common.js` injects both the nav and the header logo (handles both
  `.site-header` and `.page-head` headers).
- **External dep:** Chart.js from jsDelivr CDN (the only external request; CSP-free since
  it's our own static site).
- **Invariants:** #5 (static/read-only), #7 (driver `current`), #8 (CNAME).

## Notes / future
- Header logo is hidden under 480px width to avoid overlapping the title on small phones.
- Preview screenshots are flaky here; verify layout via `preview_eval` measurements.
- V2 ideas: head-to-head page, league timeline (Top-N highlighted), more badges.
