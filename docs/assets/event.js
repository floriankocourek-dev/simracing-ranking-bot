// Event-Detail: pro Division ein Race-Block mit Sieger, Podium, voller Ergebnisliste.
(function () {
  const { fmt, escapeHtml, driverLink, GLOSSARY } = window.TRC;
  const id = new URLSearchParams(location.search).get('id');
  const content = document.getElementById('content');
  const notfound = document.getElementById('notfound');
  const FORMATS = ['Cup', '3x3'];

  if (!id) { notfound.hidden = false; return; }

  fetch('data/events/' + encodeURIComponent(id) + '.json')
    .then((r) => { if (!r.ok) throw new Error('nf'); return r.json(); })
    .then(render).catch(() => { notfound.hidden = false; });

  function render(ev) {
    document.title = `TRCrating — ${ev.name}`;
    document.getElementById('ev-name').textContent = ev.name;
    document.getElementById('ev-sub').textContent = `${ev.date} · ${ev.participants} drivers · ${ev.races.length} division${ev.races.length > 1 ? 's' : ''}`;

    content.innerHTML = ev.races.map((race) => {
      const isFmt = FORMATS.includes(race.tier);
      const rows = race.results.map((r) => {
        const dg = r.dsr_gain > 0 ? `+${fmt(r.dsr_gain)}` : fmt(r.dsr_gain);
        const dgc = r.dsr_gain > 0 ? 'trend up' : (r.dsr_gain < 0 ? 'trend down' : 'trend flat');
        const cls = r.pos <= 3 ? ` class="p${r.pos}"` : '';
        return `<tr${cls}><td class="rank">${r.pos || '–'}</td><td class="col-driver">${driverLink(r.slug, r.driver)}</td><td class="col-num">${fmt(r.points)}</td><td class="col-num ${dgc}">${dg}</td></tr>`;
      }).join('');
      return `<section class="race-block panel">
        <h3><span class="tier-tag${isFmt ? ' fmt' : ''}">${escapeHtml(race.tier)}</span> ${race.winner ? 'Winner: ' + driverLink(race.winner.slug, race.winner.driver) : ''}</h3>
        <p class="info">Field strength (avg DSR entering): <b>${fmt(race.strength_of_field, 0)}</b>. ${escapeHtml(GLOSSARY.strength_of_field)}</p>
        <table class="ranking"><thead><tr><th class="col-rank">#</th><th class="col-driver">Driver</th><th class="col-num">Pts</th><th class="col-num">ΔDSR</th></tr></thead><tbody>${rows}</tbody></table>
      </section>`;
    }).join('');
    content.hidden = false;
  }
})();
