// CSV: leer y escribir mazos como hojas de cálculo.
// Sin dependencias, así que se puede probar aparte.
//
// Al LEER acepta:
//  - separador coma, punto y coma o tabulador (lo detecta solo)
//  - comillas dobles para textos con separadores, saltos de línea o comillas ("" = una comilla)
//  - una fila de cabecera opcional. Si la hay, reconoce las columnas por nombre:
//      pregunta / front / anverso / question …   → pregunta
//      respuesta / back / reverso / answer …     → respuesta
//      nota / note / notas / ejemplo …           → nota
//    Si no hay cabecera: columna 1 = pregunta, 2 = respuesta, 3 = nota.
//  - archivos exportados desde Anki como texto (ignora las líneas que empiezan por #)
//
// Al ESCRIBIR usa punto y coma y BOM UTF-8, que es lo que espera Excel en español
// (Google Sheets, Numbers y Anki también lo abren sin problemas).

const FRONT = ['pregunta', 'front', 'anverso', 'frente', 'delante', 'question', 'term', 'termino', 'término', 'palabra', 'word'];
const BACK = ['respuesta', 'back', 'reverso', 'detras', 'detrás', 'answer', 'definition', 'definicion', 'definición', 'significado', 'traduccion', 'traducción', 'meaning'];
const NOTE = ['nota', 'notas', 'note', 'notes', 'ejemplo', 'ejemplos', 'example', 'extra', 'comentario'];

function detectDelimiter(text) {
  const firstLine = text.split(/\r?\n/).find(l => l.trim() && !l.startsWith('#')) || '';
  const counts = { ';': 0, ',': 0, '\t': 0 };
  let quoted = false;
  for (const ch of firstLine) {
    if (ch === '"') quoted = !quoted;
    else if (!quoted && ch in counts) counts[ch]++;
  }
  const best = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  return best[1] > 0 ? best[0] : ',';
}

// Devuelve una lista de filas, cada una una lista de celdas (texto)
export function parseCSV(text, delimiter) {
  text = String(text).replace(/^﻿/, '');
  // Directivas de Anki (#separator:tab, #html:true…)
  const anki = text.match(/^#separator:(\w+)/m);
  if (!delimiter && anki) delimiter = { tab: '\t', semicolon: ';', comma: ',', pipe: '|' }[anki[1].toLowerCase()];
  text = text.split(/\r?\n/).filter(l => !/^#(separator|html|tags|columns|notetype|deck|guid|notetype column|deck column|guid column|tags column|if matches):/i.test(l)).join('\n');
  const d = delimiter || detectDelimiter(text);

  const rows = [];
  let row = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; } else quoted = false;
      } else cell += ch;
    } else if (ch === '"' && cell === '') {
      quoted = true;
    } else if (ch === d) {
      row.push(cell); cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else {
      cell += ch;
    }
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.filter(r => r.some(c => c.trim() !== ''));
}

const clean = s => s.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const findCol = (header, names) => header.findIndex(h => names.map(clean).includes(clean(h)));

// CSV → { cards: [{front, back, note}], skipped, hadHeader }
export function cardsFromCSV(text) {
  const rows = parseCSV(text);
  if (!rows.length) throw new Error('El archivo está vacío');
  let fi = 0, bi = 1, ni = 2, start = 0;
  const header = rows[0];
  const hf = findCol(header, FRONT), hb = findCol(header, BACK);
  if (hf >= 0 && hb >= 0) {
    fi = hf; bi = hb; ni = findCol(header, NOTE); start = 1;
  }
  let skipped = 0;
  const cards = [];
  for (const r of rows.slice(start)) {
    const front = (r[fi] || '').trim(), back = (r[bi] || '').trim();
    if (!front || !back) { skipped++; continue; }
    cards.push({ front, back, note: ni >= 0 ? (r[ni] || '').trim() : '' });
  }
  if (!cards.length) throw new Error('No se encontraron tarjetas. Cada fila necesita al menos pregunta y respuesta.');
  return { cards, skipped, hadHeader: start === 1 };
}

// tarjetas → texto CSV
export function cardsToCSV(cards, delimiter = ';') {
  const q = v => {
    const s = String(v ?? '');
    return /["\r\n]/.test(s) || s.includes(delimiter) || /^\s|\s$/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [['pregunta', 'respuesta', 'nota'], ...cards.map(c => [c.front, c.back, c.note || ''])]
    .map(r => r.map(q).join(delimiter));
  return '﻿' + lines.join('\r\n') + '\r\n';
}
