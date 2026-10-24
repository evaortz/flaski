// Batería de sugerencias (docs/rediseno/sugerencias): importa cada apunte de ejemplo, ejecuta suggestCards y lo
// compara con las preguntas esperadas. Uso, desde tests/:  node sugerencias.mjs [--detalle]
// También lo usa unit/sugerencias.test.js (medir()) para que la cobertura no baje.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { suggestCards, plainText } from '../js/suggest.js';
import { markdownToPage } from '../js/notesio.js';

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'docs', 'rediseno', 'sugerencias');
// Palabras vacías e interrogativos (no dicen de qué va la pregunta); cada palabra se compara por sus 5 primeras
// letras, para que «ratificada» y «ratificó» o «publicación» y «publicó» cuenten igual
const STOP = new Set('a al ante con de del desde el en entre es la las lo los o para por que se segun su sus un una unos unas y e u ni como cual cuales cuando donde cuanto cuantos cuanta cuantas quien quienes son fue ser esta este estos estas esta estan ha han hay'.split(' '));
const fold = s => plainText(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const toks = s => new Set(fold(s).replace(/[^\p{L}\p{N}]+/gu, ' ').split(' ').filter(w => w && !STOP.has(w)).map(w => w.slice(0, 5)));
// Qué parte de a está en b (0 a 1)
const cover = (a, b) => { if (!a.size) return 1; let n = 0; for (const w of a) if (b.has(w)) n++; return n / a.size; };
const hole = s => [...String(s).matchAll(/\{\{(.+?)(?:::.+?)?\}\}/g)].map(m => m[1]).join(' · ');

// Tipos de Flaski que valen para cada tipo esperado
const OK_TYPES = { basic: ['basic', 'type'], cloze: ['cloze', 'clozechoice'], number: ['number'], choice: ['choice', 'clozechoice'], truefalse: ['truefalse'],
  match: ['match'], steps: ['steps'], sort: ['sort'], explain: ['explain'], whatif: ['whatif'] };

// Pregunta y respuesta de una sugerencia, en texto
function qa(s) {
  const f = s.fields || {};
  if (s.typeId === 'cloze' || s.typeId === 'clozechoice') return { q: plainText(f.x), a: hole(f.x) };
  if (s.typeId === 'truefalse') return { q: f.s, a: f.v === 'F' ? 'Falso' : 'Verdadero' };
  if (s.typeId === 'match') return { q: f.t || 'Une', a: f.p };
  if (s.typeId === 'steps') return { q: f.q, a: f.s };
  if (s.typeId === 'sort') return { q: f.q || '', a: f.g };
  return { q: s.front, a: s.back };
}
function expectedQA(x) {
  if (x.tipo === 'cloze') return { q: plainText(x.pregunta), a: hole(x.pregunta) || x.respuesta };
  if (x.tipo === 'truefalse') return { q: x.pregunta, a: /^falso/i.test(x.respuesta) ? 'Falso' : 'Verdadero' };
  return { q: x.pregunta, a: x.respuesta };
}
// ¿Casan? Las palabras de la pregunta y de la respuesta esperadas tienen que estar (casi todas) en la sugerencia,
// y la sugerencia no puede ser mucho más larga (una frase entera no «pregunta lo mismo» que un dato)
export function score(x, s) {
  const types = [x.tipo, ...(x.tipo_alt || [])].flatMap(t => OK_TYPES[t] || [t]);
  if (!types.includes(s.typeId)) return 0;
  const e = expectedQA(x), g = qa(s);
  const eq = toks(e.q), gq = toks(g.q), ea = toks(e.a), ga = toks(g.a);
  if (x.tipo === 'number' || s.typeId === 'number') {
    if (fold(e.a).replace(/\D/g, '') !== fold(g.a).replace(/\D/g, '')) return 0;
  } else if (x.tipo === 'truefalse') {
    if (e.a !== g.a) return 0;
  } else if (cover(ea, ga) < 0.6 || cover(ga, ea) < 0.4) return 0;
  // En un hueco la pregunta es la frase entera: lo que cuenta es la frase sin la respuesta
  if (s.typeId === 'cloze' || s.typeId === 'clozechoice') { for (const w of ga) gq.delete(w); for (const w of ea) eq.delete(w); }
  const qe = cover(eq, gq), qg = cover(gq, eq);
  if (qe < 0.6 || qg < 0.35) return 0;
  return qe + qg;
}

export function medir() {
  const report = [];
  for (const f of fs.readdirSync(path.join(DIR, 'esperadas')).filter(f => f.endsWith('.json')).sort()) {
    const name = f.replace(/\.json$/, '');
    const expected = JSON.parse(fs.readFileSync(path.join(DIR, 'esperadas', f), 'utf8'));
    const md = fs.readFileSync(path.join(DIR, 'apuntes', name + '.md'), 'utf8');
    const page = { id: name, ...markdownToPage(md, name + '.md') };
    const list = suggestCards(page, { native: 'es-ES' });
    const noiseFile = path.join(DIR, 'ruido', f);
    const noise = fs.existsSync(noiseFile) ? JSON.parse(fs.readFileSync(noiseFile, 'utf8')) : [];
    // Cada esperada con su mejor sugerencia (cada sugerencia vale solo para una)
    const pairs = expected.flatMap((x, i) => list.map((s, j) => ({ i, j, v: score(x, s) }))).filter(p => p.v).sort((a, b) => b.v - a.v);
    const hit = new Map(), taken = new Set();
    for (const p of pairs) if (!hit.has(p.i) && !taken.has(p.j)) { hit.set(p.i, p.j); taken.add(p.j); }
    const imp = expected.map((x, i) => i).filter(i => expected[i].prioridad === 'imprescindible');
    const rest = list.filter((s, j) => !taken.has(j));
    report.push({
      name, expected, list, hit,
      imp: { ok: imp.filter(i => hit.has(i)).length, of: imp.length },
      all: { ok: hit.size, of: expected.length },
      noise: rest.filter(s => noise.includes(s.front)).length,
      unmatched: rest,
    });
  }
  return report;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const detail = process.argv.includes('--detalle');
  const pct = ({ ok, of }) => `${ok}/${of} (${Math.round((ok / of) * 100)} %)`;
  for (const r of medir()) {
    console.log(`\n== ${r.name}: imprescindibles ${pct(r.imp)} · total ${pct(r.all)} · sugerencias ${r.list.length} · ruido ${r.noise} · sin pareja ${r.unmatched.length}`);
    const byRule = {};
    r.expected.forEach((x, i) => { if (!r.hit.has(i)) (byRule[x.regla] ||= []).push(`${x.prioridad[0].toUpperCase()} ${x.pregunta} → ${x.respuesta}`); });
    for (const [rule, xs] of Object.entries(byRule)) { console.log(`  faltan · ${rule}`); for (const x of xs) console.log(`    ${x}`); }
    if (detail) {
      console.log('  casan:');
      r.expected.forEach((x, i) => { if (r.hit.has(i)) { const s = r.list[r.hit.get(i)]; console.log(`    ${x.pregunta}\n      ← [${s.typeId}] ${s.front} → ${s.back}`); } });
      console.log('  sin pareja:');
      for (const s of r.unmatched) console.log(`    [${s.typeId}/${s.kind}] ${s.front} → ${s.back.replace(/\n/g, ' | ')}`);
    }
  }
}
