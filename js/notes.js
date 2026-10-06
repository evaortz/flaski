// Formato «por notas» (flaski-notes): pensado para que lo escriba una IA o una persona a mano.
// Cada nota se escribe una vez (tipo + campos + pista/etiquetas) y aquí se generan sus tarjetas
// con las mismas reglas que el editor (activeTemplates, summarize). Sin dependencias de la interfaz,
// así que se puede probar aparte. El formato está explicado en FORMATO-IA.md.
//
//   { "format": "flaski-notes", "version": 1, "name": "…", "description": "…", "lang": "ja-JP",
//     "notes": [ { "type": "vocab", "fields": { "w": "…", "t": "…" }, "hint": "…", "tags": ["…"] } ] }
//
// También vale un array de notas suelto. Las notas con errores se saltan y se explica por qué.
import { BUILTIN_TYPES, LANGS, activeTemplates, summarize, missingFor, typeFit, typeScope } from './cardtypes.js';

const TYPE_IDS = BUILTIN_TYPES.map(t => t.id);

export const isNotesDeck = d => Array.isArray(d) || (!!d && typeof d === 'object' && (d.format === 'flaski-notes' || (Array.isArray(d.notes) && !Array.isArray(d.cards))));

/* ---------------- Texto pegado ---------------- */

// Si el texto es JSON (tal cual, dentro de un bloque ```json o con frases alrededor), devuelve solo el JSON
// y sin comas sobrantes; si no lo parece (un CSV, por ejemplo), devuelve null.
export function extractJSON(text) {
  let t = String(text ?? '').replace(/^﻿/, '').trim();
  const fence = t.match(/```[\w-]*[ \t]*\r?\n([\s\S]*?)```/);
  if (fence) t = fence[1].trim();
  else if (!/^[{[]/.test(t)) {
    // «Aquí tienes tu mazo:» + JSON + «¡Que lo disfrutes!»: desde la primera línea que empieza por { o [
    const lines = t.split(/\r?\n/);
    const a = lines.findIndex(l => /^\s*[{[]/.test(l));
    const b = lines.findLastIndex(l => /[}\]]\s*$/.test(l));
    if (a < 0 || b < a || !/^\s*\{\s*$|^\s*\[\s*$|^\s*[{[]\s*"/.test(lines[a])) return null;
    t = lines.slice(a, b + 1).join('\n').trim();
  }
  if (!/^[{[]/.test(t)) return null;
  return dropTrailingCommas(t);
}

// [1, 2,] y {"a": 1,} → sin la coma final (fuera de los textos)
function dropTrailingCommas(s) {
  let out = '', inStr = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inStr) {
      out += ch;
      if (ch === '\\') { out += s[++i] ?? ''; continue; }
      if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') { inStr = true; out += ch; continue; }
    if (ch === ',') {
      let j = i + 1;
      while (/\s/.test(s[j] || '')) j++;
      if (s[j] === '}' || s[j] === ']') continue;
    }
    out += ch;
  }
  return out;
}

// Texto pegado → { kind: 'json', data } o { kind: 'csv', text }. Si es JSON mal formado, lanza un error
// que dice en qué línea está el problema.
export function parsePasted(text) {
  const raw = String(text ?? '').replace(/^﻿/, '').trim();
  if (!raw) throw new Error('No has pegado nada.');
  const json = extractJSON(raw);
  if (json === null) return { kind: 'csv', text: raw };
  try { return { kind: 'json', data: JSON.parse(json) }; }
  catch (e) { throw new Error(jsonError(json, e)); }
}
function jsonError(json, e) {
  const m = String(e.message);
  let line = Number(m.match(/line (\d+)/)?.[1]);
  const pos = Number(m.match(/position (\d+)/)?.[1]);
  if (!line && pos >= 0) line = json.slice(0, pos).split('\n').length;
  const text = line ? (json.split('\n')[line - 1] || '').trim().slice(0, 60) : '';
  return line
    ? `El JSON tiene un error en la línea ${line}${text ? `: ${text}` : ''}. Pídele a la IA que lo revise o corrígelo a mano.`
    : 'El JSON no es válido. Pídele a la IA que lo revise o corrígelo a mano.';
}

/* ---------------- Notas → tarjetas ---------------- */

const langLabel = id => LANGS.find(l => l.id === id)?.label || id;
const langName = base => (LANGS.find(l => l.id.split('-')[0] === base)?.label || base).toLowerCase();

// Un valor de campo: texto. Las listas se unen como espera cada campo: las respuestas incorrectas de
// opción múltiple con «; » y el resto con « / » (respuestas alternativas, piezas de ordenar).
function fieldText(v, isWrong) {
  if (Array.isArray(v)) return v.map(x => String(x ?? '').trim()).filter(Boolean).join(isWrong ? '; ' : ' / ');
  if (v && typeof v === 'object') return '';
  return String(v ?? '').trim();
}

// data (objeto flaski-notes o array de notas) → mazo listo para la vista previa:
// { name, description, lang, cards, types, notes, tagNames, issues: [{ n, label, reason, skipped }] }
export function notesToDeck(data) {
  const list = Array.isArray(data) ? data : data?.notes;
  if (!Array.isArray(list)) throw new Error('Falta la lista de notas («notes»).');
  const meta = Array.isArray(data) ? {} : data;
  const issues = [];
  const note = (n, label, reason, skipped) => issues.push({ n, label, reason, skipped });

  let lang = typeof meta.lang === 'string' ? meta.lang.trim() : '';
  if (lang && !LANGS.some(l => l.id && l.id.toLowerCase() === lang.toLowerCase())) {
    note(0, 'lang', `el idioma «${lang}» no está en la lista; se deja el audio de cada tipo`, false);
    lang = '';
  }
  if (lang) lang = LANGS.find(l => l.id.toLowerCase() === lang.toLowerCase()).id;

  const cards = [];
  const tagNames = new Map();     // en minúsculas → como se escribió la primera vez
  let notes = 0, needsLang = false;
  const misfit = new Set();

  list.forEach((raw, i) => {
    const n = i + 1;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return note(n, '', 'no es una nota: debe ser un objeto con "type" y "fields"', true);
    const src = raw.fields && typeof raw.fields === 'object' && !Array.isArray(raw.fields) ? raw.fields : null;
    const label = String(Object.values(src || {}).find(v => typeof v === 'string' && v.trim()) || '').trim().slice(0, 40);
    const typeId = raw.type == null || raw.type === '' ? 'basic' : String(raw.type).trim().toLowerCase();
    const base = BUILTIN_TYPES.find(t => t.id === typeId);
    if (!base) return note(n, label, `el tipo «${raw.type}» no existe (tipos: ${TYPE_IDS.join(', ')})`, true);
    if (!src) return note(n, label, 'falta "fields" con los campos de la nota', true);
    const type = base;
    // Tipos de idiomas en un mazo sin idioma: sin audio (y el dictado, sin nada que escuchar)
    if (!typeFit(type, lang)) {
      if (!lang && typeScope(type) === 'lang') {
        if (type.templates.some(t => t.mode === 'listen')) return note(n, label, `el dictado necesita que el mazo tenga idioma ("lang")`, true);
        needsLang = true;
      } else misfit.add(base.id);
    }

    const known = new Map(type.fields.map(f => [f.id, f]));
    const wrongIds = new Set(type.templates.map(t => t.wrong).filter(Boolean));
    const fields = {};
    for (const [k, v] of Object.entries(src)) {
      if (!known.has(k)) { note(n, label, `el campo «${k}» no existe en «${base.id}» y se ignora (campos: ${[...known.keys()].join(', ')})`, false); continue; }
      const text = fieldText(v, wrongIds.has(k)).slice(0, 2000);
      if (text) fields[k] = text;
    }
    const active = activeTemplates(type, fields);
    if (!active.length) return note(n, label, `falta ${missingFor(type, type.templates[0], fields)}`, true);
    if (active.length < type.templates.length) {
      const miss = type.templates.find(t => !active.includes(t));
      note(n, label, `solo crea ${active.length} de ${type.templates.length} tarjetas: para «${miss.name}» falta ${missingFor(type, miss, fields)}`, false);
    }
    const hint = typeof raw.hint === 'string' ? raw.hint.trim().slice(0, 500) : '';
    const tags = (Array.isArray(raw.tags) ? raw.tags : typeof raw.tags === 'string' ? raw.tags.split(',') : [])
      .map(t => String(t ?? '').trim().replace(/^#/, '').slice(0, 40)).filter(Boolean);
    for (const t of tags) if (!tagNames.has(t.toLocaleLowerCase())) tagNames.set(t.toLocaleLowerCase(), t);
    notes++;
    for (const tpl of active) {
      const sum = summarize(type, tpl, fields);
      cards.push({
        front: sum.front.slice(0, 2000) || '—', back: sum.back.slice(0, 2000) || '—', note: sum.note.slice(0, 2000),
        type_id: type.id, template: tpl.id, fields, note_id: `n${n}`, hint, tagNames: tags,
      });
    }
  });
  if (needsLang) note(0, 'lang', 'sin "lang", el mazo no es de idiomas y Vocabulario u Ordenar frase no tendrán audio', false);
  for (const id of misfit) {
    const t = BUILTIN_TYPES.find(x => x.id === id);
    note(0, 'lang', `«${id}» es para mazos de ${typeScope(t).map(langName).join(' o ')}${lang ? `, no de ${langLabel(lang).toLowerCase()}` : ''}`, false);
  }

  return {
    name: String(meta.name || 'Mazo importado').trim().slice(0, 80) || 'Mazo importado',
    description: String(meta.description || '').trim().slice(0, 300),
    lang, cards, notes, types: [], tagNames: [...tagNames.values()], issues,
  };
}
