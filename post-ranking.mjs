// =====================================================
// Simracing-Ranking -> Discord (GitHub-Actions-Runner)
//
// Liest das veroeffentlichte Ranking-Tab als CSV, berechnet die
// Deltas (Pfeile, NEW entries, Biggest Gains) gegen snapshot.json
// und postet das Ranking nach Discord -- von GitHubs eigener IP,
// daher KEIN Cloudflare-1015-Problem mehr.
//
// Das Ausgabeformat ist identisch zum bisherigen Apps Script.
// Es braucht KEINE npm-Pakete (Node 20 hat fetch eingebaut).
//
// Erwartete Umgebungsvariablen (als GitHub-Secrets gesetzt):
//   SHEET_CSV_URL   = CSV-Export-URL des Ranking-Tabs
//   DISCORD_WEBHOOK = Webhook des Ziel-Channels
// =====================================================

import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const CSV_URL = process.env.SHEET_CSV_URL;
const WEBHOOK = process.env.DISCORD_WEBHOOK;
const SNAPSHOT_FILE = 'snapshot.json';

const TOP_LIMIT = 100;
const BLOCK_SIZE = 50;
const INTER_MESSAGE_DELAY_MS = 1500;
const TIMEZONE = 'Europe/Vienna';
const WEBAPP_URL = 'https://theracingclub.online/';
const POINTS_ALLOCATION_LINK =
  'https://discord.com/channels/1366444766484627456/1456377967562330245';

if (!CSV_URL || !WEBHOOK) {
  console.error('FEHLER: SHEET_CSV_URL und DISCORD_WEBHOOK muessen als Secrets gesetzt sein.');
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// "1192,9" (deutsches Komma) ODER "1192.9" -> Zahl
function parseNum(raw) {
  if (raw == null) return 0;
  let s = String(raw).trim().replace(/^"|"$/g, '').trim();
  if (s === '') return 0;
  if (s.indexOf(',') !== -1 && s.indexOf('.') === -1) s = s.replace(',', '.');
  const n = Number(s);
  return isNaN(n) ? 0 : n;
}

// Minimaler CSV-Parser (Anfuehrungszeichen + Zeilenumbrueche in Feldern)
function parseCSV(text) {
  const rows = [];
  let row = [], field = '', inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ',') { row.push(field); field = ''; }
      else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
      else if (c === '\r') { /* ignorieren */ }
      else field += c;
    }
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

function todayStr() {
  const parts = new Intl.DateTimeFormat('de-AT', {
    timeZone: TIMEZONE, day: '2-digit', month: '2-digit', year: 'numeric'
  }).formatToParts(new Date());
  const get = (t) => parts.find((p) => p.type === t).value;
  return `${get('day')}.${get('month')}.${get('year')}`;
}

async function fetchRanking() {
  const res = await fetch(CSV_URL);
  if (!res.ok) throw new Error('CSV-Abruf fehlgeschlagen: HTTP ' + res.status);
  const text = await res.text();
  const rows = parseCSV(text);
  if (rows.length < 2) throw new Error('CSV enthaelt keine Datenzeilen.');

  const header = rows[0].map((h) => h.trim());
  const idx = (name) => header.indexOf(name);
  const iDriver = idx('Driver');
  const iLpr = idx('Ongoing_Rating');
  const iDsr = idx('LastRating');
  if (iDriver === -1 || iLpr === -1 || iDsr === -1) {
    throw new Error('Spalten Driver/Ongoing_Rating/LastRating nicht gefunden. Header: ' + header.join(', '));
  }

  const data = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const driver = (row[iDriver] || '').trim();
    if (!driver) continue;
    data.push({
      Driver: driver,
      Ongoing_Rating: parseNum(row[iLpr]),
      LastRating: parseNum(row[iDsr])
    });
  }
  return data;
}

function loadSnapshot() {
  if (!existsSync(SNAPSHOT_FILE)) return {};
  try {
    const arr = JSON.parse(readFileSync(SNAPSHOT_FILE, 'utf8'));
    const map = {};
    arr.forEach((item) => {
      if (!item || !item.Driver) return;
      map[item.Driver] = {
        lprPos: Number(item.lprPos || item.position || 0),
        dsrPos: Number(item.dsrPos || 0),
        lpr: Number(item.lpr || 0),
        dsr: Number(item.dsr || 0)
      };
    });
    return map;
  } catch (e) {
    console.warn('Snapshot nicht lesbar, starte ohne: ' + e);
    return {};
  }
}

function buildLines(list, useLprPositions, prevByName) {
  const lines = [];
  for (let i = 0; i < list.length; i++) {
    const r = list[i];
    const place = i + 1;
    const name = r.Driver;
    const lprStr = String(Math.round(r.Ongoing_Rating || 0));
    const dsrStr = String(Math.round(r.LastRating || 0));

    let prevStr = 'N';
    const prev = prevByName[name];
    if (prev) {
      const prevPos = useLprPositions ? prev.lprPos : prev.dsrPos;
      if (prevPos) {
        let arrow = '→'; // →
        if (prevPos > place) arrow = '↑'; // ↑
        else if (prevPos < place) arrow = '↓'; // ↓
        prevStr = String(prevPos) + arrow;
      }
    }
    prevStr = prevStr.padStart(4, ' ');
    const placeStr = String(place).padStart(2, ' ');
    lines.push(placeStr + ' (' + prevStr + ') ' + name + ' ' + lprStr + ' / ' + dsrStr);
  }
  return lines;
}

function buildBlock(lines, start, end) {
  const part = lines.slice(start, end);
  if (!part.length) return '';
  return '```text\n' + part.map((l) => l + '\n').join('') + '```';
}

async function sendMessage(content, label) {
  const maxAttempts = 6;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let res;
    try {
      res = await fetch(WEBHOOK, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content })
      });
    } catch (e) {
      const w = Math.min(4000 * 2 ** (attempt - 1), 30000);
      console.log(`[SEND] "${label}" Netzwerkfehler Versuch ${attempt}: ${e}. Warte ${w}ms`);
      await sleep(w);
      continue;
    }

    if (res.status >= 200 && res.status < 300) {
      console.log(`[SEND] "${label}" OK (HTTP ${res.status}) nach Versuch ${attempt} | ${content.length} Zeichen`);
      return true;
    }

    if (res.status === 429) {
      let waitMs = 0;
      const ra = res.headers.get('retry-after');
      if (ra) waitMs = Math.ceil(Number(ra) * 1000) + 500;
      if (!waitMs) {
        try {
          const j = await res.clone().json();
          if (j && j.retry_after) waitMs = Math.ceil(Number(j.retry_after) * 1000) + 500;
        } catch { /* ignore */ }
      }
      if (!waitMs) waitMs = Math.min(4000 * 2 ** (attempt - 1), 30000);
      const body = await res.text().catch(() => '');
      console.log(`[SEND] "${label}" 429 Versuch ${attempt} -> warte ${waitMs}ms | ${body.slice(0, 120)}`);
      await sleep(waitMs);
      continue;
    }

    const body = await res.text().catch(() => '');
    console.error(`[SEND] "${label}" FEHLER HTTP ${res.status}: ${body.slice(0, 300)}`);
    return false;
  }
  console.error(`[SEND] "${label}" nach ${maxAttempts} Versuchen aufgegeben.`);
  return false;
}

async function main() {
  const dateStr = todayStr();
  const rankingData = await fetchRanking();
  console.log(`[INFO] ${rankingData.length} Fahrer aus CSV gelesen. Datum ${dateStr}`);

  const prevByName = loadSnapshot();
  console.log(`[INFO] Snapshot-Eintraege: ${Object.keys(prevByName).length}`);

  const lprList = rankingData.slice().sort((a, b) => (b.Ongoing_Rating || 0) - (a.Ongoing_Rating || 0));
  const dsrList = rankingData.slice().sort((a, b) => (b.LastRating || 0) - (a.LastRating || 0));
  const lprTop = lprList.slice(0, TOP_LIMIT);
  const dsrTop = dsrList.slice(0, TOP_LIMIT);

  const newEntries = lprList.filter((r) => !prevByName[r.Driver]).map((r) => r.Driver);

  let bestLpr = null, bestDsr = null, bestPos = null;
  lprList.forEach((r, idx) => {
    const prev = prevByName[r.Driver];
    if (!prev) return;
    const currentPos = idx + 1;
    const lprGain = (r.Ongoing_Rating || 0) - (prev.lpr || 0);
    const dsrGain = (r.LastRating || 0) - (prev.dsr || 0);
    const posGain = (prev.lprPos || currentPos) - currentPos;
    if (lprGain > 0 && (!bestLpr || lprGain > bestLpr.gain)) bestLpr = { name: r.Driver, gain: lprGain };
    if (dsrGain > 0 && (!bestDsr || dsrGain > bestDsr.gain)) bestDsr = { name: r.Driver, gain: dsrGain };
    if (posGain > 0 && (!bestPos || posGain > bestPos.gain)) bestPos = { name: r.Driver, gain: posGain };
  });

  // ---------- Nachrichten bauen (identisches Format) ----------
  const messages = [];

  let headerLPR = '# 🏁 Ranked by LPR - Top 100 🏁\n';
  headerLPR += 'date: ' + dateStr + '\n';
  headerLPR += '🌐 **Full ranking, driver profiles & history charts:** ' + WEBAPP_URL + '\n\n';
  headerLPR += '📈 Biggest LPR Gain: ' +
    (bestLpr ? `${bestLpr.name} (+${Math.round(bestLpr.gain)})` : '— (no changes since last update)') + '\n';
  headerLPR += '⚡ Biggest DSR Gain: ' +
    (bestDsr ? `${bestDsr.name} (+${Math.round(bestDsr.gain)})` : '— (no changes since last update)') + '\n';
  headerLPR += '🚀 Biggest Position-Climber: ' +
    (bestPos ? `${bestPos.name} (+${bestPos.gain} positions)` : '— (no position changes)') + '\n\n';
  headerLPR += '**NEW entries this update**\n';
  if (newEntries.length) {
    // Schutz gegen das 2000-Zeichen-Limit: bei sehr vielen Neuzugaengen
    // (z. B. allererster Lauf mit leerem Snapshot) nur die ersten N listen.
    const NEW_ENTRIES_DISPLAY_LIMIT = 30;
    const shown = newEntries.slice(0, NEW_ENTRIES_DISPLAY_LIMIT);
    shown.forEach((n) => { headerLPR += '• ' + n + '\n'; });
    const rest = newEntries.length - shown.length;
    if (rest > 0) headerLPR += `• … und ${rest} weitere\n`;
  } else {
    headerLPR += '• None\n';
  }
  headerLPR += '\n';
  headerLPR += '-# LPR = League Performance Rating\n';
  headerLPR += '-# DSR = Driver Skill Rating\n';
  headerLPR += '-# Format: Drivername LPR / DSR\n';
  headerLPR += '-# Example: fakename 250 / 1095 = LPR 250 / DSR 1095\n';
  headerLPR += '-# [points allocation](' + POINTS_ALLOCATION_LINK + ')\n';
  messages.push({ label: 'LPR Header', content: headerLPR });

  const lprLines = buildLines(lprTop, true, prevByName);
  const lb1 = buildBlock(lprLines, 0, BLOCK_SIZE);
  if (lb1) messages.push({ label: 'LPR 1-50', content: lb1 });
  const lb2 = buildBlock(lprLines, BLOCK_SIZE, TOP_LIMIT);
  if (lb2) messages.push({ label: 'LPR 51-100', content: lb2 });

  let headerDSR = '\n# 🏁 Ranked by DSR - Top 100 🏁\n';
  headerDSR += 'date: ' + dateStr + '\n';
  messages.push({ label: 'DSR Header', content: headerDSR });

  const dsrLines = buildLines(dsrTop, false, prevByName);
  const db1 = buildBlock(dsrLines, 0, BLOCK_SIZE);
  if (db1) messages.push({ label: 'DSR 1-50', content: db1 });
  const db2 = buildBlock(dsrLines, BLOCK_SIZE, TOP_LIMIT);
  if (db2) messages.push({ label: 'DSR 51-100', content: db2 });

  console.log(`[PLAN] ${messages.length} Nachrichten:`);
  messages.forEach((m, i) => console.log(`  [${i + 1}] ${m.label} = ${m.content.length} Zeichen`));

  // ---------- Senden ----------
  let allOk = true;
  for (let i = 0; i < messages.length; i++) {
    if (i > 0) await sleep(INTER_MESSAGE_DELAY_MS);
    const ok = await sendMessage(messages[i].content, messages[i].label);
    if (!ok) allOk = false;
  }

  if (!allOk) {
    console.error('[RESULT] Mindestens eine Nachricht fehlgeschlagen. Snapshot wird NICHT aktualisiert.');
    process.exit(1);
  }

  // ---------- Snapshot speichern (nur bei vollem Erfolg) ----------
  const dsrPos = {};
  dsrList.forEach((r, idx) => { dsrPos[r.Driver] = idx + 1; });
  const snapshot = lprList.map((r, idx) => ({
    Driver: r.Driver,
    lprPos: idx + 1,
    dsrPos: dsrPos[r.Driver] || 0,
    lpr: r.Ongoing_Rating || 0,
    dsr: r.LastRating || 0
  }));
  writeFileSync(SNAPSHOT_FILE, JSON.stringify(snapshot, null, 2));
  console.log(`[RESULT] Alle Nachrichten gesendet. Snapshot aktualisiert (${snapshot.length} Eintraege).`);
}

main().catch((e) => { console.error('FATAL: ' + (e.stack || e)); process.exit(1); });
