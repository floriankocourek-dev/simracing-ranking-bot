// Detailseite (Profil 2.0): Karten, Stats, Division-Aufstieg, Badges, Kurve, Rennliste.
(function () {
  const { fmt, escapeHtml, info, GLOSSARY, BADGES } = window.TRC;
  const slug = new URLSearchParams(location.search).get('d');
  const content = document.getElementById('content');
  const notfound = document.getElementById('notfound');
  const ord = (p) => (p == null ? '–' : '#' + p);

  if (!slug) { notfound.hidden = false; return; }

  fetch('data/drivers/' + encodeURIComponent(slug) + '.json')
    .then((r) => { if (!r.ok) throw new Error('nf'); return r.json(); })
    .then(render)
    .catch(() => { notfound.hidden = false; });

  function render(d) {
    document.title = `TRCrating — ${d.driver}`;
    document.getElementById('d-name').textContent = d.driver;
    document.getElementById('d-sub').textContent = `Member since ${d.first_seen} · ${d.events_count} races`;

    // Badges
    document.getElementById('badges').innerHTML = (d.badges || []).map((b) => {
      const meta = BADGES[b] || { label: b, desc: '' };
      return `<span class="badge" title="${escapeHtml(meta.desc)}">${escapeHtml(meta.label)}</span>`;
    }).join('');

    // Rating-Karten
    document.getElementById('rating-cards').innerHTML = `
      <div class="card accent-card"><div class="label">LPR</div><div class="big">${fmt(d.current.lpr)}</div><div class="sub">rank ${ord(d.current.lpr_pos)} · best ${ord(d.bests.best_lpr_pos)}</div><p class="info">${escapeHtml(GLOSSARY.lpr)}</p></div>
      <div class="card accent-card"><div class="label">DSR</div><div class="big">${fmt(d.current.dsr)}</div><div class="sub">rank ${ord(d.current.dsr_pos)} · best ${ord(d.bests.best_dsr_pos)}</div><p class="info">${escapeHtml(GLOSSARY.dsr)}</p></div>`;

    // Season-Stats
    const s = d.stats;
    document.getElementById('stats-info').textContent = 'Counts across all formats (Championship A/B/C, Cup, 3x3).';
    document.getElementById('stat-cards').innerHTML = [
      statCard('Wins', s.wins, GLOSSARY.wins),
      statCard('Podiums', s.podiums, GLOSSARY.podiums),
      statCard('Top 5', s.top5, GLOSSARY.top5),
      statCard('Best finish', s.best_finish == null ? '–' : 'P' + s.best_finish, GLOSSARY.best_finish),
      statCard('Avg finish', fmt(s.avg_finish), GLOSSARY.avg_finish),
      statCard('Points / race', fmt(s.points_per_race), GLOSSARY.points_per_race),
      statCard('Consistency', s.consistency == null ? '–' : fmt(s.consistency, 2), GLOSSARY.consistency),
      statCard('Giant kills', s.giant_kills, GLOSSARY.giant_killer),
      formCard(s.recent_form),
      gainCard('Biggest DSR jump', s.biggest_dsr_gain, GLOSSARY.biggest_dsr_jump)
    ].join('');

    // Rennliste
    const races = d.history.slice().reverse();
    document.getElementById('race-count').textContent = `(${d.history.length})`;
    document.getElementById('races').innerHTML = races.map((h) => {
      const dg = h.dsr_gain > 0 ? `+${fmt(h.dsr_gain)}` : fmt(h.dsr_gain);
      const dgc = h.dsr_gain > 0 ? 'trend up' : (h.dsr_gain < 0 ? 'trend down' : 'trend flat');
      return `<tr><td>${h.date}</td><td class="ev">${escapeHtml(h.event)}</td><td>${escapeHtml(h.tier)}</td>
        <td class="col-num">${h.position || '–'}</td><td class="col-num">${fmt(h.final_points)}</td>
        <td class="col-num">${fmt(h.dsr)}</td><td class="col-num ${dgc}">${dg}</td><td class="col-num">${fmt(h.lpr)}</td></tr>`;
    }).join('');

    content.hidden = false;
    drawChart(d.history);
  }

  function statCard(label, value, infoText) {
    return `<div class="card"><div class="label">${label}</div><div class="big">${value}</div><p class="info">${escapeHtml(infoText)}</p></div>`;
  }
  function formCard(form) {
    const pills = (form || []).map((p) => {
      const cls = p === 1 ? 'win' : (p <= 3 ? 'pod' : '');
      return `<span class="pill ${cls}">${p}</span>`;
    }).join('');
    return `<div class="card"><div class="label">Recent form</div><div class="form" style="margin-top:6px">${pills || '–'}</div><p class="info">${escapeHtml(GLOSSARY.recent_form)}</p></div>`;
  }
  function gainCard(label, g, infoText) {
    const v = g ? (g.value > 0 ? '+' : '') + fmt(g.value) : '–';
    const sub = g ? `${g.date} · ${escapeHtml((g.event || '').slice(0, 28))}` : '';
    return `<div class="card"><div class="label">${label}</div><div class="big">${v}</div><div class="sub">${sub}</div><p class="info">${escapeHtml(infoText)}</p></div>`;
  }

  function drawChart(history) {
    const labels = history.map((h) => h.date);
    const css = getComputedStyle(document.body);
    const accent = css.getPropertyValue('--accent').trim() || '#36e0c8';
    const accent2 = css.getPropertyValue('--accent-2').trim() || '#ff6b3d';
    const grid = 'rgba(255,255,255,0.06)';
    const dim = css.getPropertyValue('--text-dim').trim() || '#8b93a3';
    new Chart(document.getElementById('chart'), {
      type: 'line',
      data: {
        labels,
        datasets: [
          { label: 'DSR', data: history.map((h) => h.dsr), yAxisID: 'yDsr', borderColor: accent, backgroundColor: accent, borderWidth: 2, pointRadius: 0, pointHoverRadius: 4, tension: 0.3 },
          { label: 'LPR', data: history.map((h) => h.lpr), yAxisID: 'yLpr', borderColor: accent2, backgroundColor: accent2, borderWidth: 2, pointRadius: 0, pointHoverRadius: 4, tension: 0.3 }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        animation: { duration: 800, easing: 'easeOutQuart' },
        plugins: { legend: { labels: { color: css.getPropertyValue('--text').trim() || '#e6e9ef', usePointStyle: true } } },
        scales: {
          x: { ticks: { color: dim, maxTicksLimit: 8, autoSkip: true }, grid: { color: grid } },
          yDsr: { position: 'left', title: { display: true, text: 'DSR', color: accent }, ticks: { color: dim }, grid: { color: grid } },
          yLpr: { position: 'right', title: { display: true, text: 'LPR', color: accent2 }, ticks: { color: dim }, grid: { drawOnChartArea: false } }
        }
      }
    });
  }
})();
