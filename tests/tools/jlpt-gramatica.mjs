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
const files = fs.readdirSync(from).filter(f => /^\d\d-.*\.md$/.test(f)).sort();
let count = 0;
const titles = [];
for (const f of files) {
  const text = fs.readFileSync(path.join(from, f), 'utf8').replace(/\r\n/g, '\n');
  const sp = splitPagePaste(text);
  titles.push(sp.md.match(/^# (.+)$/m)[1].trim());
  count += notesToDeck(sp.data).cards.length;
  fs.writeFileSync(path.join(to, f), text);
}
const curso = {
  name: 'JLPT N5 · Gramática', folder: 'JLPT N5', lang: 'ja-JP', count,
  description: 'Toda la gramática del N5 en 12 apuntes cortos, con ejemplos, tablas, la trampa de siempre y preguntas como las del examen: completar, ordenar y elegir.',
  source: 'Temario contrastado con cuatro listas del N5 (JLPT Sensei, Bunpro, Minna no Nihongo I y TRY! N5) y con las preguntas de ejemplo oficiales. Explicaciones, ejemplos y preguntas escritos para Flaski; en cada apunte, la lección de Minna no Nihongo donde sale.',
  titles, files: files.map(f => 'jlpt-n5/' + f)
};
fs.writeFileSync(path.join(to, 'index.json'), JSON.stringify(curso, null, 2) + '\n');
const idxFile = path.join(root, 'decks/index.json');
const idx = JSON.parse(fs.readFileSync(idxFile, 'utf8')).filter(d => d.file !== 'jlpt-n5/index.json');
idx.unshift({ file: 'jlpt-n5/index.json', lang: 'ja-JP', name: curso.name, description: curso.description, count, objetivo: 'idiomas', icono: '文', apuntes: files.length });
fs.writeFileSync(idxFile, JSON.stringify(idx, null, 2) + '\n');
console.log(files.length, 'apuntes,', count, 'preguntas');
