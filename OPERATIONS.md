# TRCrating — Operations Manual

Everything you need to run the rating system for **THE RACING CLUB**: adding drivers,
entering race results, and publishing to Discord + the website.

You do **not** need to be a programmer. The routine work is: type results into a Google
Sheet, then click one menu item. Everything else happens automatically.

---

## 1. What this system does

Every race result is typed into a Google Sheet. A script inside the Sheet calculates two
ratings per driver. One click then publishes the ranking to Discord **and** rebuilds the
public website.

```
   Google Sheet  ──────────────►  Apps Script  ──────────►  GitHub  ──────────►  Discord
   (you type here)                (calculates)              (automation)     +  Website
                                                                                theracingclub.online
```

**The three moving parts:**

| Part | What it is | What it does |
|---|---|---|
| **Google Sheet** | `TRCrating` spreadsheet | Holds all drivers + every race result. The single source of truth. |
| **Apps Script** | Code inside the Sheet (Extensions → Apps Script) | Calculates the ratings, then triggers GitHub. |
| **GitHub** | Repo `floriankocourek-dev/simracing-ranking-bot` | Posts the ranking to Discord and rebuilds the website. Runs by itself. |

**Live website:** https://theracingclub.online/

---

## 2. Access you need

Before taking over, make sure you have:

- [ ] **Edit access to the Google Sheet** (ask the current owner to share it with you as Editor)
- [ ] Access to the **Discord channel** where the ranking is posted (to check that posts arrive)
- [ ] *(Optional, only for troubleshooting)* Access to the **GitHub repo**

You do **not** need GitHub access for normal daily work. The automation is already
configured and runs on its own.

> **Note on credentials:** A GitHub access token is stored inside the Apps Script
> (Project Settings → Script Properties → `GITHUB_TOKEN`). You never need to touch it,
> except when it expires — see §9 *Periodic maintenance*.

---

## 3. The two ratings (so you can answer driver questions)

| | **LPR** — League Performance Rating | **DSR** — Driver Skill Rating |
|---|---|---|
| What it is | Sum of points from the **last 12 months** | Elo-style skill rating |
| Rewards | **Activity** — racing often | **Skill** — beating the field |
| Starts at | 0 | 1000 |
| Goes down when | You stop racing (old races age out) | You lose to lower-rated drivers |

**How DSR moves:** Each race, a driver gains `points × 0.5`, plus a bonus/malus for
upsets: **+2** for every higher-rated driver they finish ahead of, **−2** for every
lower-rated driver that finishes ahead of them.

**Scoring:** Position points (P1 = 28, P2 = 23, P3 = 20 … P16 = 1) are multiplied by the
tier weight: **A 100% · B 80% · C 60% · Cup 50% · 3x3 25%**.

⚠️ **Do not change these numbers.** The scoring is established and popular with the
drivers. Changing it would retroactively rewrite all history. See §10.

---

## 4. The Sheet, tab by tab

| Tab | Purpose | Do you edit it? |
|---|---|---|
| **Drivers** | Master list of drivers | ✅ Yes — add new drivers here |
| **Events** | Every race result, one row per driver per race | ✅ Yes — this is your main workspace |
| **Ranking** | Current standings | ❌ No — auto-generated, **overwritten** every recalculation |
| **Points** | Configuration (point tables, tier weights, rating parameters) | ❌ No — leave alone |
| **Instructions** | ⚠️ **OUTDATED** — describes an old system, ignore it | ❌ Ignore / delete |

### The Events tab columns

| Col | Name | Who fills it |
|---|---|---|
| A | `Date` | **You** — format `YYYY-MM-DD` |
| B | `Event_Name` | **You** |
| C | `Driver` | **You** — use the dropdown |
| D | `Tier` | **You** — `A`, `B`, `C`, `Cup`, or `3x3` |
| E | `Promotion_demotion` | Optional, unused by the calculation |
| F | `Quali` | Optional, **not used** in scoring |
| G | `Position` | **You** — finishing position (1, 2, 3 …) |
| H | `RacePoints` | 🔄 Auto (sheet formula) |
| I | `FINAL_POINTS` | 🔄 Auto (sheet formula: RacePoints × tier weight) |
| J–O | `Rating_before` … `EffectivePoints` | 🤖 Auto — written by the script on recalculation |

**In short: you only fill A, B, C, D, G.** Everything from H onward calculates itself.

> If you copy a new row, make sure the formulas in H and I come along. After entering
> Position + Tier, those two cells should populate immediately. If they stay empty, copy
> the formulas down from the row above.

---

## 5. Routine: Adding a new driver

Do this **before** entering their first result.

1. Open the **Drivers** tab.
2. Add a new row at the bottom:
   - **Driver** — their exact name. ⚠️ This must match the spelling used in Events
     *exactly* (see §10, most common mistake).
   - **Join_Date** — the date they joined.
   - **Country** — English country name, e.g. `USA`, `UK`, `Germany`, `South Africa`.
     Used for the flag on the website. Optional.
   - **Racingnumber** — their number, e.g. `34`. Optional.
3. Done. The driver now appears in the Events dropdown.

**Country and number are independent and optional.** A driver with a country but no
number gets a flag and no number, and vice versa. You can fill these in later at any time.

> If a country you enter doesn't produce a flag on the website, the country name isn't in
> the lookup table yet — see §8.

---

## 6. Routine: Entering race results

For each race, add **one row per driver** in the **Events** tab.

1. Open the **Events** tab, scroll to the bottom (first empty row).
2. For every driver who took part, fill in:

| Column | Example | Notes |
|---|---|---|
| `Date` | `2026-07-25` | Always `YYYY-MM-DD` |
| `Event_Name` | `CS S6 - Red Bull Ring - Tier B` | See naming rule below |
| `Driver` | *(pick from dropdown)* | Never type it by hand |
| `Tier` | `B` | Exactly `A`, `B`, `C`, `Cup` or `3x3` |
| `Position` | `2` | Finishing position |

3. Check that `RacePoints` (H) and `FINAL_POINTS` (I) filled themselves in.
4. When all rows for the race are entered → go to §7 to publish.

### Event naming rule (important)

A race is identified by the combination **Date + Event_Name + Tier**. Everyone sharing
those three values is treated as being in the same race, which is how the upset
bonus/malus is calculated.

✅ **Do:** give each race a name that makes it unique, including region/round/track where
relevant — e.g. `Miata Mondays - Watkins Glen - EU` and `Miata Mondays - Watkins Glen - Americas`.

❌ **Don't:** give two *different* races on the same day in the same tier the same name.
They would be merged into one race and the ratings would be wrong.

### Drivers who didn't finish / didn't start

Leave `Position` **empty** or enter `0`. Those rows score 0 points and are excluded from
win/podium counts, average finish, and the Giant Killer statistic. They do no harm.

---

## 7. Routine: Publishing (the one click)

After all results are entered:

> **Google Sheet menu → `Racing` → `Ratings & Ranking neu berechnen`**

That single click does everything:

1. Recalculates all ratings and fills Events columns J–O
2. Rewrites the **Ranking** tab
3. Triggers GitHub, which then:
   - posts the Top-100 ranking to **Discord**
   - rebuilds the **website** (rankings, driver profiles, leaderboards, events, stats)

**Timing:** the calculation takes a few seconds. A toast message appears at the bottom of
the Sheet: *"GitHub angestoßen – Discord & Webapp werden in ~1 Min aktualisiert."*
Discord and the website follow within roughly one minute.

### Verifying it worked

1. **Discord** — the ranking post should appear (6 messages: LPR header, LPR 1–50,
   LPR 51–100, DSR header, DSR 1–50, DSR 51–100).
2. **Website** — open https://theracingclub.online/ and press **Ctrl+F5** (hard reload).
   The header line shows the driver count, race count, and *last update* date.

If either is missing, see §8.

---

## 8. Troubleshooting

### The website shows a driver with DSR 0, or numbers look wrong
**Cause:** results were entered but the recalculation hasn't run yet, so the script hasn't
filled in the ratings.
**Fix:** run `Racing → Ratings & Ranking neu berechnen`.

### Nothing was posted to Discord, and no toast appeared
1. Did you actually click the menu item, and did the calculation finish?
2. Check the Apps Script log: **Extensions → Apps Script → Executions** (left sidebar).
   Open the latest `recalcRatingsAndRanking` run and read the messages.
3. If you see an error mentioning HTTP **401** or **403**: the GitHub token has expired →
   see §9.

### The recalculation ran, but Discord/website didn't update
The GitHub side may have failed. Open the repo → **Actions** tab → look at the newest run
("Post Ranking to Discord"). A red ✗ means it failed; click it to read the log.
**Quick workaround:** on that page click **Run workflow** to start it manually.

### A driver appears twice on the website
Their name is spelled two different ways in the Events tab (e.g. a trailing space, or
`TRC_Name` vs `TRC Name`). Find and correct the rows so all use the identical spelling,
then recalculate.

### A driver's flag doesn't show
The country name isn't in the lookup table yet. This needs a small code change — pass the
country name on to whoever maintains the code (§11). Everything else keeps working
normally in the meantime.

### Some drivers' ratings look off after editing old rows
Ratings are always recalculated from the full history, so correcting an old row is fine —
but it can slightly shift later ratings for the drivers involved. That is expected and
correct behaviour, not a bug.

---

## 9. Periodic maintenance

**The only recurring task.** A GitHub access token is stored in the Apps Script and
expires (roughly yearly). When it does, the recalculation still works but Discord and the
website stop updating, and you'll see an HTTP 401/403 error in the Apps Script log.

**To renew** (needs GitHub access to the repo owner's account):

1. On GitHub: **Settings → Developer settings → Personal access tokens → Fine-grained
   tokens → Generate new token**
   - Repository access: **Only select repositories** → `simracing-ranking-bot`
   - Permissions → Repository permissions → **Contents: Read and write**
     (Metadata: Read is added automatically — leave it)
   - Set an expiry, generate, and copy the token
2. In the Apps Script editor, add this function at the bottom, paste the token in, then
   select `setTokenOnce` in the function dropdown and press **Run**:
   ```javascript
   function setTokenOnce() {
     PropertiesService.getScriptProperties()
       .setProperty('GITHUB_TOKEN', 'PASTE_TOKEN_HERE');
     Logger.log('GITHUB_TOKEN saved.');
   }
   ```
3. **Remove the token from the code again** (replace it with the placeholder or delete the
   function) and save. The token now lives safely in Script Properties.

> Do **not** put the token into the Sheet itself — the Sheet is publicly readable by link.
> The Script Properties editor in the UI has proven unreliable; use the function above.

---

## 10. Rules and pitfalls — please read once

**Never change the scoring or rating parameters** (Points tab, or the calculation code).
The ratings are recalculated from the entire history every time, so a change would
retroactively rewrite every driver's past. The system is established and the community
likes it as it is.

**Driver names are the key that links everything.** Always pick drivers from the dropdown
in Events. A typo creates a "new" driver with an empty history.

**Keep each race uniquely named** (Date + Event_Name + Tier) — see §6.

**Don't edit the Ranking tab.** It is overwritten on every recalculation.

**The Sheet is publicly readable by link.** That's required for the website to read the
data. Therefore: **never put private information in any tab** (real names, emails, private
notes) and never store passwords, tokens, or webhook URLs in it.

**The Instructions tab is outdated.** It describes an older template system that no longer
matches reality. Ignore it — this manual replaces it. It can safely be deleted.

**Renaming events retroactively is possible but be careful.** Renaming only the event
names is safe *as long as each race stays uniquely identified*. If two different
same-day, same-tier races end up sharing a name, they merge and ratings change.

---

## 11. Reference

**Google Sheet:** `TRCrating` (ask the owner for the link)
**Website:** https://theracingclub.online/
**GitHub repo:** https://github.com/floriankocourek-dev/simracing-ranking-bot
**Manual workflow trigger:** repo → Actions → "Post Ranking to Discord" → Run workflow

**Configuration values** (Points tab — for reference only, don't change):
```
START_RATING     1000     Starting DSR for every new driver
BONUS_PER_UPSET  2        DSR bonus per higher-rated driver beaten
MALUS_PER_BAD    2        DSR penalty per lower-rated driver that beat you
RATING_FACTOR    0.5      Share of points that converts into DSR

Position points  P1=28  P2=23  P3=20  P4=18  P5=16  P6=14  P7=12  P8=10
                 P9=8   P10=7  P11=6  P12=5  P13=4  P14=3  P15=2  P16=1
Tier weights     A=100%  B=80%  C=60%  Cup=50%  3x3=25%
```

**Where the code lives** (for a technical helper):
- Rating calculation: Apps Script inside the Sheet (`recalcRatingsAndRanking`)
- Discord posting: `post-ranking.mjs` in the GitHub repo
- Website data generation: `build-data.mjs` in the GitHub repo
- Website pages: `docs/` folder in the GitHub repo
- Technical notes and architecture: `plans/` folder in the GitHub repo

---

## 12. Quick reference card

**Every race weekend:**
1. New drivers? → add them to the **Drivers** tab first
2. Enter results in **Events**: `Date`, `Event_Name`, `Driver`, `Tier`, `Position`
3. Click **`Racing → Ratings & Ranking neu berechnen`**
4. Check Discord, and the website after a hard reload (Ctrl+F5)

That's the whole job.
