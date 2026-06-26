// =====================================================
// Daten-Builder fuer die TRCrating-Webapp
//
// Liest das gesamte Events-Sheet (operative Wahrheit) und erzeugt
// ALLE fertigen JSON-Exporte, die die Webapp nur noch rendert.
// Deterministisch, zustandslos, bei jedem Lauf voll neu erzeugt.
//
// Single-Engine-Prinzip: DSR wird NICHT nachgerechnet, sondern aus
// 'Rating_after' / 'Rating_before' gelesen (vom Apps Script materialisiert).
// LPR = rollierende 12-Monats-Summe von FINAL_POINTS (zeitabhaengig).
//
// Divisions-Modell (vom Nutzer festgelegt):
//   A/B/C = Staerke-Divisionen (A am staerksten). Cup/3x3 = Formate.
//
// Erzeugt unter docs/data/:
//   meta.json, current-ranking.json, drivers-index.json,
//   drivers/<slug>.json, leaderboards.json, events.json,
//   events/<id>.json, stats.json, halloffame.json,
//   published-history.json (eingefrorenes Snapshot-Archiv)
// =====================================================

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SHEET_ID = process.env.SHEET_ID || '1K7dAEFipikKOX8KxjgdFADQXB146Rgtuku5F5YDKgcE';
const EVENTS_CSV_URL = process.env.EVENTS_CSV_URL ||
  `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=Events`;

const DATA_DIR = join(__dirname, 'docs', 'data');
const DRIVERS_DIR = join(DATA_DIR, 'drivers');
const EVENTS_DIR = join(DATA_DIR, 'events');
const PUBLISHED_FILE = join(DATA_DIR, 'published-history.json');

const TOP_N = 25;           // Laenge der Bestenlisten
const MIN_STARTS = 5;       // Mindeststarts fuer Durchschnitts-/Konstanz-Listen
const DIVISIONS = ['A', 'B', 'C'];   // Staerke-Divisionen (A am staerksten)
const FORMATS = ['Cup', '3x3'];      // Formate (keine Staerke-Leiter)

// ---------- Helfer ----------
function parseNum(raw) {
  if (raw == null) return 0;
  let s = String(raw).trim().replace(/^"|"$/g, '').trim();
  if (s === '') return 0;
  if (s.indexOf(',') !== -1 && s.indexOf('.') === -1) s = s.replace(',', '.');
  const n = Number(s);
  return isNaN(n) ? 0 : n;
}
function parseCSV(text) {
  const rows = [];
  let row = [], field = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; } else field += c; }
    else {
      if (c === '"') q = true;
      else if (c === ',') { row.push(field); field = ''; }
      else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
      else if (c === '\r') { /* skip */ }
      else field += c;
    }
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}
function dayValue(iso) { const [y, m, d] = iso.split('-').map(Number); return Date.UTC(y, m - 1, d); }
function minus12mo(iso) { const [y, m, d] = iso.split('-').map(Number); return Date.UTC(y - 1, m - 1, d); }
function minusDays(iso, days) { return dayValue(iso) - days * 86400000; }
function round2(n) { return Math.round(n * 100) / 100; }
function slugify(name) {
  const s = name.toLowerCase()
    .replace(/[äàá]/g, 'a').replace(/[öòó]/g, 'o').replace(/[üùú]/g, 'u').replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return s || 'x';
}
function stddev(arr) {
  if (arr.length < 2) return 0;
  const m = arr.reduce((a, b) => a + b, 0) / arr.length;
  return Math.sqrt(arr.reduce((a, b) => a + (b - m) ** 2, 0) / arr.length);
}
// Bestenliste bauen: mapper -> {slug,driver,value,...}; sort; top N
function board(items, value, opts = {}) {
  const dir = opts.asc ? 1 : -1;
  const list = items.filter(opts.filter || (() => true)).map(opts.map);
  // asc (z. B. avg_finish, consistency): aufsteigend; sonst absteigend (most/highest)
  list.sort((a, b) => dir * ((a.value ?? 0) - (b.value ?? 0)));
  return list.slice(0, opts.n || TOP_N);
}

// ---------- Events laden ----------
async function loadEvents() {
  const res = await fetch(EVENTS_CSV_URL);
  if (!res.ok) throw new Error('Events-CSV Abruf fehlgeschlagen: HTTP ' + res.status);
  const rows = parseCSV(await res.text());
  if (rows.length < 2) throw new Error('Events-CSV enthaelt keine Datenzeilen.');
  const header = rows[0].map((h) => h.trim());
  const ix = (n) => header.indexOf(n);
  const iDate = ix('Date'), iEvent = ix('Event_Name'), iDriver = ix('Driver'),
    iTier = ix('Tier'), iPos = ix('Position'), iFinal = ix('FINAL_POINTS'),
    iBefore = ix('Rating_before'), iAfter = ix('Rating_after');
  if ([iDate, iDriver, iFinal, iAfter].some((x) => x === -1)) {
    throw new Error('Erwartete Spalten fehlen. Header: ' + header.join(', '));
  }
  const events = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const date = (row[iDate] || '').trim();
    const driver = (row[iDriver] || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !driver) continue;
    events.push({
      date, dayVal: dayValue(date),
      event: (row[iEvent] || '').trim(),
      tier: (row[iTier] || '').trim(),
      driver,
      position: parseNum(row[iPos]),
      finalPts: parseNum(row[iFinal]),
      dsrBefore: iBefore === -1 ? null : parseNum(row[iBefore]),
      dsrAfter: parseNum(row[iAfter])
    });
  }
  events.forEach((e, i) => { e._i = i; });
  events.sort((a, b) => (a.dayVal - b.dayVal) || (a._i - b._i));
  return events;
}

// ---------- Liga-weite Snapshots (Phase-1-Logik, unveraendert) ----------
function reconstructSnapshots(events) {
  const byDriver = new Map();
  for (const e of events) { if (!byDriver.has(e.driver)) byDriver.set(e.driver, []); byDriver.get(e.driver).push(e); }
  const cutoffs = [...new Set(events.map((e) => e.date))].sort((a, b) => dayValue(a) - dayValue(b));
  const snapshots = [];
  for (const cut of cutoffs) {
    const cutVal = dayValue(cut), winStart = minus12mo(cut);
    const standings = [];
    for (const [driver, list] of byDriver) {
      if (list[0].dayVal > cutVal) continue;
      let dsr = null, lpr = 0;
      for (const e of list) { if (e.dayVal > cutVal) break; dsr = e.dsrAfter; if (e.dayVal >= winStart) lpr += e.finalPts; }
      standings.push({ d: driver, lpr: round2(lpr), dsr: round2(dsr) });
    }
    const byLpr = [...standings].sort((a, b) => b.lpr - a.lpr || b.dsr - a.dsr);
    byLpr.forEach((s, i) => { s.lp = i + 1; });
    const byDsr = [...standings].sort((a, b) => b.dsr - a.dsr || b.lpr - a.lpr);
    const dsrPos = new Map(byDsr.map((s, i) => [s.d, i + 1]));
    standings.forEach((s) => { s.dp = dsrPos.get(s.d); });
    snapshots.push({ cutoff: cut, drivers: standings });
  }
  return snapshots;
}
function mergePublished(reconstructed) {
  let existing = [];
  if (existsSync(PUBLISHED_FILE)) { try { existing = JSON.parse(readFileSync(PUBLISHED_FILE, 'utf8')); } catch { existing = []; } }
  if (!Array.isArray(existing) || existing.length === 0) return { merged: reconstructed, added: reconstructed.length, seeded: true };
  const known = new Set(existing.map((s) => s.cutoff));
  const maxKnown = existing.reduce((m, s) => Math.max(m, dayValue(s.cutoff)), 0);
  const additions = reconstructed.filter((s) => !known.has(s.cutoff) && dayValue(s.cutoff) > maxKnown);
  return { merged: existing.concat(additions), added: additions.length, seeded: false };
}

// ---------- Hauptaufbereitung ----------
function buildAll(events, published) {
  const latestDate = events[events.length - 1].date;

  // ----- pro Fahrer: Historie mit Gains, dsr_before -----
  const byDriver = new Map();
  for (const e of events) { if (!byDriver.has(e.driver)) byDriver.set(e.driver, []); byDriver.get(e.driver).push(e); }

  // ----- aktuelle Standings + Trend aus Published History -----
  const latestSnap = published[published.length - 1];
  const prevSnap = published.length > 1 ? published[published.length - 2] : null;
  const prevPos = new Map(); if (prevSnap) for (const s of prevSnap.drivers) prevPos.set(s.d, s);
  const curSnap = new Map(latestSnap.drivers.map((s) => [s.d, s]));

  // ----- eindeutige Slugs -----
  const slugUsed = new Map();
  const slugFor = (name) => { let b = slugify(name), s = b, n = 2; while (slugUsed.has(s) && slugUsed.get(s) !== name) s = `${b}-${n++}`; slugUsed.set(s, name); return s; };
  const slugByDriver = new Map();
  for (const d of byDriver.keys()) slugByDriver.set(d, slugFor(d));

  // ----- Races aufbauen (date|event|tier) fuer Cross-Driver-Joins -----
  const raceMap = new Map();
  for (const e of events) {
    const key = `${e.date}|${e.event}|${e.tier}`;
    if (!raceMap.has(key)) raceMap.set(key, { date: e.date, event: e.event, tier: e.tier, rows: [] });
    raceMap.get(key).rows.push(e);
  }

  // ----- Giant-Killer-Zaehlung (pro Race join) -----
  const giantKills = new Map(); // driver -> count
  for (const race of raceMap.values()) {
    for (const me of race.rows) {
      let kills = 0;
      for (const other of race.rows) {
        if (other === me) continue;
        if (other.position > me.position && (other.dsrBefore ?? 0) > (me.dsrBefore ?? 0)) kills++;
      }
      if (kills) giantKills.set(me.driver, (giantKills.get(me.driver) || 0) + kills);
    }
  }

  // ----- Pro-Fahrer-Objekte berechnen -----
  const drivers = []; // angereicherte Objekte fuer Index + Files
  for (const [driver, listRaw] of byDriver) {
    const list = listRaw; // bereits chronologisch (events global sortiert)
    const slug = slugByDriver.get(driver);
    const cur = curSnap.get(driver) || { lpr: 0, dsr: list[list.length - 1].dsrAfter, lp: null, dp: null };
    const pv = prevPos.get(driver);

    // Historie + Gains + rollierendes LPR
    const history = [];
    let prevLpr = 0, prevDsr = null;
    let bestDsr = -Infinity, bestLpr = -Infinity;
    let wins = 0, podiums = 0, top5 = 0, bestFinish = Infinity, sumPos = 0;
    const positions = [];
    let bigDsrGain = null, bigLprGain = null;
    const divProgression = [];
    let lastDiv = null, curDivision = null;
    let reachedA = false;

    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      const winStart = minus12mo(e.date);
      let lpr = 0;
      for (let j = 0; j <= i; j++) if (list[j].dayVal >= winStart) lpr += list[j].finalPts;
      lpr = round2(lpr);
      const dsr = round2(e.dsrAfter);
      const dsrGain = round2(dsr - (e.dsrBefore != null ? e.dsrBefore : (prevDsr != null ? prevDsr : 1000)));
      const lprGain = round2(lpr - prevLpr);

      if (dsr > bestDsr) bestDsr = dsr;
      if (lpr > bestLpr) bestLpr = lpr;
      if (e.position === 1) wins++;
      if (e.position >= 1 && e.position <= 3) podiums++;
      if (e.position >= 1 && e.position <= 5) top5++;
      if (e.position >= 1 && e.position < bestFinish) bestFinish = e.position;
      if (e.position >= 1) { sumPos += e.position; positions.push(e.position); }
      if (!bigDsrGain || dsrGain > bigDsrGain.value) bigDsrGain = { value: dsrGain, date: e.date, event: e.event, tier: e.tier };
      if (!bigLprGain || lprGain > bigLprGain.value) bigLprGain = { value: lprGain, date: e.date, event: e.event, tier: e.tier };

      // Divisions-Leiter (nur A/B/C)
      if (DIVISIONS.includes(e.tier)) {
        if (e.tier === 'A') reachedA = true;
        if (e.tier !== lastDiv) { divProgression.push({ tier: e.tier, from: e.date }); lastDiv = e.tier; }
        curDivision = e.tier;
      }

      history.push({
        date: e.date, event: e.event, tier: e.tier, position: e.position,
        final_points: round2(e.finalPts), dsr, lpr,
        dsr_gain: dsrGain, lpr_gain: lprGain
      });
      prevLpr = lpr; prevDsr = dsr;
    }

    const starts = list.length;
    const finishes = positions.length;
    const avgFinish = finishes ? round2(sumPos / finishes) : null;
    const consistency = finishes >= MIN_STARTS ? round2(stddev(positions)) : null;
    const ppr = round2((cur.lpr || 0) / starts);
    const recentForm = history.slice(-5).reverse().map((h) => h.position);
    const gk = giantKills.get(driver) || 0;

    // Badges
    const badges = [];
    if (starts >= 50) badges.push('iron_man');
    if (gk >= 20) badges.push('giant_killer');
    if (reachedA) badges.push('division_a');
    if (wins > 0) badges.push('race_winner');
    if (consistency != null && consistency <= 2.5) badges.push('metronome');
    if (dayValue(list[0].date) <= minusDays(latestDate, 180)) badges.push('veteran');

    drivers.push({
      driver, slug,
      first_seen: list[0].date, events_count: starts,
      lpr: cur.lpr, dsr: cur.dsr, lpr_pos: cur.lp, dsr_pos: cur.dp,
      lpr_trend: pv ? (pv.lp - cur.lp) : 0,
      dsr_trend: pv ? (pv.dp - cur.dp) : 0,
      current: { lpr: cur.lpr, dsr: cur.dsr, lpr_pos: cur.lp, dsr_pos: cur.dp },
      points_per_race: ppr,
      bests: {
        best_lpr: round2(bestLpr), best_dsr: round2(bestDsr),
        best_lpr_pos: bestPosFromPublished(published, driver, 'lp'),
        best_dsr_pos: bestPosFromPublished(published, driver, 'dp')
      },
      stats: {
        wins, podiums, top5, best_finish: bestFinish === Infinity ? null : bestFinish,
        avg_finish: avgFinish, points_per_race: ppr, recent_form: recentForm,
        biggest_dsr_gain: bigDsrGain, biggest_lpr_gain: bigLprGain,
        consistency, giant_kills: gk
      },
      division: { current: curDivision, progression: divProgression },
      badges,
      history,
      _reachedA: reachedA
    });
  }

  return { drivers, raceMap, latestDate };
}

// beste je erreichte Position aus Published History
function bestPosFromPublished(published, driver, key) {
  let best = Infinity;
  for (const snap of published) for (const s of snap.drivers) if (s.d === driver && s[key] < best) best = s[key];
  return best === Infinity ? null : best;
}

// ---------- Leaderboards ----------
function buildLeaderboards(drivers, raceMap) {
  const ref = (d) => ({ slug: d.slug, driver: d.driver });
  const overall = {
    most_starts: board(drivers, null, { map: (d) => ({ ...ref(d), value: d.events_count }) }),
    most_wins: board(drivers, null, { filter: (d) => d.stats.wins > 0, map: (d) => ({ ...ref(d), value: d.stats.wins, division: d.division.current }) }),
    most_podiums: board(drivers, null, { filter: (d) => d.stats.podiums > 0, map: (d) => ({ ...ref(d), value: d.stats.podiums, division: d.division.current }) }),
    most_top5: board(drivers, null, { filter: (d) => d.stats.top5 > 0, map: (d) => ({ ...ref(d), value: d.stats.top5 }) }),
    best_avg_finish: board(drivers, null, { asc: true, filter: (d) => d.events_count >= MIN_STARTS && d.stats.avg_finish != null, map: (d) => ({ ...ref(d), value: d.stats.avg_finish }) }),
    highest_dsr_ever: board(drivers, null, { map: (d) => ({ ...ref(d), value: d.bests.best_dsr }) }),
    highest_lpr_ever: board(drivers, null, { map: (d) => ({ ...ref(d), value: d.bests.best_lpr }) }),
    biggest_dsr_jump: board(drivers, null, { filter: (d) => d.stats.biggest_dsr_gain, map: (d) => ({ ...ref(d), value: d.stats.biggest_dsr_gain.value, date: d.stats.biggest_dsr_gain.date, event: d.stats.biggest_dsr_gain.event, tier: d.stats.biggest_dsr_gain.tier }) }),
    biggest_lpr_gain: board(drivers, null, { filter: (d) => d.stats.biggest_lpr_gain, map: (d) => ({ ...ref(d), value: d.stats.biggest_lpr_gain.value, date: d.stats.biggest_lpr_gain.date, event: d.stats.biggest_lpr_gain.event }) }),
    points_per_race: board(drivers, null, { filter: (d) => d.events_count >= MIN_STARTS, map: (d) => ({ ...ref(d), value: d.points_per_race }) }),
    most_consistent: board(drivers, null, { asc: true, filter: (d) => d.stats.consistency != null, map: (d) => ({ ...ref(d), value: d.stats.consistency }) }),
    hidden_gems: board(drivers, null, { filter: (d) => d.dsr_pos && d.lpr_pos && d.dsr_pos <= 50 && (d.lpr_pos - d.dsr_pos) >= 20, map: (d) => ({ ...ref(d), value: d.lpr_pos - d.dsr_pos, dsr: d.dsr, lpr_pos: d.lpr_pos, dsr_pos: d.dsr_pos }) }),
    giant_killer: board(drivers, null, { filter: (d) => d.stats.giant_kills > 0, map: (d) => ({ ...ref(d), value: d.stats.giant_kills }) })
  };

  // Per-Division (A/B/C) + Formate (Cup/3x3): Wins/Podien/Avg aus Races dieses Tiers
  const tierStats = {};
  for (const t of [...DIVISIONS, ...FORMATS]) tierStats[t] = new Map();
  for (const race of raceMap.values()) {
    const t = race.tier;
    if (!tierStats[t]) continue;
    for (const r of race.rows) {
      const m = tierStats[t];
      if (!m.has(r.driver)) m.set(r.driver, { driver: r.driver, wins: 0, podiums: 0, starts: 0, sumPos: 0, fin: 0 });
      const s = m.get(r.driver);
      s.starts++;
      if (r.position === 1) s.wins++;
      if (r.position >= 1 && r.position <= 3) s.podiums++;
      if (r.position >= 1) { s.sumPos += r.position; s.fin++; }
    }
  }
  const slugOf = new Map(drivers.map((d) => [d.driver, d.slug]));
  function tierBoards(t) {
    const arr = [...tierStats[t].values()].map((s) => ({
      slug: slugOf.get(s.driver), driver: s.driver,
      wins: s.wins, podiums: s.podiums, starts: s.starts,
      avg: s.fin ? round2(s.sumPos / s.fin) : null
    }));
    return {
      most_wins: arr.filter((a) => a.wins > 0).sort((a, b) => b.wins - a.wins).slice(0, TOP_N).map((a) => ({ slug: a.slug, driver: a.driver, value: a.wins })),
      most_podiums: arr.filter((a) => a.podiums > 0).sort((a, b) => b.podiums - a.podiums).slice(0, TOP_N).map((a) => ({ slug: a.slug, driver: a.driver, value: a.podiums })),
      best_avg_finish: arr.filter((a) => a.starts >= MIN_STARTS && a.avg != null).sort((a, b) => a.avg - b.avg).slice(0, TOP_N).map((a) => ({ slug: a.slug, driver: a.driver, value: a.avg }))
    };
  }
  const by_division = {};
  for (const t of DIVISIONS) by_division[t] = tierBoards(t);
  const by_format = {};
  for (const t of FORMATS) by_format[t] = tierBoards(t);

  return { overall, by_division, by_format };
}

// ---------- Events ----------
function buildEvents(raceMap, drivers) {
  const slugOf = new Map(drivers.map((d) => [d.driver, d.slug]));
  // nach (date|event) gruppieren
  const evMap = new Map();
  for (const race of raceMap.values()) {
    const key = `${race.date}|${race.event}`;
    if (!evMap.has(key)) evMap.set(key, { date: race.date, name: race.event, races: [] });
    evMap.get(key).races.push(race);
  }
  const index = [];
  const files = [];
  for (const ev of evMap.values()) {
    const id = `${ev.date}__${slugify(ev.name)}`;
    const participants = new Set();
    let bestGain = null;
    const races = [];
    let sofSum = 0, sofN = 0;
    for (const race of ev.races.sort((a, b) => tierRank(a.tier) - tierRank(b.tier))) {
      const rows = race.rows.slice().sort((a, b) => (a.position || 999) - (b.position || 999));
      const sof = rows.length ? round2(rows.reduce((s, r) => s + (r.dsrBefore ?? r.dsrAfter ?? 0), 0) / rows.length) : 0;
      sofSum += sof; sofN++;
      let raceBestGain = null, raceBestPos = null;
      const results = rows.map((r) => {
        const gain = round2((r.dsrAfter ?? 0) - (r.dsrBefore ?? r.dsrAfter ?? 0));
        if (!raceBestGain || gain > raceBestGain.value) raceBestGain = { slug: slugOf.get(r.driver), driver: r.driver, value: gain };
        if (!bestGain || gain > bestGain.value) bestGain = { slug: slugOf.get(r.driver), driver: r.driver, value: gain };
        participants.add(r.driver);
        return { pos: r.position, slug: slugOf.get(r.driver), driver: r.driver, points: round2(r.finalPts), dsr_gain: gain };
      });
      races.push({
        tier: race.tier, strength_of_field: sof,
        winner: results[0] ? { slug: results[0].slug, driver: results[0].driver } : null,
        podium: results.slice(0, 3),
        results,
        biggest_dsr_gain: raceBestGain
      });
    }
    const detail = { id, date: ev.date, name: ev.name, participants: participants.size, races };
    files.push({ id, data: detail });
    index.push({
      id, date: ev.date, name: ev.name, participants: participants.size,
      divisions: ev.races.map((r) => r.tier),
      strength_of_field: sofN ? round2(sofSum / sofN) : 0,
      top_dsr_gain: bestGain
    });
  }
  index.sort((a, b) => dayValue(b.date) - dayValue(a.date));
  return { index, files };
}
function tierRank(t) { const o = { A: 1, B: 2, C: 3, Cup: 4, '3x3': 5 }; return o[t] ?? 9; }

// ---------- Stats (liga-weit) ----------
function buildStats(events, drivers, raceMap, latestDate) {
  const eventKeys = new Set([...raceMap.values()].map((r) => `${r.date}|${r.event}`));
  // participants over time (pro Event)
  const evPart = new Map();
  for (const e of events) { const k = `${e.date}|${e.event}`; if (!evPart.has(k)) evPart.set(k, { date: e.date, name: e.event, set: new Set() }); evPart.get(k).set.add(e.driver); }
  const participants_over_time = [...evPart.values()]
    .map((x) => ({ date: x.date, name: x.name, participants: x.set.size }))
    .sort((a, b) => dayValue(a.date) - dayValue(b.date));

  // activity by month
  const months = new Map();
  for (const race of raceMap.values()) {
    const mo = race.date.slice(0, 7);
    if (!months.has(mo)) months.set(mo, { month: mo, races: 0, drivers: new Set() });
    const m = months.get(mo); m.races++; for (const r of race.rows) m.drivers.add(r.driver);
  }
  const activity_by_month = [...months.values()].map((m) => ({ month: m.month, races: m.races, active_drivers: m.drivers.size })).sort((a, b) => a.month < b.month ? -1 : 1);

  // division distribution (aktuelle Division A/B/C)
  const divCount = { A: 0, B: 0, C: 0 };
  for (const d of drivers) if (d.division.current && divCount[d.division.current] != null) divCount[d.division.current]++;
  const division_distribution = DIVISIONS.map((t) => ({ tier: t, drivers: divCount[t] }));

  // closest battles (aktuelles Ranking)
  const byLpr = drivers.filter((d) => d.lpr_pos).slice().sort((a, b) => a.lpr_pos - b.lpr_pos);
  const byDsr = drivers.filter((d) => d.dsr_pos).slice().sort((a, b) => a.dsr_pos - b.dsr_pos);
  const closest = (arr, key) => {
    const pairs = [];
    for (let i = 0; i < arr.length - 1; i++) pairs.push({ a: { slug: arr[i].slug, driver: arr[i].driver, value: arr[i][key] }, b: { slug: arr[i + 1].slug, driver: arr[i + 1].driver, value: arr[i + 1][key] }, gap: round2(arr[i][key] - arr[i + 1][key]) });
    return pairs.sort((x, y) => x.gap - y.gap).slice(0, 10);
  };

  // monthly recap (letzter Monat)
  const lastMonth = latestDate.slice(0, 7);
  const monthDrivers = new Map();
  let monthWins = new Map();
  for (const race of raceMap.values()) {
    if (race.date.slice(0, 7) !== lastMonth) continue;
    for (const r of race.rows) {
      monthDrivers.set(r.driver, (monthDrivers.get(r.driver) || 0) + 1);
      if (r.position === 1) monthWins.set(r.driver, (monthWins.get(r.driver) || 0) + 1);
    }
  }
  const slugOf = new Map(drivers.map((d) => [d.driver, d.slug]));
  const ref = (name) => ({ slug: slugOf.get(name), driver: name });
  // most improved dsr (heute vs ~30 Tage)
  const baseVal = minusDays(latestDate, 30);
  let mostImproved = null;
  for (const d of drivers) {
    let past = null, now = null;
    for (const h of d.history) { if (h_dayVal(h) <= baseVal) past = h.dsr; now = h.dsr; }
    if (past != null && now != null) { const imp = round2(now - past); if (!mostImproved || imp > mostImproved.value) mostImproved = { ...ref(d.driver), value: imp }; }
  }
  const topMap = (m) => { let best = null; for (const [k, v] of m) if (!best || v > best.value) best = { ...ref(k), value: v }; return best; };
  const newDrivers = drivers.filter((d) => d.first_seen.slice(0, 7) === lastMonth).map((d) => ref(d.driver));

  return {
    totals: { drivers: drivers.length, events: eventKeys.size, races: raceMap.size },
    participants_over_time,
    activity_by_month,
    division_distribution,
    closest_lpr_battles: closest(byLpr, 'lpr'),
    closest_dsr_battles: closest(byDsr, 'dsr'),
    monthly_recap: {
      month: lastMonth,
      most_improved_dsr: mostImproved,
      most_active: topMap(monthDrivers),
      most_wins: topMap(monthWins),
      new_drivers: newDrivers
    }
  };
}
function h_dayVal(h) { return dayValue(h.date); }

// ---------- Hall of Fame ----------
function buildHallOfFame(drivers, leaderboards) {
  const top = (arr) => arr[0] || null;
  // best rookie debut: hoechstes DSR innerhalb der ersten 5 Rennen
  let bestRookie = null;
  for (const d of drivers) {
    const first5 = d.history.slice(0, 5);
    const peak = Math.max(...first5.map((h) => h.dsr));
    if (!bestRookie || peak > bestRookie.value) bestRookie = { slug: d.slug, driver: d.driver, value: round2(peak) };
  }
  const division_a_club = drivers.filter((d) => d._reachedA).map((d) => ({ slug: d.slug, driver: d.driver }));
  return {
    highest_dsr_ever: top(leaderboards.overall.highest_dsr_ever),
    highest_lpr_ever: top(leaderboards.overall.highest_lpr_ever),
    most_wins: top(leaderboards.overall.most_wins),
    most_podiums: top(leaderboards.overall.most_podiums),
    most_starts: top(leaderboards.overall.most_starts),
    biggest_single_race_gain: top(leaderboards.overall.biggest_dsr_jump),
    best_rookie_debut: bestRookie,
    division_a_club
  };
}

// ---------- main ----------
async function main() {
  mkdirSync(DRIVERS_DIR, { recursive: true });
  mkdirSync(EVENTS_DIR, { recursive: true });

  const events = await loadEvents();
  console.log(`[DATA] ${events.length} Events, ${new Set(events.map(e => e.driver)).size} Fahrer.`);

  const reconstructed = reconstructSnapshots(events);
  const { merged, added, seeded } = mergePublished(reconstructed);
  console.log(`[DATA] Published History: ${seeded ? 'SEED' : 'append'} +${added}, gesamt ${merged.length}.`);

  const { drivers, raceMap, latestDate } = buildAll(events, merged);
  const leaderboards = buildLeaderboards(drivers, raceMap);
  const { index: eventIndex, files: eventFiles } = buildEvents(raceMap, drivers);
  const stats = buildStats(events, drivers, raceMap, latestDate);
  const halloffame = buildHallOfFame(drivers, leaderboards);

  // Driver-Dateien neu schreiben
  for (const f of readdirSync(DRIVERS_DIR)) if (f.endsWith('.json')) rmSync(join(DRIVERS_DIR, f));
  for (const d of drivers) {
    const { _reachedA, ...rest } = d;
    writeFileSync(join(DRIVERS_DIR, d.slug + '.json'), JSON.stringify(rest));
  }
  // Event-Dateien neu schreiben
  for (const f of readdirSync(EVENTS_DIR)) if (f.endsWith('.json')) rmSync(join(EVENTS_DIR, f));
  for (const ef of eventFiles) writeFileSync(join(EVENTS_DIR, ef.id + '.json'), JSON.stringify(ef.data));

  // Index- / Aggregat-Dateien
  const index = drivers.map((d) => ({
    driver: d.driver, slug: d.slug, lpr: d.lpr, dsr: d.dsr, lpr_pos: d.lpr_pos, dsr_pos: d.dsr_pos,
    lpr_trend: d.lpr_trend, dsr_trend: d.dsr_trend, events: d.events_count, first_seen: d.first_seen,
    points_per_race: d.points_per_race, division: d.division.current, badges: d.badges
  })).sort((a, b) => (a.lpr_pos || 9999) - (b.lpr_pos || 9999));

  const now = new Date().toISOString();
  writeFileSync(PUBLISHED_FILE, JSON.stringify(merged));
  writeFileSync(join(DATA_DIR, 'drivers-index.json'), JSON.stringify(index));
  writeFileSync(join(DATA_DIR, 'current-ranking.json'), JSON.stringify({ generated_at: now, latest_cutoff: merged[merged.length - 1].cutoff, drivers: index }));
  writeFileSync(join(DATA_DIR, 'leaderboards.json'), JSON.stringify({ generated_at: now, ...leaderboards }));
  writeFileSync(join(DATA_DIR, 'events.json'), JSON.stringify({ generated_at: now, events: eventIndex }));
  writeFileSync(join(DATA_DIR, 'stats.json'), JSON.stringify({ generated_at: now, ...stats }));
  writeFileSync(join(DATA_DIR, 'halloffame.json'), JSON.stringify({ generated_at: now, ...halloffame }));
  writeFileSync(join(DATA_DIR, 'meta.json'), JSON.stringify({
    generated_at: now, driver_count: index.length, event_count: events.length,
    events: stats.totals.events, races: stats.totals.races, cutoff_count: merged.length,
    latest_cutoff: merged[merged.length - 1].cutoff
  }, null, 2));

  console.log(`[DATA] geschrieben: ${drivers.length} Fahrer, ${eventFiles.length} Events, leaderboards, stats, halloffame.`);
}

main().catch((e) => { console.error('FATAL: ' + (e.stack || e)); process.exit(1); });
