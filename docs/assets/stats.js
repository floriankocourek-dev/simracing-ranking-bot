// Stats: Scatter (Skill vs Activity), Monthly Recap, Aktivität/Monat, Closest Battles, Division-Verteilung.
(function () {
  const { fmt, escapeHtml, driverLink, GLOSSARY } = window.TRC;

  document.getElementById('scatter-info').textContent = GLOSSARY.scatter;
  document.getElementById('activity-info').textContent = GLOSSARY.activity_by_month;
  document.getElementById('clpr-info').textContent = GLOSSARY.closest_battles;
  document.getElementById('cdsr-info').textContent = GLOSSARY.closest_battles;
  document.getElementById('dist-info').textContent = GLOSSARY.division_distribution;

  Promise.all([
    fetch('data/stats.json').then((r) => r.json()),
    fetch('data/drivers-index.json').then((r) => r.json())
  ]).then(([s, drivers]) => {
    const t = s.totals;
    document.getElementById('totals').innerHTML = [
      ['Drivers', t.drivers], ['Events', t.events], ['Races', t.races]
    ].map(([l, v]) => `<div class="t"><b>${fmt(v, 0)}</b><span>${l}</span></div>`).join('');

    // Monthly recap
    const rc = s.monthly_recap;
    document.getElementById('recap-month').textContent = rc.month || '';
    const rcard = (label, item, suffix) => {
      if (!item) return `<div class="card"><div class="label">${label}</div><div class="big dim">–</div></div>`;
      const val = item.value != null ? `<div class="big">${(suffix === '+' && item.value > 0 ? '+' : '')}${fmt(item.value)}</div>` : '';
      return `<div class="card"><div class="label">${label}</div>${val}<div class="sub">${driverLink(item.slug, item.driver)}</div></div>`;
    };
    document.getElementById('recap').innerHTML =
      rcard('Most improved DSR', rc.most_improved_dsr, '+') +
      rcard('Most active', rc.most_active) +
      rcard('Most wins', rc.most_wins) +
      `<div class="card"><div class="label">New drivers</div><div class="big">${(rc.new_drivers || []).length}</div><div class="sub">${(rc.new_drivers || []).slice(0, 6).map((n) => driverLink(n.slug, n.driver)).join(', ')}</div></div>`;

    // Closest battles
    const battles = (arr) => arr.map((b) => `<div class="battle"><span>${driverLink(b.a.slug, b.a.driver)} vs ${driverLink(b.b.slug, b.b.driver)}</span><span class="gap">${fmt(b.gap)}</span></div>`).join('');
    document.getElementById('closest-lpr').innerHTML = battles(s.closest_lpr_battles);
    document.getElementById('closest-dsr').innerHTML = battles(s.closest_dsr_battles);

    // Division distribution
    document.getElementById('dist').innerHTML = s.division_distribution.map((d) => `<div class="t"><b>${fmt(d.drivers, 0)}</b><span>Division ${d.tier}</span></div>`).join('');

    drawScatter(drivers);
    drawActivity(s.activity_by_month);
  }).catch((e) => { console.error(e); document.getElementById('content').innerHTML = '<p class="empty">Could not load stats.</p>'; });

  function cssVar(n, fb) { return getComputedStyle(document.body).getPropertyValue(n).trim() || fb; }

  function drawScatter(drivers) {
    const accent = cssVar('--accent', '#36e0c8'), dim = cssVar('--text-dim', '#8b93a3'), grid = 'rgba(255,255,255,0.06)';
    const pts = drivers.filter((d) => d.lpr != null && d.dsr != null).map((d) => ({ x: d.lpr, y: d.dsr, driver: d.driver, slug: d.slug }));
    new Chart(document.getElementById('scatter'), {
      type: 'scatter',
      data: { datasets: [{ data: pts, backgroundColor: accent + 'cc', pointRadius: 4, pointHoverRadius: 7 }] },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: (c) => `${c.raw.driver}: LPR ${fmt(c.raw.x)} / DSR ${fmt(c.raw.y)}` } }
        },
        onClick: (e, els) => { if (els[0]) { const p = pts[els[0].index]; if (p) location.href = 'driver.html?d=' + encodeURIComponent(p.slug); } },
        scales: {
          x: { title: { display: true, text: 'LPR (activity)', color: dim }, ticks: { color: dim }, grid: { color: grid } },
          y: { title: { display: true, text: 'DSR (skill)', color: dim }, ticks: { color: dim }, grid: { color: grid } }
        }
      }
    });
  }

  function drawActivity(rows) {
    const accent = cssVar('--accent', '#36e0c8'), accent2 = cssVar('--accent-2', '#ff6b3d'), dim = cssVar('--text-dim', '#8b93a3'), grid = 'rgba(255,255,255,0.06)';
    new Chart(document.getElementById('activity'), {
      type: 'bar',
      data: {
        labels: rows.map((r) => r.month),
        datasets: [
          { label: 'Races', data: rows.map((r) => r.races), backgroundColor: accent },
          { label: 'Active drivers', data: rows.map((r) => r.active_drivers), backgroundColor: accent2 }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { labels: { color: cssVar('--text', '#e6e9ef') } } },
        scales: { x: { ticks: { color: dim }, grid: { color: grid } }, y: { ticks: { color: dim }, grid: { color: grid } } }
      }
    });
  }
})();
