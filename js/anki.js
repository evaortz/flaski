// Importar mazos de Anki (.apkg y .colpkg).
// Un .apkg es un ZIP con la colección (una base de datos SQLite) y los archivos multimedia.
// Hay tres versiones del formato:
//   collection.anki2 / collection.anki21  → esquema antiguo: tipos de nota y mazos en JSON (tabla col)
//   collection.anki21b                    → Anki 2.1.50+: comprimido con Zstandard y con tablas propias
//                                            (notetypes, fields, templates, decks)
// Sin dependencias de la interfaz, así que se puede probar aparte.
import { readZip } from './zip.js';
import { openSqlite } from './sqlite.js';
import { decompress } from './vendor/fzstd.js';
import { BUILTIN_TYPES, activeTemplates, summarize } from './cardtypes.js';

const DAY = 864e5;
const isZstd = b => b && b[0] === 0x28 && b[1] === 0xb5 && b[2] === 0x2f && b[3] === 0xfd;
const unzstd = b => (isZstd(b) ? decompress(b) : b);

/* ---------------- Protobuf mínimo (configuración del formato nuevo) ---------------- */
// → Map número de campo → [valores] (números o Uint8Array)
export function protoFields(buf) {
  const out = new Map();
  let o = 0;
  const vint = () => { let v = 0, m = 1, x; do { x = buf[o++]; v += (x & 0x7f) * m; m *= 128; } while (x & 0x80); return v; };
  while (o < buf.length) {
    const key = vint(), no = Math.floor(key / 8), wt = key & 7;
    let v;
    if (wt === 0) v = vint();
    else if (wt === 2) { const n = vint(); v = buf.subarray(o, o + n); o += n; }
    else if (wt === 1) { o += 8; continue; }
    else if (wt === 5) { o += 4; continue; }
    else break;
    if (!out.has(no)) out.set(no, []);
    out.get(no).push(v);
  }
  return out;
}
const pstr = (m, no) => (m.get(no)?.[0] instanceof Uint8Array ? new TextDecoder().decode(m.get(no)[0]) : '');

/* ---------------- Leer el archivo ---------------- */
// bytes del .apkg → colección { notetypes, decks, notes, cards, revlog, crt, media: Map nombre → () => Promise<Uint8Array> }
export async function readApkg(bytes) {
  const zip = readZip(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes));
  const entry = ['collection.anki21b', 'collection.anki21', 'collection.anki2'].find(n => zip.has(n));
  if (!entry) throw new Error('El archivo no tiene una colección de Anki');
  const db = openSqlite(unzstd(await zip.get(entry).read()));
  const col = db.rows('col')[0] || {};
  const crt = Number(col.crt) || 0;

  let notetypes = [], decks = [];
  if (db.has('notetypes')) {
    // Formato nuevo: una tabla por cosa y la configuración en protobuf
    const fields = db.rows('fields'), tmpls = db.rows('templates');
    notetypes = db.rows('notetypes').map(nt => ({
      id: String(nt.id), name: nt.name,
      cloze: (protoFields(nt.config || new Uint8Array()).get(1)?.[0] || 0) === 1,
      fields: fields.filter(f => f.ntid === nt.id).sort((a, b) => a.ord - b.ord).map(f => f.name),
      templates: tmpls.filter(t => t.ntid === nt.id).sort((a, b) => a.ord - b.ord).map(t => {
        const c = protoFields(t.config || new Uint8Array());
        return { name: t.name, ord: t.ord, q: pstr(c, 1), a: pstr(c, 2) };
      }),
    }));
    decks = db.rows('decks').map(d => ({ id: String(d.id), name: String(d.name).split('\x1f').join('::') }));
  } else {
    const models = JSON.parse(col.models || '{}'), dks = JSON.parse(col.decks || '{}');
    notetypes = Object.values(models).map(m => ({
      id: String(m.id), name: m.name, cloze: m.type === 1,
      fields: [...(m.flds || [])].sort((a, b) => a.ord - b.ord).map(f => f.name),
      templates: [...(m.tmpls || [])].sort((a, b) => a.ord - b.ord).map(t => ({ name: t.name, ord: t.ord, q: t.qfmt || '', a: t.afmt || '' })),
    }));
    decks = Object.values(dks).map(d => ({ id: String(d.id), name: d.name }));
  }
  const notes = db.rows('notes').map(n => ({ id: String(n.id), mid: String(n.mid), fields: String(n.flds ?? '').split('\x1f'), tags: String(n.tags || '').trim().split(/\s+/).filter(Boolean) }));
  const cards = db.rows('cards').map(c => ({ id: String(c.id), nid: String(c.nid), did: String(c.odid || c.did), ord: c.ord, type: c.type, queue: c.queue, due: c.odid ? c.odue : c.due, ivl: c.ivl, factor: c.factor, reps: c.reps, lapses: c.lapses }));
  const revlog = db.has('revlog') ? db.rows('revlog').map(r => ({ id: r.id, cid: String(r.cid), ease: r.ease, ivl: r.ivl, lastIvl: r.lastIvl, factor: r.factor, time: r.time, type: r.type })) : [];

  // Multimedia: «media» dice cómo se llama cada archivo del ZIP (0, 1, 2…)
  const media = new Map();
  if (zip.has('media')) {
    const raw = await zip.get('media').read();
    if (isZstd(raw)) {
      (protoFields(decompress(raw)).get(1) || []).forEach((e, i) => {
        const m = protoFields(e), name = pstr(m, 1), zipName = String(m.get(255)?.[0] ?? i);
        if (name && zip.has(zipName)) media.set(name, async () => unzstd(await zip.get(zipName).read()));
      });
    } else {
      let map = {};
      try { map = JSON.parse(new TextDecoder().decode(raw) || '{}'); } catch {}
      for (const [zipName, name] of Object.entries(map)) if (zip.has(zipName)) media.set(name, () => zip.get(zipName).read());
    }
  }
  return { notetypes, decks, notes, cards, revlog, crt, media };
}

/* ---------------- HTML de Anki → texto de Flaski ---------------- */
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" };
const decode = s => s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e) => (e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : +e.slice(1)) : ENT[e.toLowerCase()] ?? m));
// imageFor(nombre de archivo) → id de imagen de Flaski (o null si no se usa)
export function ankiHtmlToText(html, imageFor = () => null) {
  let s = String(html ?? '');
  s = s.replace(/<(style|script)[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/\[sound:[^\]]*\]/g, '')
    .replace(/<img\b[^>]*?\bsrc\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))[^>]*>/gi, (m, _q, a, b, c) => {
      let name = decode(a ?? b ?? c ?? '');
      try { name = decodeURIComponent(name); } catch {}
      const id = imageFor(name);
      return id ? `\n![](img:${id})\n` : '';
    })
    .replace(/<br\s*\/?>/gi, '\n')
    // Bloques (div, p, listas…): un salto de línea, aunque se cierre uno y se abra otro seguido
    .replace(/<li\b[^>]*>/gi, '\u0002- ').replace(/<\/?(div|p|li|h\d|tr|ul|ol|table)\b[^>]*>/gi, '\u0002').replace(/\u0002+/g, '\n')
    .replace(/<\/?(b|strong)\b[^>]*>/gi, '**').replace(/<\/?(i|em)\b[^>]*>/gi, '*')
    .replace(/<[^>]+>/g, '');
  s = decode(s)
    .replace(/\*\*\s*\*\*/g, '')
    // Huecos de Anki {{c1::texto::pista}} → {{texto::pista}}
    .replace(/\{\{c\d+::([\s\S]*?)(?:::([\s\S]*?))?\}\}/g, (m, t, h) => `{{${t}${h ? '::' + h : ''}}}`)
    .replace(/[ \t ]+\n/g, '\n').replace(/\n[ \t ]+/g, '\n').replace(/\n{3,}/g, '\n\n');
  return s.trim();
}

/* ---------------- Tipos de nota → tipos de Flaski ---------------- */
// Campos que usa una plantilla de Anki: {{Campo}}, {{furigana:Campo}}, {{type:Campo}}, {{cloze:Texto}}…
export function templateRefs(tpl, fieldNames) {
  const refs = [], typed = [], cloze = [];
  for (const m of String(tpl || '').matchAll(/\{\{([^}]+)\}\}/g)) {
    const inner = m[1].trim();
    if (/^[#/^!]/.test(inner)) continue;
    const parts = inner.split(':'), name = parts[parts.length - 1].trim();
    if (!fieldNames.includes(name)) continue;
    if (parts[0].trim() === 'type') typed.push(name);
    else if (parts.some(p => p.trim() === 'cloze')) cloze.push(name);
    else refs.push(name);
  }
  return { refs: [...new Set(refs)], typed, cloze };
}
const F = (id, name) => ({ id, name, lang: '', autoplay: false, help: '' });
const same = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
const builtin = id => BUILTIN_TYPES.find(t => t.id === id);

// Tipo de nota de Anki → { type (de Flaski), map(campos de Anki) → campos de Flaski, tpl(ord de Anki) → plantilla }
export function convertNotetype(nt) {
  const names = nt.fields;
  const fid = name => 'f' + (names.indexOf(name) + 1);
  if (nt.cloze) {
    const t0 = templateRefs(nt.templates[0]?.q, names);
    const clozeField = t0.cloze[0] || names[0];
    return {
      type: builtin('cloze'),
      map: (vals) => ({ x: vals[names.indexOf(clozeField)] || '', e: names.filter(n => n !== clozeField).map(n => vals[names.indexOf(n)]).filter(Boolean).join('\n') }),
      tpl: () => 't1',
    };
  }
  const tpls = nt.templates.map(t => {
    const q = templateRefs(t.q, names), a = templateRefs(t.a, names);
    const front = q.refs, answer = q.typed[0] || null;
    let back = a.refs.filter(n => !front.includes(n) && n !== answer);
    if (!back.length && !answer) back = names.filter(n => !front.includes(n));
    return { front, back, answer, name: t.name || `Tarjeta ${t.ord + 1}` };
  });
  // Los más corrientes, a los tipos de Flaski equivalentes
  if (names.length === 2 && tpls.length === 1 && !tpls[0].answer && same(tpls[0].front, [names[0]]) && same(tpls[0].back, [names[1]])) {
    return { type: builtin('basic'), map: v => ({ q: v[0] || '', a: v[1] || '' }), tpl: () => 't1' };
  }
  if (names.length === 2 && tpls.length === 1 && tpls[0].answer === names[1] && same(tpls[0].front, [names[0]])) {
    return { type: builtin('typing'), map: v => ({ q: v[0] || '', a: v[1] || '' }), tpl: () => 't1' };
  }
  if (names.length === 2 && tpls.length === 2 && !tpls[0].answer && !tpls[1].answer && same(tpls[0].front, [names[0]]) && same(tpls[0].back, [names[1]]) && same(tpls[1].front, [names[1]]) && same(tpls[1].back, [names[0]])) {
    return { type: builtin('reverse'), map: v => ({ a: v[0] || '', b: v[1] || '' }), tpl: ord => (ord === 1 ? 't2' : 't1') };
  }
  // El resto, como un tipo propio con los mismos campos y una plantilla por tarjeta
  const type = {
    id: 'anki-' + nt.id, builtin: false, name: String(nt.name || 'Tipo de Anki').slice(0, 60), icon: '', lucide: 'layers',
    description: 'Importado de Anki',
    fields: names.map((n, i) => F('f' + (i + 1), String(n).slice(0, 40))),
    templates: tpls.filter(t => t.front.length || t.answer).map(t => ({
      id: 't' + (nt.templates[tpls.indexOf(t)].ord + 1), name: String(t.name).slice(0, 60),
      mode: t.answer ? 'type' : 'flip', front: t.front.map(fid), back: t.back.map(fid), ...(t.answer ? { answer: fid(t.answer) } : {}),
    })),
  };
  return { type, map: v => Object.fromEntries(names.map((n, i) => ['f' + (i + 1), v[i] || ''])), tpl: ord => 't' + (ord + 1) };
}

/* ---------------- Colección → lo que se importa ---------------- */
// Progreso de una tarjeta de Anki → estado de Flaski (null si es nueva)
export function ankiProgress(c, crt, now = Date.now(), seen = null) {
  if (!c || c.type === 0) return null;
  const review = c.type === 2;
  let due = now;
  if (review) due = crt * 1000 + c.due * DAY;
  const interval = review ? Math.max(1, c.ivl) : 0;
  const last = seen?.last || (review ? due - interval * DAY : now);
  return { reps: c.reps || 1, interval, ease: c.factor ? c.factor / 1000 : 2.5, lapses: c.lapses || 0, due, firstSeen: seen?.first || last, last };
}

// → { decks: [{ key, name, path, cards }], types, images: Map nombre de archivo → id, total, skipped, notes }
// Cada tarjeta lleva además anki: id de la tarjeta de Anki (para su progreso e historial)
export function ankiToFlaski(col, { newImageId }) {
  const nts = new Map(col.notetypes.map(nt => [nt.id, { nt, conv: convertNotetype(nt) }]));
  const deckName = new Map(col.decks.map(d => [d.id, d.name]));
  const images = new Map();
  const imageFor = name => {
    if (!col.media.has(name)) return null;
    if (!images.has(name)) images.set(name, newImageId());
    return images.get(name);
  };
  const cardsOf = new Map();
  for (const c of col.cards) { if (!cardsOf.has(c.nid)) cardsOf.set(c.nid, []); cardsOf.get(c.nid).push(c); }
  const byDeck = new Map(), types = new Map();
  let skipped = 0, notes = 0;
  for (const n of col.notes) {
    const e = nts.get(n.mid), ac = cardsOf.get(n.id) || [];
    if (!e || !ac.length) { skipped++; continue; }
    const { type, map, tpl } = e.conv;
    const fields = map(n.fields.map(v => ankiHtmlToText(v, imageFor)));
    const active = activeTemplates(type, fields);
    if (!active.length) { skipped++; continue; }
    notes++;
    if (!type.builtin) types.set(type.id, type);
    for (const t of active) {
      // La tarjeta de Anki que corresponde a esta plantilla (en los huecos, la primera)
      const a = ac.filter(x => tpl(x.ord) === t.id).sort((x, y) => x.ord - y.ord)[0] || null;
      const did = (a || ac[0]).did;
      const sum = summarize(type, t, fields);
      if (!byDeck.has(did)) byDeck.set(did, []);
      byDeck.get(did).push({ ...sum, type_id: type.id, template: t.id, fields, note_id: 'anki' + n.id, hint: '', tagNames: n.tags.map(x => x.replace(/::/g, ' › ').replace(/_/g, ' ').slice(0, 40)), anki: a?.id || null });
    }
  }
  // Nombres: «Idiomas::Turco::Verbos» → ruta ['Idiomas', 'Turco', 'Verbos']
  const decks = [...byDeck].map(([key, cards]) => {
    const path = String(deckName.get(key) || 'Anki').split('::').map(s => s.trim()).filter(Boolean);
    return { key, path, name: path[path.length - 1] || 'Anki', cards };
  }).sort((a, b) => a.path.join('\x00').localeCompare(b.path.join('\x00')));
  const total = decks.reduce((s, d) => s + d.cards.length, 0);
  return { decks, types: [...types.values()], images, total, skipped, notes };
}

// Historial de Anki (revlog) de unas tarjetas → respuestas con el formato de Flaski, y primera y última vez
export function ankiHistory(revlog, ankiIds) {
  const want = new Set(ankiIds), events = [], seen = new Map(), started = new Set();
  for (const r of [...revlog].sort((a, b) => a.id - b.id)) {
    if (!want.has(r.cid) || !(r.ease >= 1 && r.ease <= 4) || r.type > 2) continue;
    const s = seen.get(r.cid) || { first: r.id, last: r.id };
    s.last = r.id; seen.set(r.cid, s);
    const state = !started.has(r.cid) ? 'new' : r.type === 1 ? 'review' : r.type === 2 ? 'relearning' : 'learning';
    started.add(r.cid);
    events.push({ anki: r.cid, ts: new Date(r.id).toISOString(), grade: r.ease, state, ivl: Math.max(0, r.ivl), last_ivl: Math.max(0, r.lastIvl), ease: r.factor ? r.factor / 1000 : 2.5, ms: Math.min(120e3, Math.max(0, r.time || 0)), t: r.id });
  }
  return { events, seen };
}
