# Feature: One-click trigger from the Sheet

- **Status:** Done
- **Last updated:** 2026-06-27

## Goal
Clicking "Racing → Ratings & Ranking neu berechnen" in the Sheet should recalc AND
fire the GitHub workflow (Discord post + webapp rebuild) — no second manual step.

## Files touched
- `.github/workflows/post-ranking.yml` — added `repository_dispatch: types: [recalc]`
  alongside `workflow_dispatch`.
- **Apps Script** (in the Google Sheet, not in this repo):
  - `triggerGitHubUpdate()` — POSTs to the GitHub dispatches API with the token.
  - call to `triggerGitHubUpdate();` at the end of `recalcRatingsAndRanking`.
  - Script Property `GITHUB_TOKEN` (fine-grained PAT, this repo, Contents R/W).
  - A copy of the function lives at repo Desktop: `trigger_github_update.gs`.

## Tasks
- [x] Add repository_dispatch trigger to the workflow
- [x] Apps Script function + call + token in Script Properties
- [x] Keep the manual "Run workflow" button working as a fallback

## Definition of Done
- [x] A Sheet menu click fires a `repository_dispatch` run (visible in Actions)
- [x] That run posts Discord + rebuilds the webapp, commits, deploys
- [x] Verified end-to-end live on 2026-06-27

## Dependencies & Conflicts
- **Depends on:** `GITHUB_TOKEN` in Apps Script Script Properties (NOT the Sheet —
  invariant #3 + #4, the Sheet is public). Token expires ~yearly → regenerate and
  update the property via a one-off `setProperty` run (the Properties UI editor was
  unreliable — use code).
- **Repo name is baked into the dispatch URL** in the Apps Script. If the repo is
  renamed, update that URL (and `SHEET_CSV_URL`).
- **Invariants:** #3 (token location), #1 (Apps Script stays the engine; it no longer
  posts to Discord itself — that's the runner's job).

## Notes / future
- Token currently fine-grained, single-repo, Contents R/W → blast radius limited to this
  repo if leaked.
- Could add a scheduled cron trigger later in addition to the manual click.
