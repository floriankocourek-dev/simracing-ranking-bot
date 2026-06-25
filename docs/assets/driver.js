// Detailseite: lädt drivers/<slug>.json, rendert Karten, Verlaufskurve, Rennliste.
(function () {
  const params = new URLSearchParams(location.search);
  const slug = params.get('d');

  const content = document.getElementById('content');
  const notfound = document.getElementById('notfound');

  function fmt(n, dec) {
    return Number(n).toLocaleString('en-US', { maximumFractionDigits: dec == null ? 1 : dec });
  }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function ord(p) { return p == null ? '–' : '#' + p; }

  if (!slug) { notfound.hidden = false; return; }

  fetch('data/drivers/' + encodeURIComponent(slug) + '.json')
    .then((r) => { if (!r.ok) throw new Error('not found'); return r.json(); })
    .then((d) => render(d))
    .catch(() => { notfound.hidden = false; });

  function render(d) {
    document.title = `TRCrating — ${d.driver}`;
    document.getElementById('d-name').textContent = d.driver;
    document.getElementById('d-sub').textContent =
      `Member since ${d.first_seen} · ${d.events_count} races`;

    document.getElementById('cards').innerHTML = `
      <div class="card accent-card"><div class="label">LPR</div><div class="big">${fmt(d.current.lpr)}</div><div class="sub">rank ${ord(d.current.lpr_pos)}</div></div>
      <div class="card accent-card"><div class="label">DSR</div><div class="big">${fmt(d.current.dsr)}</div><div class="sub">rank ${ord(d.current.dsr_pos)}</div></div>
      <div class="card"><div class="label">Best LPR</div><div class="big">${fmt(d.bests.best_lpr)}</div><div class="sub">best rank ${ord(d.bests.best_lpr_pos)}</div></div>
      <div class="card"><div class="label">Best DSR</div><div class="big">${fmt(d.bests.best_dsr)}</div><div class="sub">best rank ${ord(d.bests.best_dsr_pos)}</div></div>
    `;

    // Rennliste (neueste zuerst)
    const races = d.history.slice().reverse();
    document.getElementById('race-count').textContent = `(${d.history.length})`;
    document.getElementById('races').innerHTML = races.map((h) => `
      <tr>
        <td>${h.date}</td>
        <td class="ev">${escapeHtml(h.event)}</td>
        <td>${escapeHtml(h.tier)}</td>
        <td class="col-num">${h.position || '–'}</td>
        <td class="col-num">${fmt(h.final_points)}</td>
        <td class="col-num">${fmt(h.dsr)}</td>
        <td class="col-num">${fmt(h.lpr)}</td>
      </tr>`).join('');

    content.hidden = false;
    drawChart(d.history);
  }

  function drawChart(history) {
    const labels = history.map((h) => h.date);
    const dsr = history.map((h) => h.dsr);
    const lpr = history.map((h) => h.lpr);
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
          {
            label: 'DSR', data: dsr, yAxisID: 'yDsr',
            borderColor: accent, backgroundColor: accent,
            borderWidth: 2, pointRadius: 0, pointHoverRadius: 4, tension: 0.3
          },
          {
            label: 'LPR', data: lpr, yAxisID: 'yLpr',
            borderColor: accent2, backgroundColor: accent2,
            borderWidth: 2, pointRadius: 0, pointHoverRadius: 4, tension: 0.3
          }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        animation: { duration: 900, easing: 'easeOutQuart' },
        plugins: {
          legend: { labels: { color: css.getPropertyValue('--text').trim() || '#e6e9ef', usePointStyle: true } },
          tooltip: { displayColors: true }
        },
        scales: {
          x: { ticks: { color: dim, maxTicksLimit: 8, autoSkip: true }, grid: { color: grid } },
          yDsr: { position: 'left', title: { display: true, text: 'DSR', color: accent }, ticks: { color: dim }, grid: { color: grid } },
          yLpr: { position: 'right', title: { display: true, text: 'LPR', color: accent2 }, ticks: { color: dim }, grid: { drawOnChartArea: false } }
        }
      }
    });
  }
})();
