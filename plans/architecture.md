# Architecture & Invariants

Read this before changing anything. The "Invariants" section is the conflict checklist.

## Data flow (one click does everything)

```
Google Sheet (owner's account)            ← source of truth, edited by admins
  ├─ Events tab        = raw race rows (the operative truth for all stats)
  ├─ Ranking tab       = current standings (written by Apps Script)
  ├─ Points tab        = config (point tables, tier weights)  [webhook REMOVED from K5]
  └─ Apps Script       = the ONLY rating engine (DSR + LPR), deterministic
        │  menu "Racing → Ratings & Ranking neu berechnen"
        │    1. recalculates ratings, writes Events cols J–O + Ranking tab
        │    2. triggerGitHubUpdate()  → POST repository_dispatch (type "recalc")
        ▼
GitHub repo  floriankocourek-dev/simracing-ranking-bot  (PUBLIC)
  └─ workflow .github/workflows/post-ranking.yml  (on: workflow_dispatch | repository_dispatch[recalc])
        1. post-ranking.mjs  → reads Ranking tab CSV → posts Top-100 to Discord
        2. build-data.mjs    → reads full Events CSV → writes docs/data/*.json
        3. commits snapshot.json + docs/data, pushes
        ▼
GitHub Pages (from main /docs)  →  https://theracingclub.online/   (static webapp)
```

The Sheet is shared **link-view (read-only)**; the runner reads it via public CSV
endpoints (Ranking tab = `export?...&gid=`, Events tab = `gviz/tq?...&sheet=Events`).

## Two ratings
- **DSR** (Driver Skill Rating): Elo-style, computed by Apps Script, **materialized in
  Events col `Rating_after`**. The webapp/runner only READ it, never recompute it.
- **LPR** (League Performance Rating): rolling sum of `FINAL_POINTS` over the **last 12
  months relative to the cutoff date**. Time-dependent *by design* — inactive drivers
  decay. (While the league is <12 months old, nothing has aged out yet.)

## Divisions vs formats
- **A / B / C** = strength divisions (A strongest). Drives "current division",
  per-division leaderboards, Division-A club.
- **Cup / 3x3** = formats, NOT a strength ladder. They count toward overall stats
  (wins, points, form…) and get their own format leaderboards, but are excluded from
  division progression.

## Invariants / must-not-break  ← check these before any change
1. **Single rating engine.** All DSR/LPR logic lives in Apps Script. Never reimplement
   DSR in JS; `build-data.mjs` reads `Rating_after`. (User requirement: do not change
   the calculation logic — it's popular as-is.)
2. **Stateless regeneration.** Every run rebuilds all of `docs/data/` from Events.
   The one stateful file is `docs/data/published-history.json` — **append-only, frozen**
   (dedup by cutoff date). Don't rewrite past entries.
3. **Secrets locations (never in code or the Sheet):**
   - `DISCORD_WEBHOOK`, `SHEET_CSV_URL` → GitHub repo **Secrets**.
   - `GITHUB_TOKEN` (fine-grained, this repo, Contents R/W) → Apps Script **Script
     Properties**. Expires ~yearly → regenerate + update the property.
4. **The Sheet is public (link-view).** No private data (real names, emails) in ANY tab.
5. **Webapp is static & read-only.** No backend, no auth, no DB. Only reads public JSON.
6. **Discord message limit.** Each message ≤ 2000 chars. The "NEW entries" list is capped
   (see data-pipeline plan). Posting uses backoff + handles Cloudflare 1015.
7. **Driver JSON shape.** `docs/data/drivers/<slug>.json` must include a `current`
   object — `driver.js` reads `d.current.lpr/dsr/lpr_pos/dsr_pos`.
8. **Custom domain.** `docs/CNAME` = `theracingclub.online`. Deleting it breaks the domain.
   GitHub Pages serves from `main` `/docs`.
9. **`plans/` is not published.** Keep planning docs out of `docs/`.

## Output files written by build-data.mjs (consumed by the webapp)
`meta.json`, `current-ranking.json`, `drivers-index.json`, `drivers/<slug>.json`,
`leaderboards.json`, `events.json`, `events/<id>.json`, `stats.json`, `halloffame.json`,
`published-history.json` (frozen archive).

## Local dev
- `node build-data.mjs` regenerates `docs/data/` from the live Sheet (needs the Sheet
  public). Verify before pushing.
- Preview: `.claude/launch.json` runs `serve-preview.mjs` (a throwaway static server on
  the Desktop, outside the repo). Note: the preview viewport can collapse to width 0 and
  `preview_screenshot` is flaky — verify via DOM measurements (`preview_eval`) instead.
