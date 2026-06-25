// Übersichtsseite: lädt drivers-index.json, rendert sortier-/suchbare Tabelle.
(function () {
  let drivers = [];
  let sortKey = 'lpr';
  let filter = '';

  const tbody = document.getElementById('tbody');
  const empty = document.getElementById('empty');
  const search = document.getElementById('search');
  const metaEl = document.getElementById('meta');

  function fmt(n) {
    return Number(n).toLocaleString('en-US', { maximumFractionDigits: 1 });
  }

  function trendCell(v) {
    if (v > 0) return `<span class="trend up">▲ ${v}</span>`;
    if (v < 0) return `<span class="trend down">▼ ${-v}</span>`;
    return `<span class="trend flat">–</span>`;
  }

  function render() {
    const posKey = sortKey === 'lpr' ? 'lpr_pos' : 'dsr_pos';
    const trendKey = sortKey === 'lpr' ? 'lpr_trend' : 'dsr_trend';

    let rows = drivers.slice().sort((a, b) => (b[sortKey] || 0) - (a[sortKey] || 0));
    rows.forEach((d, i) => { d._rank = i + 1; });

    if (filter) {
      const f = filter.toLowerCase();
      rows = rows.filter((d) => d.driver.toLowerCase().includes(f));
    }

    empty.hidden = rows.length > 0;

    tbody.innerHTML = rows.map((d) => {
      const rank = d._rank;
      const cls = rank <= 3 ? ` class="p${rank}"` : '';
      const lprCls = sortKey === 'lpr' ? 'val-primary' : 'val-dim';
      const dsrCls = sortKey === 'dsr' ? 'val-primary' : 'val-dim';
      return `<tr${cls}>
        <td class="rank">${rank}</td>
        <td class="col-driver"><a href="driver.html?d=${encodeURIComponent(d.slug)}">${escapeHtml(d.driver)}</a></td>
        <td class="col-num ${lprCls}">${fmt(d.lpr)}</td>
        <td class="col-num ${dsrCls}">${fmt(d.dsr)}</td>
        <td class="col-trend">${trendCell(d[trendKey] || 0)}</td>
      </tr>`;
    }).join('');
  }

  function escapeHtml(s) {
    return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  document.querySelectorAll('.sortbtn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.sortbtn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      sortKey = btn.dataset.sort;
      render();
    });
  });

  search.addEventListener('input', () => { filter = search.value.trim(); render(); });

  Promise.all([
    fetch('data/drivers-index.json').then((r) => r.json()),
    fetch('data/meta.json').then((r) => r.json()).catch(() => null)
  ]).then(([idx, meta]) => {
    drivers = idx;
    if (meta) {
      metaEl.textContent = `${meta.driver_count} drivers · ${meta.event_count} race results · last update ${meta.latest_cutoff}`;
    }
    render();
  }).catch((e) => {
    empty.hidden = false;
    empty.textContent = 'Could not load ranking data.';
    console.error(e);
  });
})();
