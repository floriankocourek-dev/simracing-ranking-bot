// Hall of Fame: kuratierte Allzeit-Rekorde + Division-A-Club.
(function () {
  const { fmt, escapeHtml, driverLink, GLOSSARY } = window.TRC;

  const RECORDS = [
    ['highest_dsr_ever', 'Highest DSR Ever', false],
    ['highest_lpr_ever', 'Highest LPR Ever', false],
    ['most_wins', 'Most Wins', false],
    ['most_podiums', 'Most Podiums', false],
    ['most_starts', 'Most Starts', false],
    ['biggest_single_race_gain', 'Biggest Single-Race DSR Gain', true],
    ['best_rookie_debut', 'Best Rookie Debut', false]
  ];
  const DESC = {
    biggest_single_race_gain: GLOSSARY.biggest_dsr_jump,
    best_rookie_debut: GLOSSARY.best_rookie_debut
  };

  fetch('data/halloffame.json').then((r) => r.json()).then((h) => {
    document.getElementById('records').innerHTML = RECORDS.map(([key, title, plus]) => {
      const it = h[key];
      const desc = DESC[key] || GLOSSARY[key] || '';
      if (!it) return `<div class="card"><div class="label">${title}</div><div class="big dim">–</div></div>`;
      const val = (plus && it.value > 0 ? '+' : '') + fmt(it.value);
      return `<div class="card accent-card"><div class="label">${title}</div><div class="big">${val}</div><div class="sub">${driverLink(it.slug, it.driver)}</div><p class="info">${escapeHtml(desc)}</p></div>`;
    }).join('');

    const club = h.division_a_club || [];
    document.getElementById('club-count').textContent = `(${club.length})`;
    document.getElementById('club-info').textContent = GLOSSARY.division_a_club;
    document.getElementById('club').innerHTML = club.map((c) => `<span class="badge">${driverLink(c.slug, c.driver)}</span>`).join('') || '<span class="dim">–</span>';
  }).catch((e) => { console.error(e); document.querySelector('main').innerHTML = '<p class="empty">Could not load Hall of Fame.</p>'; });
})();
