// Preguntas de entender: «Explícalo con tus palabras» y «¿Qué pasaría si…?». Ideas clave, qué ideas salen en lo que
// escribiste o dictaste, efectos ↑ = ↓ y el botón que se propone. Sin dependencias de la interfaz.

// Sin tildes ni mayúsculas, como el buscador (la ñ cuenta)
const fold = s => String(s ?? '').toLocaleLowerCase().replace(/ñ/g, '\u0001').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\u0001/g, 'ñ');
const STOP = new Set(['para', 'pero', 'porque', 'como', 'cuando', 'donde', 'desde', 'hasta', 'entre', 'sobre', 'tras', 'contra', 'sin', 'con', 'que', 'los', 'las', 'del', 'una', 'unos', 'unas', 'este', 'esta', 'esto', 'estos', 'estas', 'ese', 'esa', 'eso', 'esos', 'esas', 'aquel', 'muy', 'mas', 'menos', 'tambien', 'solo', 'cada', 'todo', 'toda', 'todos', 'todas', 'otro', 'otra', 'otros', 'otras', 'hace', 'hacer', 'puede', 'pueden', 'tiene', 'tienen', 'sino', 'aunque', 'ademas', 'entonces', 'algo', 'nada', 'mismo', 'misma', 'antes', 'despues', 'luego', 'asi', 'bien', 'cosa', 'cosas', 'segun', 'durante', 'mediante', 'dentro', 'fuera', 'mucho', 'mucha', 'muchos', 'muchas', 'poco', 'poca', 'pocos', 'pocas', 'hay', 'era', 'eran', 'fue', 'fueron', 'son', 'ser', 'estar', 'esta', 'estan']);
// La raíz de una palabra: sin plural ni género, para que «célula» y «células», «bajo» y «baja» cuenten igual
export function stem(w) {
  let s = fold(w);
  if (s.length > 4 && /[^aeiou]es$/.test(s)) s = s.slice(0, -2);
  else if (s.length > 3 && s.endsWith('s')) s = s.slice(0, -1);
  if (s.length > 3 && /[aeo]$/.test(s)) s = s.slice(0, -1);
  return s;
}
// Las palabras que importan de un texto (raíces), sin las vacías
export function keyWords(text) {
  return fold(text).split(/[^a-zñ0-9]+/).filter(w => w.length >= 4 && !STOP.has(w)).map(stem);
}
// Una idea sale en lo escrito si están al menos la mitad de sus palabras importantes (y una como poco)
export function ideaHit(idea, text) {
  const want = [...new Set(keyWords(idea))], have = new Set(keyWords(text));
  if (!want.length) return false;
  return want.filter(w => have.has(w)).length >= Math.max(1, Math.ceil(want.length / 2));
}
// Las ideas clave: una por línea (sin viñetas)
export const ideasOf = text => String(text ?? '').split('\n').map(l => l.replace(/^\s*(?:[-*•·]|\d+[.)])\s*/, '').trim()).filter(Boolean);
// Ideas a partir de una respuesta en prosa (de los temas de ejemplo): se parte por «;», por frases y por «pero»
export function ideasFromAnswer(a) {
  const parts = String(a ?? '').split(/;\s*|\.\s+(?=[A-ZÁÉÍÓÚÑ¿¡])|,?\s+pero\s+/).map(x => x.trim().replace(/\.$/, '')).filter(Boolean);
  return parts.map(x => x.charAt(0).toLocaleUpperCase() + x.slice(1));
}
// Todas → «Lo sé explicar» (3) · la mitad o más → «A medias» (2) · menos → «Todavía no» (1)
export const suggestGrade = (hits, total) => (!total ? 0 : hits >= total ? 3 : hits * 2 >= total ? 2 : 1);
export const verdictText = (hits, total) => `${hits} de ${total} → ${['', 'todavía no', 'a medias', 'lo sabes explicar'][suggestGrade(hits, total)]}`;

// Efectos de «¿Qué pasaría si…?»: «Inversión: baja», «Ahorro ↑», «Precios = » → [{ name, dir: 'up' | 'eq' | 'down' }]
const UP = /^(↑|sube|suben|aumenta|aumentan|crece|crecen|mas|más|mayor|al alza|\+)$/i;
const DOWN = /^(↓|baja|bajan|disminuye|disminuyen|cae|caen|menos|menor|a la baja|-|−)$/i;
const EQ = /^(=|igual|iguales|no cambia|no cambian|se mantiene|se mantienen|sin cambios)$/i;
export function parseEffects(text) {
  const out = [];
  for (const line of String(text ?? '').split('\n')) {
    const m = /^\s*(.+?)\s*(?::|→|->)?\s*(↑|↓|=|[a-záéíóúñ+\-− ]+)\s*$/i.exec(line);
    if (!m) continue;
    const word = m[2].trim(), dir = UP.test(word) ? 'up' : DOWN.test(word) ? 'down' : EQ.test(word) ? 'eq' : null;
    const name = m[1].replace(/[:→-]\s*$/, '').trim();
    if (dir && name) out.push({ name, dir });
  }
  return out;
}
