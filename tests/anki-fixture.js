// Crea archivos .apkg de prueba como los que exporta Anki, en el formato antiguo (JSON en «col»)
// y en el nuevo (tablas notetypes, fields, templates y decks, configuración en protobuf).
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// PNG de 2×2 píxeles
export const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP8z8DAwMDAxMDAwMDAAAANHQEDasKb6QAAAABJRU5ErkJggg==', 'base64');
const CRT = 1700000000;   // creación de la colección (segundos)
export const DAY0 = CRT * 1000;

/* ZIP sin compresión */
const CRC = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = b => { let c = 0xffffffff; for (const x of b) c = CRC[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
export function zip(files) {
  const locals = [], centrals = [];
  let off = 0;
  for (const [name, data] of Object.entries(files)) {
    const nb = Buffer.from(name), d = Buffer.from(data), crc = crc32(d);
    const h = Buffer.alloc(30); h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(20, 4); h.writeUInt32LE(crc, 14); h.writeUInt32LE(d.length, 18); h.writeUInt32LE(d.length, 22); h.writeUInt16LE(nb.length, 26);
    const c = Buffer.alloc(46); c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt32LE(crc, 16); c.writeUInt32LE(d.length, 20); c.writeUInt32LE(d.length, 24); c.writeUInt16LE(nb.length, 28); c.writeUInt32LE(off, 42);
    locals.push(h, nb, d); centrals.push(c, nb);
    off += 30 + nb.length + d.length;
  }
  const cd = Buffer.concat(centrals), e = Buffer.alloc(22);
  e.writeUInt32LE(0x06054b50, 0); e.writeUInt16LE(centrals.length / 2, 8); e.writeUInt16LE(centrals.length / 2, 10); e.writeUInt32LE(cd.length, 12); e.writeUInt32LE(off, 16);
  return Buffer.concat([...locals, cd, e]);
}

/* Protobuf: solo cadenas y enteros */
const vint = n => { const o = []; do { let b = n % 128; n = Math.floor(n / 128); if (n) b |= 128; o.push(b); } while (n); return o; };
const pb = fields => Buffer.from(fields.flatMap(([no, v]) => (typeof v === 'number' ? [...vint(no * 8), ...vint(v)] : (() => { const b = Buffer.from(v); return [...vint(no * 8 + 2), ...vint(b.length), ...b]; })())));

const NOTETYPES = [
  { id: 1001, name: 'Basic', cloze: false, fields: ['Front', 'Back'], tmpls: [{ name: 'Card 1', q: '{{Front}}', a: '{{FrontSide}}<hr id=answer>{{Back}}' }] },
  { id: 1002, name: 'Basic (and reversed card)', cloze: false, fields: ['Front', 'Back'], tmpls: [{ name: 'Card 1', q: '{{Front}}', a: '{{FrontSide}}<hr id=answer>{{Back}}' }, { name: 'Card 2', q: '{{Back}}', a: '{{FrontSide}}<hr id=answer>{{Front}}' }] },
  { id: 1003, name: 'Cloze', cloze: true, fields: ['Text', 'Back Extra'], tmpls: [{ name: 'Cloze', q: '{{cloze:Text}}', a: '{{cloze:Text}}<br>{{Back Extra}}' }] },
  { id: 1004, name: 'Japanese', cloze: false, fields: ['Expression', 'Meaning', 'Reading'], tmpls: [{ name: 'Recognition', q: '{{Expression}}', a: '{{FrontSide}}<hr id=answer>{{furigana:Reading}}<br>{{Meaning}}' }] },
];
const DECKS = [{ id: 1, name: 'Default' }, { id: 2, name: 'Idiomas::Turco' }, { id: 3, name: 'Idiomas::Japonés' }];
// [id, notetype, did, campos, etiquetas, tarjetas: [ord, type, due, ivl, factor, reps, lapses]]
const NOTES = [
  [1, 1001, 2, ['<b>ev</b>', 'casa'], 'turco::básico', [[0, 2, 400, 10, 2300, 5, 1]]],
  [2, 1001, 2, ['kapı&nbsp;<img src="puerta.png">', 'puerta<br>la de casa'], '', [[0, 0, 1, 0, 0, 0, 0]]],
  [3, 1002, 2, ['su', 'agua'], '', [[0, 2, 410, 3, 2500, 2, 0], [1, 0, 2, 0, 0, 0, 0]]],
  [4, 1003, 2, ['Ev{{c1::de::lugar}} y okul{{c2::da}}', ''], '', [[0, 2, 405, 4, 2500, 3, 0], [1, 0, 3, 0, 0, 0, 0]]],
  [5, 1004, 3, ['水', 'agua', '水[みず]'], 'kanji', [[0, 1, 0, 0, 2500, 1, 0]]],
  [6, 1001, 3, ['', ''], '', [[0, 0, 4, 0, 0, 0, 0]]],   // vacía: se salta
];

function build(file, modern) {
  const db = new DatabaseSync(file);
  const models = {}, decks = {};
  for (const nt of NOTETYPES) models[nt.id] = { id: nt.id, name: nt.name, type: nt.cloze ? 1 : 0, flds: nt.fields.map((name, ord) => ({ name, ord })), tmpls: nt.tmpls.map((t, ord) => ({ name: t.name, ord, qfmt: t.q, afmt: t.a })) };
  for (const d of DECKS) decks[d.id] = { id: d.id, name: d.name };
  db.exec(`CREATE TABLE col (id integer primary key, crt integer not null, mod integer not null, scm integer not null, ver integer not null, dty integer not null, usn integer not null, ls integer not null, conf text not null, models text not null, decks text not null, dconf text not null, tags text not null);
    CREATE TABLE notes (id integer primary key, guid text not null, mid integer not null, mod integer not null, usn integer not null, tags text not null, flds text not null, sfld integer not null, csum integer not null, flags integer not null, data text not null);
    CREATE TABLE cards (id integer primary key, nid integer not null, did integer not null, ord integer not null, mod integer not null, usn integer not null, type integer not null, queue integer not null, due integer not null, ivl integer not null, factor integer not null, reps integer not null, lapses integer not null, left integer not null, odue integer not null, odid integer not null, flags integer not null, data text not null);
    CREATE TABLE revlog (id integer primary key, cid integer not null, usn integer not null, ease integer not null, ivl integer not null, lastIvl integer not null, factor integer not null, time integer not null, type integer not null);`);
  db.prepare('INSERT INTO col VALUES (1, ?, 0, 0, 11, 0, 0, 0, ?, ?, ?, ?, ?)').run(CRT, '{}', modern ? '' : JSON.stringify(models), modern ? '' : JSON.stringify(decks), '{}', '{}');
  if (modern) {
    db.exec(`CREATE TABLE notetypes (id integer NOT NULL PRIMARY KEY, name text NOT NULL, mtime_secs integer NOT NULL, usn integer NOT NULL, config blob NOT NULL);
      CREATE TABLE fields (ntid integer NOT NULL, ord integer NOT NULL, name text NOT NULL, config blob NOT NULL, PRIMARY KEY (ntid, ord)) without rowid;
      CREATE TABLE templates (ntid integer NOT NULL, ord integer NOT NULL, name text NOT NULL, mtime_secs integer NOT NULL, usn integer NOT NULL, config blob NOT NULL, PRIMARY KEY (ntid, ord)) without rowid;
      CREATE TABLE decks (id integer PRIMARY KEY NOT NULL, name text NOT NULL, mtime_secs integer NOT NULL, usn integer NOT NULL, common blob NOT NULL, kind blob NOT NULL);`);
    for (const nt of NOTETYPES) {
      db.prepare('INSERT INTO notetypes VALUES (?, ?, 0, 0, ?)').run(nt.id, nt.name, pb(nt.cloze ? [[1, 1], [3, '.card{}']] : [[3, '.card{}']]));
      nt.fields.forEach((f, ord) => db.prepare('INSERT INTO fields VALUES (?, ?, ?, ?)').run(nt.id, ord, f, pb([])));
      nt.tmpls.forEach((t, ord) => db.prepare('INSERT INTO templates VALUES (?, ?, ?, 0, 0, ?)').run(nt.id, ord, t.name, pb([[1, t.q], [2, t.a]])));
    }
    for (const d of DECKS) db.prepare('INSERT INTO decks VALUES (?, ?, 0, 0, ?, ?)').run(d.id, d.name.split('::').join('\x1f'), pb([]), pb([]));
  }
  let cid = 100;
  for (const [id, mid, did, flds, tags, cards] of NOTES) {
    db.prepare("INSERT INTO notes VALUES (?, 'g', ?, 0, 0, ?, ?, 0, 0, 0, '')").run(id, mid, tags ? ` ${tags} ` : '', flds.join('\x1f'));
    for (const [ord, type, due, ivl, factor, reps, lapses] of cards) {
      cid++;
      db.prepare("INSERT INTO cards VALUES (?, ?, ?, ?, 0, 0, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, 0, '')").run(cid, id, did, ord, type, type === 0 ? 0 : type, due, ivl, factor, reps, lapses);
      if (type) for (let r = 0; r < reps; r++) db.prepare('INSERT INTO revlog VALUES (?, ?, 0, ?, ?, ?, ?, 5000, ?)').run(DAY0 + 86400000 * (r + 1) + cid, cid, r === 0 ? 3 : 3, ivl, 0, factor, r === 0 ? 0 : 1);
    }
  }
  db.close();
}

// → Buffer del .apkg. modern: formato de Anki 2.1.50+ (sin comprimir: se lee igual)
export function makeApkg({ modern = false } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'apkg-'));
  try {
    const f = join(dir, 'c.db');
    build(f, modern);
    const db = readFileSync(f);
    return zip({ [modern ? 'collection.anki21b' : 'collection.anki2']: db, media: JSON.stringify({ 0: 'puerta.png' }), 0: PNG });
  } finally { rmSync(dir, { recursive: true, force: true }); }
}
