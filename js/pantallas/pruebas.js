// Flaski · modo local de pruebas (localhost con «?local», ver modo.js): aviso fijo y datos de ejemplo
import * as api from '../api.js';
import { toRow } from '../rows.js';
import { dateKey } from '../srs.js';
import { S, toast, fail, cardList } from '../comun.js';
import { readBuiltin, importParsed } from './explorar.js';
import { onSignedIn, readTema, storeTemaImages } from './cuenta.js';
import { TEMAS, temaSource } from '../primera-vez.js';
import { TAG_COLORS, tagColor } from '../org.js';
import { makeSuggested, temaPicks } from './sugerencias.js';
import { closeSheet } from './editor.js';
import { pageRow } from './apuntes.js';

const DAY = 864e5;

export function mountTestBar() {
  const bar = document.createElement('div');
  bar.className = 'testbar';
  bar.setAttribute('role', 'status');
  bar.innerHTML = '<span><b>Modo local de pruebas</b><span class="tb-more"> · los datos se guardan aparte, solo en este navegador</span></span><button type="button" class="small-btn" data-act="sample-data">Cargar datos de ejemplo</button>';
  document.body.prepend(bar);
  document.body.classList.add('has-testbar');
  // La página empieza justo debajo del aviso, mida lo que mida (dos líneas, muesca del móvil…)
  const fit = () => document.body.style.setProperty('--tb-h', `${bar.offsetHeight}px`);
  fit();
  if (window.ResizeObserver) new ResizeObserver(fit).observe(bar);
}

// Números al azar siempre iguales (para que los datos de ejemplo salgan parecidos cada vez)
function rng(seed) {
  let x = seed >>> 0 || 1;
  return () => { x ^= x << 13; x >>>= 0; x ^= x >> 17; x ^= x << 5; x >>>= 0; return x / 2 ** 32; };
}

// Progreso inventado para una lista: parte estudiada (consolidadas, jóvenes y alguna que cuesta), con
// sus respuestas repartidas por los últimos meses. Devuelve { progress, events } en filas del backend.
export function inventProgress(uid, deckId, cardIds, { share = 0.6, seed = 1, now = Date.now() } = {}) {
  const r = rng(seed), progress = [], events = [];
  const between = (a, b) => a + r() * (b - a);
  for (const id of cardIds) {
    if (r() > share) continue;
    const k = r(), weak = k < 0.12, young = !weak && k < 0.45;
    const interval = weak ? 1 : young ? Math.round(between(2, 18)) : Math.round(between(21, 80));
    const lapses = weak ? 2 + Math.floor(r() * 3) : r() < 0.15 ? 1 : 0;
    // La última respuesta, hace entre un día y algo más que el intervalo: así unas tocan hoy y otras no
    const last = now - Math.round(between(weak ? 0.2 : 1, interval * 1.15 + 1)) * DAY - Math.round(r() * 8 * 3600e3);
    const firstSeen = last - Math.round(between(weak ? 6 : 10, weak ? 30 : 120)) * DAY;
    const reps = 2 + Math.floor(r() * 5);
    const ease = weak ? 1.7 : 2.3 + r() * 0.4;
    progress.push(toRow(uid, id, { reps, interval, ease, lapses, due: last + interval * DAY, firstSeen, last }));
    // Las respuestas: la primera al empezar, la última el día de «last», las demás entre medias
    let prevIvl = 0;
    for (let i = 0; i < reps; i++) {
      const t = i === reps - 1 ? last : Math.round(firstSeen + (last - firstSeen) * (i / (reps - 1)) * (0.8 + r() * 0.2));
      const fail = (weak && i >= reps - 2) || (lapses && r() < 0.2);
      const ivl = i === reps - 1 ? interval : fail ? 0 : Math.max(1, Math.round(interval * (i + 1) / reps));
      events.push({
        id: api.newId(), user_id: uid, card_id: id, deck_id: deckId, ts: new Date(t).toISOString(),
        grade: fail ? 1 : r() < 0.15 ? 4 : r() < 0.15 ? 2 : 3, state: i === 0 ? 'new' : prevIvl ? 'review' : 'learning',
        ivl, last_ivl: prevIvl, ease: Math.round(ease * 1000) / 1000, ms: Math.round(between(3000, 18000)),
      });
      prevIvl = ivl;
    }
  }
  return { progress, events };
}

// Un tema de ejemplo como apunte, con sus preguntas en una lista con su nombre. Si ya estaba con preguntas,
// no hace nada y devuelve null; si no, { page, deck }.
export async function addTema(t) {
  const { title, blocks } = await readTema(t);
  let p = [...S.pages.values()].find(x => x.title === title);
  if (p && cardList().some(c => c.page_id === p.id)) return null;
  await storeTemaImages(blocks);
  if (!p) { p = await api.createPage({ owner: S.uid, title, icon: '', deck_id: null, folder_id: null, tags: [], blocks }); S.pages.set(p.id, p); }
  if (!p.deck_id || !S.decks.has(p.deck_id)) {
    // Una lista del tema que se quedó vacía (algo falló a medias): se reutiliza en vez de crear otra
    const empty = [...S.decks.values()].find(d => d.source === temaSource(t) && !cardList().some(c => c.deck_id === d.id));
    const deck = empty || await api.createDeck({ owner: S.uid, name: title.slice(0, 80), description: '', source: temaSource(t), folder_id: p.folder_id || null });
    S.decks.set(deck.id, { tags: [], ...deck });
    // Con cuenta, savePage va por la cola de envíos y no devuelve el apunte: se cambia el que ya tenemos
    p.deck_id = deck.id; S.pages.set(p.id, p);
    await api.savePage(pageRow(p));
  }
  const picks = await temaPicks(p, await (await fetch(t.cards, { cache: 'no-cache' })).json());
  await makeSuggested(p, picks, p.deck_id);
  return { page: p, deck: S.decks.get(p.deck_id) };
}
// Las listas incluidas en la app, con progreso inventado en casi todas, y los temas de ejemplo como apuntes.
// Lo que ya esté no se repite.
export async function loadSampleData(btn) {
  if (btn) { btn.disabled = true; btn.textContent = 'Cargando…'; }
  try {
    const list = await (await fetch('decks/index.json', { cache: 'no-cache' })).json();
    const have = new Set([...S.decks.values()].map(d => d.source));
    const share = [0.55, 0.75, 0.35, 0.6];
    let added = 0;
    for (const [i, item] of list.entries()) {
      const source = 'incluido:' + item.file;
      if (have.has(source)) continue;
      const { deck, cards } = await importParsed({ ...await readBuiltin(item.file), source });
      const { progress, events } = inventProgress(S.uid, deck.id, cards.map(c => c.id), { share: share[i % share.length], seed: 7 + i });
      // Las preguntas «llegaron» unos días antes de la primera respuesta inventada (si no, el gráfico las
      // contaría como añadidas hoy)
      const since = Math.min(Date.now(), ...progress.map(p => Date.parse(p.first_seen))) - 3 * DAY;
      const created_at = new Date(since).toISOString();
      for (const c of cards) await api.updateCard(c.id, { created_at });
      await api.saveProgressMany(progress);
      await api.addEvents(events);
      const days = new Map();
      for (const e of events) { const d = dateKey(Date.parse(e.ts)); days.set(d, (days.get(d) || 0) + 1); }
      // Se suma a lo que ya hubiera ese día (mergeLog se queda con el máximo)
      await api.mergeLog(S.uid, [...days].map(([day, n]) => ({ day, count: (S.log[day] || 0) + n })));
      added++;
    }
    // Etiquetas sin color (las de antes salían grises): cada una de un color de la paleta, variados
    const grey = [...S.tags.values()].filter(t => tagColor(t.color) === 'gris');
    for (const [i, t] of grey.entries()) await api.updateTag(t.id, { color: TAG_COLORS[i % (TAG_COLORS.length - 1)].id });
    let notes = 0;
    for (const t of TEMAS) if (await addTema(t)) notes++;
    // Se vuelve a cargar todo, como al entrar, y se abre Hoy (sin la bienvenida, que ya no hace falta)
    document.querySelector('.ob')?.dispatchEvent(new Event('ob-close'));
    closeSheet();
    Object.assign(S, { uid: null, view: 'home', session: null, noNews: true });
    await onSignedIn(await api.auth.session());
    window.scrollTo(0, 0);
    toast(added || notes ? `Datos de ejemplo cargados: ${[added && (added === 1 ? '1 lista' : `${added} listas`), notes && (notes === 1 ? '1 apunte' : `${notes} apuntes`)].filter(Boolean).join(' y ')}` : 'Los datos de ejemplo ya estaban');
  } catch (e) { fail(e); }
  finally { if (btn?.isConnected) { btn.disabled = false; btn.textContent = 'Cargar datos de ejemplo'; } }
}
