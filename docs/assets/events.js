// Event-Archiv: flache Liste aller Events, durchsuchbar.
(function () {
  const { fmt, escapeHtml } = window.TRC;
  const listEl = document.getElementById('list');
  const search = document.getElementById('search');
  let events = [], filter = '';

  function render() {
    let rows = events;
    if (filter) { const f = filter.toLowerCase(); rows = rows.filter((e) => e.name.toLowerCase().includes(f)); }
    if (!rows.length) { listEl.innerHTML = '<p class="empty">No event found.</p>'; return; }
    listEl.innerHTML = rows.map((e) => {
      const divs = [...new Set(e.divisions)].join(', ');
      const gain = e.top_dsr_gain ? `${escapeHtml(e.top_dsr_gain.driver)} +${fmt(e.top_dsr_gain.value)}` : '–';
      return `<a class="evrow" href="event.html?id=${encodeURIComponent(e.id)}">
        <span class="date">${e.date}</span>
        <span><span class="nm">${escapeHtml(e.name)}</span><br><span class="tags">${e.participants} drivers · ${escapeHtml(divs)} · top gain: ${gain}</span></span>
        <span class="sof"><b>${fmt(e.strength_of_field, 0)}</b><span>field strength</span></span>
      </a>`;
    }).join('');
  }

  search.addEventListener('input', () => { filter = search.value.trim(); render(); });

  fetch('data/events.json').then((r) => r.json()).then((d) => { events = d.events; render(); })
    .catch((e) => { listEl.innerHTML = '<p class="empty">Could not load events.</p>'; console.error(e); });
})();
