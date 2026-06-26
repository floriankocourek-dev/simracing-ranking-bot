// Leaderboards: overall + per-Division (A/B/C) + per-Format (Cup/3x3).
(function () {
  const { fmt, escapeHtml, info, driverLink, GLOSSARY } = window.TRC;
  const scopeEl = document.getElementById('scope');
  const grid = document.getElementById('grid');
  let data = null, scope = 'overall';

  // Titel + Erklärung + Wert-Formatierung je Liste
  const META = {
    most_starts:      { title: 'Most Starts', dec: 0 },
    most_wins:        { title: 'Most Wins', dec: 0, division: true },
    most_podiums:     { title: 'Most Podiums', dec: 0 },
    most_top5:        { title: 'Most Top 5', dec: 0 },
    best_avg_finish:  { title: 'Best Average Finish', dec: 2 },
    highest_dsr_ever: { title: 'Highest DSR Ever', dec: 0 },
    highest_lpr_ever: { title: 'Highest LPR Ever', dec: 0 },
    biggest_dsr_jump: { title: 'Biggest DSR Jump', dec: 1, plus: true, ctx: true },
    biggest_lpr_gain: { title: 'Biggest LPR Gain', dec: 1, plus: true, ctx: true },
    points_per_race:  { title: 'Points per Race', dec: 2 },
    most_consistent:  { title: 'Most Consistent', dec: 2 },
    hidden_gems:      { title: 'Hidden Gems', special: 'gems' },
    giant_killer:     { title: 'Giant Killer', dec: 0 }
  };
  const OVERALL_ORDER = ['most_wins', 'most_podiums', 'most_top5', 'most_starts', 'best_avg_finish', 'most_consistent', 'points_per_race', 'highest_dsr_ever', 'highest_lpr_ever', 'biggest_dsr_jump', 'biggest_lpr_gain', 'giant_killer', 'hidden_gems'];
  const SUB_ORDER = ['most_wins', 'most_podiums', 'best_avg_finish'];

  function glossKey(key) { return GLOSSARY[key] ? key : (key === 'biggest_lpr_gain' ? 'biggest_lpr_gain' : key); }

  function card(key, list) {
    const m = META[key] || { title: key };
    const desc = GLOSSARY[key] || '';
    let items;
    if (m.special === 'gems') {
      items = (list || []).map((x, i) => liRow(i, x, `DSR ${fmt(x.dsr)} · DSR #${x.dsr_pos} vs LPR #${x.lpr_pos}`, ''));
    } else {
      items = (list || []).map((x, i) => {
        const val = (m.plus && x.value > 0 ? '+' : '') + fmt(x.value, m.dec);
        let extra = '';
        if (m.division && x.division) extra = `Div ${x.division}`;
        else if (m.ctx && x.event) extra = `${x.date} · ${escapeHtml(x.event.slice(0, 22))}`;
        return liRow(i, x, extra, val);
      });
    }
    if (!items.length) items = ['<li><span class="nm dim">No data yet.</span></li>'];
    return `<div class="lb-card"><h3>${m.title}</h3>${info(null, desc)}<ol>${items.join('')}</ol></div>`;
  }
  function liRow(i, x, extra, val) {
    const cls = i < 3 ? ` class="p${i + 1}"` : '';
    return `<li${cls}><span class="pos"></span><span class="nm">${driverLink(x.slug, x.driver)}${extra ? ` <span class="extra">${extra}</span>` : ''}</span>${val !== '' ? `<span class="vl">${val}</span>` : ''}</li>`;
  }

  function render() {
    let keys, source;
    if (scope === 'overall') { keys = OVERALL_ORDER; source = data.overall; }
    else if (data.by_division[scope]) { keys = SUB_ORDER; source = data.by_division[scope]; }
    else { keys = SUB_ORDER; source = data.by_format[scope]; }
    grid.innerHTML = keys.map((k) => card(k, source[k])).join('');
  }

  function buildScope() {
    const btns = [['overall', 'Overall'], ['A', 'Division A'], ['B', 'Division B'], ['C', 'Division C'], ['Cup', 'Cup'], ['3x3', '3x3']];
    scopeEl.innerHTML = btns.map(([k, l]) => `<button data-k="${k}"${k === scope ? ' class="active"' : ''}>${l}</button>`).join('');
    scopeEl.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
      scope = b.dataset.k;
      scopeEl.querySelectorAll('button').forEach((x) => x.classList.toggle('active', x === b));
      render();
    }));
  }

  fetch('data/leaderboards.json').then((r) => r.json()).then((d) => { data = d; buildScope(); render(); })
    .catch((e) => { grid.innerHTML = '<p class="empty">Could not load leaderboards.</p>'; console.error(e); });
})();
