# Feature: Discord posting (GitHub runner)

- **Status:** Done
- **Last updated:** 2026-06-27

## Goal
Post the Top-100 LPR & DSR ranking to Discord reliably. Replaces the old Apps-Script
posting that failed intermittently due to Cloudflare 1015 rate-limiting on Google's
shared IPs.

## Files touched
- `post-ranking.mjs` — reads the Ranking tab CSV, builds the 6 messages, posts to the
  webhook with retry/backoff. Holds `WEBAPP_URL` (the link printed in the header).
- `.github/workflows/post-ranking.yml` — runs it; commits snapshot.
- `snapshot.json` — previous ranking snapshot, for ▲/▼ trend arrows + "biggest gain".

## Tasks
- [x] Move posting off Apps Script to a GitHub Actions runner (own IP, no 1015)
- [x] Reproduce the exact message format (headers, arrows, NEW entries, code blocks)
- [x] Robust send: detect Cloudflare 1015, read Retry-After, exponential backoff, cap
- [x] Cap the "NEW entries" list so the header never exceeds 2000 chars
- [x] Disable the old `postRankingToDiscord(...)` call in Apps Script

## Definition of Done
- [x] One run posts all 6 messages (HTTP 204) without manual retries
- [x] No Cloudflare-1015 failures under normal cadence
- [x] Discord output is visually identical to the old format
- [x] Verified live: real run posted all 6 to the official channel

## Dependencies & Conflicts
- **Depends on:** Sheet shared link-view; `SHEET_CSV_URL` + `DISCORD_WEBHOOK` secrets.
- **Shared files:** `snapshot.json` (also relevant to trend logic). `WEBAPP_URL` here
  must match the live domain — update if the domain changes (see custom-domain plan).
- **Invariants:** #3 (secrets), #6 (2000-char limit + 1015 handling).

## Notes / future
- The 2000-char limit is the historical footgun. If message content grows, re-check
  block sizes (currently 50 lines/block, ~1.6k chars).
- If a multi-minute Cloudflare ban ever recurs, the runner already aborts gracefully;
  re-running later succeeds (own IP rarely throttled).
