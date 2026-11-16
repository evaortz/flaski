// Japonés · las formas de los verbos y adjetivos, y el camino de vuelta (飲みました → 飲む, «pasado cortés»).
// El grupo de cada verbo viene del diccionario (JMdict): v1 (en る: 食べる), v5x (en う: 飲む, v5m), vs (する),
// vk (来る); los adjetivos en い son 'i'.

// Verbos en う: la vocal de cada forma según la última sílaba
const G = {
  う: ['い', 'わ', 'え', 'お', 'って', 'った'], く: ['き', 'か', 'け', 'こ', 'いて', 'いた'], ぐ: ['ぎ', 'が', 'げ', 'ご', 'いで', 'いだ'],
  す: ['し', 'さ', 'せ', 'そ', 'して', 'した'], つ: ['ち', 'た', 'て', 'と', 'って', 'った'], ぬ: ['に', 'な', 'ね', 'の', 'んで', 'んだ'],
  ぶ: ['び', 'ば', 'べ', 'ぼ', 'んで', 'んだ'], む: ['み', 'ま', 'め', 'も', 'んで', 'んだ'], る: ['り', 'ら', 'れ', 'ろ', 'って', 'った'],
};
// Las formas, en orden: id, nombre y para qué sirve (lo que se ve en la familia del verbo)
export const FORMS = [
  { id: 'masu', name: 'cortés', es: 'como', help: 'La forma educada del presente.' },
  { id: 'nai', name: 'negativa', es: 'no como', help: 'Decir que no lo haces.' },
  { id: 'ta', name: 'pasado', es: 'comí', help: 'Lo que ya hiciste.' },
  { id: 'te', name: 'て', es: 'come… y', help: 'Para unir acciones o pedir algo: «…, por favor».' },
  { id: 'tai', name: 'quiero', es: 'quiero comer', help: 'Lo que quieres hacer.' },
  { id: 'pot', name: 'puedo', es: 'puedo comer', help: 'Lo que puedes hacer.' },
  { id: 'vol', name: 'vamos a', es: 'comamos', help: 'Proponer hacerlo juntos.' },
  { id: 'ba', name: 'si…', es: 'si como', help: 'La condición: «si lo haces…».' },
];
export const N5_FORMS = ['masu', 'nai', 'ta', 'te'];

// La clase que usa el motor a partir de las etiquetas del diccionario: 'v1' | 'v5' | 'vs' | 'vk' | 'i' | ''
export function verbClass(pos = []) {
  if (pos.includes('v1')) return 'v1';
  if (pos.some(p => p.startsWith('v5'))) return 'v5';
  if (pos.includes('vk')) return 'vk';
  if (pos.includes('vs') || pos.includes('vz')) return 'vs';
  if (pos.includes('i')) return 'i';
  return '';
}
export const isVerb = pos => ['v1', 'v5', 'vk', 'vs'].includes(verbClass(pos));

// Las formas de un verbo en su forma de diccionario. cls: 'v1' | 'v5' | 'vk' | 'vs'. Devuelve { masu, nai, … }
export function conjugate(word, cls) {
  if (cls === 'vs' && !word.endsWith('する')) word += 'する';
  if (cls === 'vk' || word.endsWith('来る') || word === 'くる') {
    const st = word.slice(0, -2), k = word.endsWith('来る');
    return { masu: st + (k ? '来ます' : 'きます'), nai: st + (k ? '来ない' : 'こない'), ta: st + (k ? '来た' : 'きた'), te: st + (k ? '来て' : 'きて'),
      tai: st + (k ? '来たい' : 'きたい'), pot: st + (k ? '来られる' : 'こられる'), vol: st + (k ? '来よう' : 'こよう'), ba: st + (k ? '来れば' : 'くれば') };
  }
  if (cls === 'vs') {
    const st = word.slice(0, -2);
    return { masu: st + 'します', nai: st + 'しない', ta: st + 'した', te: st + 'して', tai: st + 'したい', pot: st + 'できる', vol: st + 'しよう', ba: st + 'すれば' };
  }
  if (cls === 'v1') {
    const st = word.slice(0, -1);
    return { masu: st + 'ます', nai: st + 'ない', ta: st + 'た', te: st + 'て', tai: st + 'たい', pot: st + 'られる', vol: st + 'よう', ba: st + 'れば' };
  }
  const end = word.at(-1), g = G[end];
  if (!g) return null;
  const st = word.slice(0, -1);
  const f = { masu: st + g[0] + 'ます', nai: st + g[1] + 'ない', ta: st + g[5], te: st + g[4], tai: st + g[0] + 'たい', pot: st + g[2] + 'る', vol: st + g[3] + 'う', ba: st + g[2] + 'ば' };
  // Excepciones: 行く (行って), ある (ない)
  if (word.endsWith('行く') || word.endsWith('いく')) { f.te = st + 'って'; f.ta = st + 'った'; }
  if (word === 'ある' || word.endsWith('ある') && word.length === 2) f.nai = 'ない';
  return f;
}
// La regla corta de una forma, para explicarla al fallar: «む → んで»
export function ruleOf(word, cls, form) {
  if (cls === 'v1') return { masu: 'る → ます', nai: 'る → ない', ta: 'る → た', te: 'る → て', tai: 'る → たい', pot: 'る → られる', vol: 'る → よう', ba: 'る → れば' }[form];
  if (cls === 'vs') return { masu: 'する → します', nai: 'する → しない', ta: 'する → した', te: 'する → して', tai: 'する → したい', pot: 'する → できる', vol: 'する → しよう', ba: 'する → すれば' }[form];
  if (cls === 'vk') return '来る es irregular';
  const end = word.at(-1), g = G[end];
  if (!g) return '';
  if (word.endsWith('行く') && (form === 'te' || form === 'ta')) return `行く es especial: ${form === 'te' ? '行って' : '行った'}`;
  return `${end} → ${{ masu: g[0] + 'ます', nai: g[1] + 'ない', ta: g[5], te: g[4], tai: g[0] + 'たい', pot: g[2] + 'る', vol: g[3] + 'う', ba: g[2] + 'ば' }[form]}`;
}

/* ---------- el camino de vuelta ---------- */
// Terminaciones que se añaden a una forma (para encadenar: 食べています → 食べて → 食べる)
const AUX = [['ています', 'て', 'está …-ndo (cortés)'], ['ていました', 'て', 'estaba …-ndo (cortés)'], ['ている', 'て', 'está …-ndo'], ['ていた', 'て', 'estaba …-ndo'],
  ['でいます', 'で', 'está …-ndo (cortés)'], ['でいる', 'で', 'está …-ndo'], ['てください', 'て', 'por favor'], ['でください', 'で', 'por favor']];
const POLITE = [['ませんでした', 'pasado negativo cortés'], ['ました', 'pasado cortés'], ['ません', 'negativa cortés'], ['ましょう', 'vamos a (cortés)'], ['ます', 'cortés']];
const PLAIN = [['なかった', 'nai', 'pasado negativo'], ['ない', 'nai', 'negativa'], ['たかった', 'tai', 'quería'], ['たい', 'tai', 'quiero'], ['ば', 'ba', 'si…']];

// [{ base, cls, reason }]: las formas de diccionario posibles de una palabra conjugada (sin comprobar en el diccionario)
export function deinflect(w) {
  const out = [], add = (base, cls, reason) => { if (base && base !== w) out.push({ base, cls, reason }); };
  // Cortés: quitar ます… y volver de la forma い (raíz)
  for (const [suf, reason] of POLITE) if (w.endsWith(suf)) fromStem(w.slice(0, -suf.length), reason, add);
  // て / た
  for (const [cls, list] of Object.entries(teTa())) for (const [suf, end, reason] of list) if (w.endsWith(suf)) add(w.slice(0, -suf.length) + end, cls, reason);
  for (const [suf, kind, reason] of PLAIN) {
    if (!w.endsWith(suf)) continue;
    const st = w.slice(0, -suf.length);
    if (kind === 'tai') fromStem(st, reason, add);
    else if (kind === 'nai') { add(st + 'る', 'v1', reason); for (const [end, g] of Object.entries(G)) if (st.endsWith(g[1])) add(st.slice(0, -1) + end, 'v5', reason); if (st.endsWith('し')) add(st.slice(0, -1) + 'する', 'vs', reason); if (st.endsWith('こ')) add(st.slice(0, -1) + 'くる', 'vk', reason); }
    else if (kind === 'ba') { if (st.endsWith('れ')) add(st.slice(0, -1) + 'る', 'v1', reason); for (const [end, g] of Object.entries(G)) if (st.endsWith(g[2])) add(st.slice(0, -1) + end, 'v5', reason); }
  }
  // Volitiva y potencial
  if (w.endsWith('よう')) add(w.slice(0, -2) + 'る', 'v1', 'vamos a');
  for (const [end, g] of Object.entries(G)) {
    if (w.endsWith(g[3] + 'う')) add(w.slice(0, -2) + end, 'v5', 'vamos a');
    if (w.endsWith(g[2] + 'る')) add(w.slice(0, -2) + end, 'v5', 'puedo');
  }
  if (w.endsWith('られる')) add(w.slice(0, -3) + 'る', 'v1', 'puedo');
  // Adjetivos en い
  for (const [suf, reason] of [['くなかった', 'pasado negativo'], ['かった', 'pasado'], ['くない', 'negativa'], ['くて', 'y…'], ['ければ', 'si…'], ['く', 'adverbio']]) if (w.endsWith(suf)) add(w.slice(0, -suf.length) + 'い', 'i', reason);
  // Con un auxiliar detrás (食べています): primero el auxiliar
  for (const [suf, keep, reason] of AUX) if (w.endsWith(suf)) for (const d of deinflect(w.slice(0, -suf.length) + keep)) add(d.base, d.cls, reason);
  return out;
}
function fromStem(st, reason, add) {
  if (!st) return;
  add(st + 'る', 'v1', reason);
  for (const [end, g] of Object.entries(G)) if (st.endsWith(g[0])) add(st.slice(0, -1) + end, 'v5', reason);
  if (st.endsWith('し')) add(st.slice(0, -1) + 'する', 'vs', reason);
  if (st.endsWith('き')) add(st.slice(0, -1) + 'くる', 'vk', reason);
  if (st.endsWith('来')) add(st + 'る', 'vk', reason);
}
function teTa() {
  const out = { v1: [['て', 'る', 'forma て'], ['た', 'る', 'pasado']], v5: [], vs: [['して', 'する', 'forma て'], ['した', 'する', 'pasado']], vk: [['きて', 'くる', 'forma て'], ['きた', 'くる', 'pasado'], ['来て', '来る', 'forma て'], ['来た', '来る', 'pasado']] };
  for (const [end, g] of Object.entries(G)) { out.v5.push([g[4], end, 'forma て'], [g[5], end, 'pasado']); }
  out.v5.push(['って', 'く', 'forma て'], ['った', 'く', 'pasado']);   // 行く → 行って
  return out;
}
