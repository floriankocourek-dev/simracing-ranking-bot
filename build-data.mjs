// =====================================================
// Daten-Builder fuer die TRCrating-Webapp (Phase 1)
//
// Liest das gesamte Events-Sheet (operative Wahrheit) und erzeugt
// die fertigen JSON-Exporte, die die Webapp nur noch rendert.
//
// WICHTIG (Single-Engine-Prinzip):
//   - DSR wird NICHT nachgerechnet, sondern aus 'Rating_after' gelesen
//     (vom Apps Script materialisiert).
//   - LPR ist eine rollierende 12-Monats-Summe von FINAL_POINTS,
//     bewusst zeitabhaengig (inaktive Fahrer rutschen zurueck).
//
// Published vs. Recalculated History (Konzept 4.2):
//   - published-history.json ist EINGEFROREN: bestehende Cutoffs
//     bleiben unveraendert, es werden nur neue Renntage angehaengt
//     (Dedup ueber das Cutoff-Datum). So bleiben veroeffentlichte
//     Staende stabil, falls sich Regeln je aendern.
//
// Erzeugt unter docs/data/:
//   meta.json, current-ranking.json, drivers-index.json,
//   drivers/<slug>.json, published-history.json
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
const PUBLISHED_FILE = join(DATA_DIR, 'published-history.json');

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
  let row = [], field = '', inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQuotes = false; }
      else field += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ',') { row.push(field); field = ''; }
      else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
      else if (c === '\r') { /* skip */ }
      else field += c;
    }
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

// "2025-10-14" -> vergleichbarer UTC-Wert
function dayValue(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}
// Cutoff minus 12 Monate (gleiche Logik wie Apps Script: setFullYear-1, >=)
function minus12mo(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return Date.UTC(y - 1, m - 1, d);
}

function slugify(name) {
  let s = name.toLowerCase()
    .replace(/[äàá]/g, 'a').replace(/[öòó]/g, 'o').replace(/[üùú]/g, 'u').replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return s || 'driver';
}

function round2(n) { return Math.round(n * 100) / 100; }

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
    iAfter = ix('Rating_after');
  if ([iDate, iDriver, iFinal, iAfter].some((x) => x === -1)) {
    throw new Error('Erwartete Spalten nicht gefunden. Header: ' + header.join(', '));
  }

  const events = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const date = (row[iDate] || '').trim();
    const driver = (row[iDriver] || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !driver) continue;
    events.push({
      date,
      dayVal: dayValue(date),
      event: (row[iEvent] || '').trim(),
      tier: (row[iTier] || '').trim(),
      driver,
      position: parseNum(row[iPos]),
      finalPts: parseNum(row[iFinal]),
      dsrAfter: parseNum(row[iAfter])
    });
  }
  // Chronologisch sortieren (stabil bei gleichem Tag)
  events.forEach((e, i) => { e._i = i; });
  events.sort((a, b) => (a.dayVal - b.dayVal) || (a._i - b._i));
  return events;
}

// ---------- Liga-weite Snapshots pro Cutoff rekonstruieren ----------
function reconstructSnapshots(events) {
  const byDriver = new Map(); // driver -> [{dayVal, finalPts, dsrAfter, date}]
  for (const e of events) {
    if (!byDriver.has(e.driver)) byDriver.set(e.driver, []);
    byDriver.get(e.driver).push(e);
  }

  const cutoffs = [...new Set(events.map((e) => e.date))].sort((a, b) => dayValue(a) - dayValue(b));

  const snapshots = [];
  for (const cut of cutoffs) {
    const cutVal = dayValue(cut);
    const winStart = minus12mo(cut);
    const standings = [];
    for (const [driver, list] of byDriver) {
      // nur Fahrer, die bis zum Cutoff schon gefahren sind
      if (list[0].dayVal > cutVal) continue;
      let dsr = null, lpr = 0;
      for (const e of list) {
        if (e.dayVal > cutVal) break;
        dsr = e.dsrAfter;                 // letztes Rating_after <= Cutoff
        if (e.dayVal >= winStart) lpr += e.finalPts; // rollierendes Fenster
      }
      standings.push({ d: driver, lpr: round2(lpr), dsr: round2(dsr) });
    }
    // Positionen
    const byLpr = [...standings].sort((a, b) => b.lpr - a.lpr || b.dsr - a.dsr);
    byLpr.forEach((s, i) => { s.lp = i + 1; });
    const byDsr = [...standings].sort((a, b) => b.dsr - a.dsr || b.lpr - a.lpr);
    const dsrPos = new Map(byDsr.map((s, i) => [s.d, i + 1]));
    standings.forEach((s) => { s.dp = dsrPos.get(s.d); });
    snapshots.push({ cutoff: cut, drivers: standings });
  }
  return snapshots;
}

// ---------- Published History einfrieren + anhaengen ----------
function mergePublished(reconstructed) {
  let existing = [];
  if (existsSync(PUBLISHED_FILE)) {
    try { existing = JSON.parse(readFileSync(PUBLISHED_FILE, 'utf8')); } catch { existing = []; }
  }
  if (!Array.isArray(existing) || existing.length === 0) {
    // Erst-Backfill: komplette Rekonstruktion einfrieren
    return { merged: reconstructed, added: reconstructed.length, seeded: true };
  }
  // Bestehende Cutoffs bleiben UNVERAENDERT; nur neuere anhaengen (Dedup ueber Cutoff)
  const known = new Set(existing.map((s) => s.cutoff));
  const maxKnown = existing.reduce((m, s) => Math.max(m, dayValue(s.cutoff)), 0);
  const additions = reconstructed.filter((s) => !known.has(s.cutoff) && dayValue(s.cutoff) > maxKnown);
  return { merged: existing.concat(additions), added: additions.length, seeded: false };
}

// ---------- Pro-Fahrer-Detail + Index aus Events ----------
function buildDriverData(events, published) {
  const byDriver = new Map();
  for (const e of events) {
    if (!byDriver.has(e.driver)) byDriver.set(e.driver, []);
    byDriver.get(e.driver).push(e);
  }

  // Beste je erreichte Positionen aus der Published History
  const bestPos = new Map(); // driver -> {bestLp, bestDp}
  for (const snap of published) {
    for (const s of snap.drivers) {
      const cur = bestPos.get(s.d) || { bestLp: Infinity, bestDp: Infinity };
      if (s.lp < cur.bestLp) cur.bestLp = s.lp;
      if (s.dp < cur.bestDp) cur.bestDp = s.dp;
      bestPos.set(s.d, cur);
    }
  }

  // aktuelle Standings = letzter Snapshot; Trend = vorletzter
  const latest = published[published.length - 1];
  const prev = published.length > 1 ? published[published.length - 2] : null;
  const prevPos = new Map();
  if (prev) for (const s of prev.drivers) prevPos.set(s.d, { lp: s.lp, dp: s.dp });
  const curByDriver = new Map(latest.drivers.map((s) => [s.d, s]));

  // eindeutige Slugs
  const slugUsed = new Map();
  const slugFor = (name) => {
    let base = slugify(name), s = base, n = 2;
    while (slugUsed.has(s) && slugUsed.get(s) !== name) { s = `${base}-${n++}`; }
    slugUsed.set(s, name);
    return s;
  };

  const index = [];
  const driverFiles = [];

  for (const [driver, list] of byDriver) {
    const slug = slugFor(driver);
    const cur = curByDriver.get(driver) || { lpr: 0, dsr: list[list.length - 1].dsrAfter, lp: null, dp: null };
    const bp = bestPos.get(driver) || { bestLp: null, bestDp: null };
    const pv = prevPos.get(driver);

    // pro-Event-Historie mit rollierendem LPR
    const history = [];
    let bestDsr = -Infinity, bestLpr = -Infinity;
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      const winStart = minus12mo(e.date);
      let lpr = 0;
      for (let j = 0; j <= i; j++) {
        if (list[j].dayVal >= winStart) lpr += list[j].finalPts;
      }
      lpr = round2(lpr);
      if (e.dsrAfter > bestDsr) bestDsr = e.dsrAfter;
      if (lpr > bestLpr) bestLpr = lpr;
      history.push({
        date: e.date, event: e.event, tier: e.tier,
        position: e.position, final_points: round2(e.finalPts),
        dsr: round2(e.dsrAfter), lpr
      });
    }

    const lprTrend = pv ? (pv.lp - cur.lp) : 0; // positiv = aufgestiegen
    const dsrTrend = pv ? (pv.dp - cur.dp) : 0;

    index.push({
      driver, slug,
      lpr: cur.lpr, dsr: cur.dsr,
      lpr_pos: cur.lp, dsr_pos: cur.dp,
      lpr_trend: lprTrend, dsr_trend: dsrTrend,
      events: list.length, first_seen: list[0].date
    });

    driverFiles.push({
      slug,
      data: {
        driver, slug,
        first_seen: list[0].date,
        events_count: list.length,
        current: { lpr: cur.lpr, dsr: cur.dsr, lpr_pos: cur.lp, dsr_pos: cur.dp },
        bests: {
          best_dsr: round2(bestDsr), best_lpr: round2(bestLpr),
          best_lpr_pos: bp.bestLp === Infinity ? null : bp.bestLp,
          best_dsr_pos: bp.bestDp === Infinity ? null : bp.bestDp
        },
        history
      }
    });
  }

  index.sort((a, b) => (a.lpr_pos || 9999) - (b.lpr_pos || 9999));
  return { index, driverFiles };
}

// ---------- main ----------
async function main() {
  mkdirSync(DRIVERS_DIR, { recursive: true });

  const events = await loadEvents();
  const drivers = new Set(events.map((e) => e.driver));
  console.log(`[DATA] ${events.length} Events, ${drivers.size} Fahrer geladen.`);

  const reconstructed = reconstructSnapshots(events);
  console.log(`[DATA] ${reconstructed.length} Cutoffs rekonstruiert (${reconstructed[0].cutoff} … ${reconstructed[reconstructed.length - 1].cutoff}).`);

  const { merged, added, seeded } = mergePublished(reconstructed);
  console.log(`[DATA] Published History: ${seeded ? 'SEED (Backfill)' : 'append'} – ${added} neue Cutoffs, gesamt ${merged.length}.`);

  const { index, driverFiles } = buildDriverData(events, merged);

  // Alte Driver-Dateien wegraeumen (saubere Neu-Erzeugung)
  if (existsSync(DRIVERS_DIR)) {
    for (const f of readdirSync(DRIVERS_DIR)) {
      if (f.endsWith('.json')) rmSync(join(DRIVERS_DIR, f));
    }
  }
  for (const df of driverFiles) {
    writeFileSync(join(DRIVERS_DIR, df.slug + '.json'), JSON.stringify(df.data));
  }

  writeFileSync(PUBLISHED_FILE, JSON.stringify(merged));
  writeFileSync(join(DATA_DIR, 'drivers-index.json'), JSON.stringify(index));
  writeFileSync(join(DATA_DIR, 'current-ranking.json'), JSON.stringify({
    generated_at: new Date().toISOString(),
    latest_cutoff: merged[merged.length - 1].cutoff,
    drivers: index
  }));
  writeFileSync(join(DATA_DIR, 'meta.json'), JSON.stringify({
    generated_at: new Date().toISOString(),
    driver_count: index.length,
    event_count: events.length,
    cutoff_count: merged.length,
    latest_cutoff: merged[merged.length - 1].cutoff
  }, null, 2));

  console.log(`[DATA] Geschrieben: ${driverFiles.length} Fahrer-Dateien, drivers-index, current-ranking, published-history, meta.`);
}

main().catch((e) => { console.error('FATAL: ' + (e.stack || e)); process.exit(1); });
