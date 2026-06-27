// Gemeinsame Bausteine für alle Seiten: Navigation, Glossar (englische
// Kurzerklärungen je Kennzahl), Badge-Definitionen und kleine Helfer.
(function () {
  // ---- Englische Kurz-Erklärungen je Kennzahl ----
  const GLOSSARY = {
    lpr: 'League Performance Rating — the sum of your points from the last 12 months. Rewards staying active; it fades if you stop racing.',
    dsr: 'Driver Skill Rating — an Elo-style rating that rises when you beat the field and falls when you don’t. Reflects pure skill, regardless of how often you race.',
    trend: 'Position change since the previous race day (▲ up / ▼ down).',
    wins: 'Race wins (1st place finishes).',
    podiums: 'Top-3 finishes.',
    top5: 'Top-5 finishes.',
    best_finish: 'Best finishing position ever achieved.',
    avg_finish: 'Average finishing position across all races (lower is better).',
    points_per_race: 'LPR divided by races entered — a measure of scoring efficiency.',
    recent_form: 'Your last 5 finishing positions, newest first.',
    consistency: 'Standard deviation of your finishing positions — lower means steadier results (min. 5 races).',
    giant_killer: 'How often a driver finished ahead of a higher-rated opponent in the same race.',
    strength_of_field: 'Average DSR of the drivers entering a race — higher means a tougher field.',
    hidden_gems: 'High skill (good DSR rank) but low activity (poor LPR rank) — underrated drivers who don’t race often.',
    biggest_dsr_jump: 'Largest DSR gained in a single race.',
    biggest_lpr_gain: 'Largest LPR gained in a single race.',
    most_consistent: 'Steadiest finishers — smallest spread of finishing positions (min. 5 races).',
    best_avg_finish: 'Best average finishing position (min. 5 races).',
    most_starts: 'Most races entered.',
    most_wins: 'Most race wins. The division shown is the driver’s current division.',
    most_podiums: 'Most top-3 finishes.',
    most_top5: 'Most top-5 finishes.',
    highest_dsr_ever: 'Highest DSR a driver has ever reached.',
    highest_lpr_ever: 'Highest LPR a driver has ever reached.',
    division: 'Strength division from Championship races: A (strongest), B, then C. Cup and 3x3 are separate formats, not part of the A/B/C ladder.',
    closest_battles: 'Pairs of drivers separated by the smallest rating gap right now.',
    participants_over_time: 'Number of unique drivers in each event over time.',
    activity_by_month: 'Races held and unique active drivers per month.',
    division_distribution: 'How many drivers currently sit in each strength division (A/B/C).',
    most_improved_dsr: 'Biggest DSR gain over the last ~30 days.',
    most_active: 'Most races entered this month.',
    best_rookie_debut: 'Highest DSR reached within a driver’s first 5 races.',
    division_a_club: 'Every driver who has raced in Division A, the top tier.',
    scatter: 'Each dot is a driver: activity (LPR) on the x-axis, skill (DSR) on the y-axis. Top-right = active and skilled; top-left = skilled but races rarely.'
  };

  const BADGES = {
    iron_man: { label: 'Iron Man', desc: '50+ races entered.' },
    giant_killer: { label: 'Giant Killer', desc: '20+ finishes ahead of higher-rated drivers.' },
    division_a: { label: 'Division A', desc: 'Has raced in the top division.' },
    race_winner: { label: 'Race Winner', desc: 'Has won at least one race.' },
    metronome: { label: 'Metronome', desc: 'Highly consistent finisher (σ ≤ 2.5).' },
    veteran: { label: 'Veteran', desc: 'Racing in the league for 6+ months.' }
  };

  const NAV = [
    { href: 'index.html', label: 'Ranking' },
    { href: 'leaderboards.html', label: 'Leaderboards' },
    { href: 'events.html', label: 'Events' },
    { href: 'stats.html', label: 'Stats' },
    { href: 'halloffame.html', label: 'Hall of Fame' }
  ];

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function fmt(n, dec) {
    if (n == null) return '–';
    return Number(n).toLocaleString('en-US', { maximumFractionDigits: dec == null ? 1 : dec });
  }
  function info(key, text) {
    const t = text || GLOSSARY[key] || '';
    return t ? `<p class="info">${escapeHtml(t)}</p>` : '';
  }
  function driverLink(slug, driver) {
    return `<a href="driver.html?d=${encodeURIComponent(slug)}">${escapeHtml(driver)}</a>`;
  }

  function renderNav() {
    const here = location.pathname.split('/').pop() || 'index.html';
    const links = NAV.map((n) => {
      const active = (here === n.href) ? ' class="active"' : '';
      return `<a href="${n.href}"${active}>${n.label}</a>`;
    }).join('');
    const el = document.getElementById('site-nav');
    if (el) el.innerHTML = `<div class="wrap nav-inner"><a class="brand" href="index.html">TRC<span class="accent">rating</span></a><nav>${links}</nav></div>`;
  }

  // Großes Club-Logo oben rechts in den Seitenkopf setzen (auf jeder Seite)
  function placeHeaderLogo() {
    const header = document.querySelector('.site-header, .page-head');
    if (!header) return;
    const container = header.classList.contains('wrap') ? header : (header.querySelector('.wrap') || header);
    container.style.position = 'relative';
    const a = document.createElement('a');
    a.href = 'index.html';
    a.className = 'header-logo';
    a.setAttribute('aria-label', 'The Racing Club');
    a.innerHTML = '<img src="assets/logo.svg" alt="The Racing Club" />';
    container.appendChild(a);
  }

  document.addEventListener('DOMContentLoaded', () => { renderNav(); placeHeaderLogo(); });

  window.TRC = { GLOSSARY, BADGES, escapeHtml, fmt, info, driverLink };
})();
