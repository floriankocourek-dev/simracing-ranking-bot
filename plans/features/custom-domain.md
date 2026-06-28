# Feature: Custom domain (theracingclub.online)

- **Status:** Done
- **Last updated:** 2026-06-27

## Goal
Serve the webapp on the club's own domain with HTTPS instead of the github.io URL.

## Files touched
- `docs/CNAME` — contains `theracingclub.online` (anchors the Pages custom domain).
- `post-ranking.mjs` — `WEBAPP_URL` updated to `https://theracingclub.online/`.
- GitHub Pages config (cname set, HTTPS enforced) — not a file.
- GoDaddy DNS (external) — apex A records → GitHub Pages IPs.

## Tasks
- [x] GoDaddy: 4 apex A records → 185.199.108–111.153 (replaced the WebsiteBuilder A)
- [x] `docs/CNAME` + Pages custom domain set
- [x] Update Discord `WEBAPP_URL`
- [x] Enforce HTTPS (Let's Encrypt cert auto-provisioned)

## Definition of Done
- [x] `https://theracingclub.online/` serves the webapp (Server: GitHub.com), valid cert
- [x] http → https redirect enforced
- [x] old github.io URL redirects to the custom domain

## Dependencies & Conflicts
- **Depends on:** GoDaddy DNS staying pointed at GitHub IPs; `docs/CNAME` present;
  repo PUBLIC (free Pages).
- **Conflict risk:** GoDaddy Website Builder is still "connected" to the domain — if it
  ever re-publishes it could reset DNS. Optional cleanup: disconnect it.
- **Invariants:** #8 (don't delete `docs/CNAME`). If the domain changes, also update
  `WEBAPP_URL` in `post-ranking.mjs`.

## Notes / future
- After the switch, a stale LOCAL DNS cache briefly served the old GoDaddy page — not a
  misconfig (`ipconfig /flushdns` cleared it).
- DNS A records (for reference): 185.199.108.153 / .109.153 / .110.153 / .111.153.
