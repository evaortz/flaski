// Publica la gramática del N5 en Explorar: copia los apuntes de docs/rediseno/japones/n5 (NN-*.md, el borrador
// revisado) a decks/jlpt-n5/, escribe su índice y su entrada en decks/index.json.
// Uso, desde tests/: node tools/jlpt-gramatica.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { splitPagePaste, notesToDeck } from '../../js/notes.js';

const root = fileURLToPath(new URL('../../', import.meta.url));
const from = path.join(root, 'docs/rediseno/japones/n5'), to = path.join(root, 'decks/jlpt-n5');
fs.mkdirSync(to, { recursive: true });
// Los 12 de gramática y, detrás, los 4 textos para «Leer» (lecturas/L*.md)
const files = [...fs.readdirSync(from).filter(f => /^\d\d-.*\.md$/.test(f)).sort(), ...fs.readdirSync(path.join(from, 'lecturas')).filter(f => /^L\d-.*\.md$/.test(f)).sort().map(f => 'lecturas/' + f)];
let count = 0;
const titles = [];
for (const f of files) {
  const text = fs.readFileSync(path.join(from, f), 'utf8').replace(/\r\n/g, '\n');
  const sp = splitPagePaste(text);
  titles.push(sp.md.match(/^# (.+)$/m)[1].trim());
  count += notesToDeck(sp.data).cards.length;
  fs.mkdirSync(path.dirname(path.join(to, f)), { recursive: true });
  fs.writeFileSync(path.join(to, f), text);
}
const curso = {
  name: 'JLPT N5 · Gramática', folder: 'JLPT N5', lang: 'ja-JP', count,
  description: 'Toda la gramática del N5 en 12 apuntes cortos, con ejemplos, tablas, la trampa de siempre y preguntas como las del examen (completar, ordenar y elegir), y 4 textos para leer con «Leer».',
  source: 'Temario contrastado con cuatro listas del N5 (JLPT Sensei, Bunpro, Minna no Nihongo I y TRY! N5) y con las preguntas de ejemplo oficiales. Explicaciones, ejemplos y preguntas escritos para Flaski; en cada apunte, la lección de Minna no Nihongo donde sale.',
  titles, files: files.map(f => 'jlpt-n5/' + f)
};
fs.writeFileSync(path.join(to, 'index.json'), JSON.stringify(curso, null, 2) + '\n');
const idxFile = path.join(root, 'decks/index.json');
const idx = JSON.parse(fs.readFileSync(idxFile, 'utf8')).filter(d => !d.file.startsWith('jlpt-n5/'));
// «De oído» (decks/jlpt-n5/oido.json, escrita a mano): una lista normal, a la carpeta «JLPT N5»
const oido = JSON.parse(fs.readFileSync(path.join(to, 'oido.json'), 'utf8'));
idx.unshift(
  { file: 'jlpt-n5/index.json', lang: 'ja-JP', name: curso.name, description: curso.description, count, objetivo: 'idiomas', icono: '文', apuntes: files.length },
  { file: 'jlpt-n5/oido.json', lang: 'ja-JP', name: oido.name, description: 'Escuchas una frase con la voz del móvil y eliges la respuesta: precios, horas, fechas, días, cantidades y frases de cada día, como en la comprensión oral del N5.', count: notesToDeck(oido).cards.length, objetivo: 'idiomas', icono: '耳' });
fs.writeFileSync(idxFile, JSON.stringify(idx, null, 2) + '\n');
console.log(files.length, 'apuntes,', count, 'preguntas');
