// Un historial de estudio inventado (pero creíble) para probar los gráficos: dos mazos que llegan en
// fechas distintas y unos meses estudiando casi todos los días. Se guarda en el almacenamiento local
// antes de abrir la app (seedHistory) y siempre sale igual (números pseudoaleatorios con semilla).
export function makeHistory({ days = 150, now = Date.now() } = {}) {
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const DAY = 864e5, day0 = new Date(now); day0.setHours(0, 0, 0, 0);
  const at = i => day0.getTime() - (days - 1 - i) * DAY;
  const iso = t => new Date(t).toISOString();
  const decks = [
    { id: 'd-hist', name: 'Historia de España', from: 0, n: 140 },
    { id: 'd-bio', name: 'Biología', from: days - 60, n: 70 },
  ];
  const db = { profile: { id: 'local', display_name: '' }, settings: { new_per_day: 10, prefs: {} }, decks: [], cards: [], progress: [], log: [], folders: [], tags: [], types: [], events: [], pages: [] };
  const st = new Map();
  for (const d of decks) {
    db.decks.push({ id: d.id, owner: 'local', name: d.name, description: '', is_public: false, source: '', created_at: iso(at(d.from) + 9 * 36e5), updated_at: iso(at(d.from)) });
    for (let k = 0; k < d.n; k++) {
      const id = `${d.id}-${k}`;
      db.cards.push({ id, deck_id: d.id, owner: 'local', front: `${d.name}: pregunta ${k + 1}`, back: `Respuesta ${k + 1}`, note: '', position: k, created_at: iso(at(d.from) + 9 * 36e5 + k * 1000), type_id: 'basic', template: 't1', fields: {}, hint: '', tags: [] });
    }
  }
  for (let i = 0; i < days; i++) {
    if (i < days - 1 && rnd() < 0.18) continue;            // algunos días sin estudiar
    const t0 = at(i) + 19 * 36e5;
    let n = 0, newN = 0;
    for (const c of db.cards) {
      const created = Date.parse(c.created_at);
      if (created > t0) continue;
      const s = st.get(c.id);
      if (s ? s.due > at(i) + DAY : newN >= 10) continue;
      if (!s) newN++;
      const fail = rnd() < (s ? 0.12 : 0.25);
      const prev = s?.ivl || 0;
      const ivl = fail ? 0 : prev < 1 ? 1 : Math.min(200, Math.round(prev * (2.2 + rnd())));
      const t = t0 + n++ * 9000;
      db.events.push({ id: `e${db.events.length}`, user_id: 'local', card_id: c.id, deck_id: c.deck_id, ts: iso(t), grade: fail ? 1 : 3, state: !s ? 'new' : prev === 0 ? 'learning' : 'review', ivl, last_ivl: prev, ease: 2.5, ms: 8000 });
      st.set(c.id, { ivl, due: at(i) + Math.max(1, ivl) * DAY, first: s?.first ?? t, last: t, reps: (s?.reps || 0) + 1 });
    }
    if (n) db.log.push({ user_id: 'local', day: new Date(at(i) + 12 * 36e5).toISOString().slice(0, 10), count: n });
  }
  for (const [id, s] of st) db.progress.push({ user_id: 'local', card_id: id, reps: s.reps, interval: s.ivl, ease: 2.5, lapses: 0, due: iso(s.due), first_seen: iso(s.first), last: iso(s.last) });
  return db;
}
export async function seedHistory(page, opts) {
  const db = makeHistory(opts);
  await page.addInitScript(d => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem('flaski-local-v1', d); sessionStorage.setItem('seeded', '1'); } }, JSON.stringify(db));
  return db;
}
