// Preferencias del usuario: valores por defecto, mezcla con lo guardado y aplicación de la apariencia.
// Se guardan en settings.prefs (Supabase) o en el navegador (modo local) como un objeto JSON.
import { DEFAULT_ALGO, ALGO_PRESETS } from './srs.js';
import { emptyPlan2, absorbV1, withMirror } from './plan2-migrar.js';

export const DEFAULT_PREFS = {
  study: {
    maxReviews: 200,        // repasos máximos al día (0 = sin límite)
    newOrder: 'order',      // 'order' (como están en la lista) | 'random'
    mix: 'mixed',           // 'mixed' | 'reviewsFirst' | 'newFirst'
    buttons: 4,             // 4 = Otra vez/Difícil/Bien/Fácil · 2 = Otra vez/Bien
    showIntervals: true,    // mostrar «3 d» debajo de cada botón
    suggest: true,          // resaltar la nota sugerida en preguntas de escribir/elegir/dibujar
    burySiblings: true,     // solo una pregunta nueva de cada nota por tanda
    autoplay: true,         // leer en voz alta los campos con audio automático
    rate: 1,                // velocidad de la voz
    shortcuts: true,        // mostrar la ayuda de atajos de teclado
    swipe: true,            // móvil: deslizar la pregunta para valorarla
    swipeCount: 0,          // cuántas veces has deslizado (hasta 10: las pistas de deslizar dejan de salir)
    swipeLast: 0,           // cuándo deslizaste por última vez (tras 30 días sin deslizar vuelven las pistas)
    swipeShown: false,      // ya salieron solas las pistas de deslizar (la primera vez); luego, solo al arrastrar
    haptics: true,          // móvil: vibración breve al responder y al trazar
    sound: true,            // efectos de sonido al valorar preguntas
    nativeLang: 'es-ES',    // tu idioma: el de las traducciones en las listas de idiomas
    tandaMin: 10,           // duración de la tanda corta en minutos (5, 10, 15 o 20)
    tandaAsked: false,      // ya se ha preguntado la duración (la primera tanda)
  },
  types: { hidden: [] },    // tipos de pregunta que no quieres ver en el editor
  intro: { done: false },   // ya has visto la presentación de bienvenida
  algo: { preset: 'fsrs', custom: { ...DEFAULT_ALGO }, retention: 0.9 },   // FSRS para quien empieza
  look: {
    theme: 'system',        // 'system' | 'light' | 'dark'
    accent: 'cobalto',
    font: 'system',         // 'system' | 'serif' | 'rounded' | 'mono'
    cardSize: 'm',          // tamaño del texto de las preguntas: s | m | l | xl
    density: 'comfy',       // 'comfy' | 'compact'
    cardAlign: 'center',    // 'center' | 'left'
  },
  // plan de estudio (v: 2, ver plan2.js y plan2-migrar.js): tu tiempo, los exámenes, el reparto, lo que no tiene
  // examen, los topes, las etapas a mano y el historial; objetivo de nota y ajustes del simulacro de cada examen.
  // El de antes (nodos, semana, días especiales y etapas) se migra al entrar
  plan: emptyPlan2(),
  plan2: undefined,         // el plan nuevo de quien lo probó con el interruptor «plan2» (se pasa a plan al entrar)
  sims: [],                 // simulacros hechos (ver SYNCED y trimSims)
  remind: { on: true, time: '20:00', cheers: true },   // avisos con notificaciones: recordatorio diario y ánimos (en este dispositivo)
  home: { goal: 0, activity: true, activityPeriod: 'y1', forecast: true, progressPeriod: 'm3', decks: true, friends: true },
};

export const ACCENTS = [
  { id: 'cobalto', label: 'Cobalto' }, { id: 'violeta', label: 'Violeta' }, { id: 'ciruela', label: 'Ciruela' },
  { id: 'frambuesa', label: 'Frambuesa' }, { id: 'teja', label: 'Teja' }, { id: 'oliva', label: 'Oliva' },
  { id: 'bosque', label: 'Bosque' }, { id: 'laguna', label: 'Laguna' }, { id: 'tinta', label: 'Tinta' },
];
// Los colores de antes pasan al más parecido de los de ahora
const OLD_ACCENTS = { blue: 'cobalto', indigo: 'cobalto', purple: 'violeta', pink: 'ciruela', rose: 'frambuesa', red: 'frambuesa',
  orange: 'teja', amber: 'teja', brown: 'teja', lime: 'oliva', green: 'bosque', teal: 'laguna', cyan: 'laguna', gray: 'tinta' };
export const accentId = id => (ACCENTS.some(a => a.id === id) ? id : OLD_ACCENTS[id] || 'cobalto');
export const FONTS = [
  { id: 'system', label: 'Inter (la de la app)', short: 'Inter' }, { id: 'legible', label: 'Atkinson Hyperlegible, pensada para leerse sin esfuerzo', short: 'Legible' }, { id: 'native', label: 'La del dispositivo', short: 'Sistema' }, { id: 'serif', label: 'Serif' },
  { id: 'rounded', label: 'Redondeada' }, { id: 'mono', label: 'Monoespaciada', short: 'Mono' },
];
export const CARD_SIZES = [{ id: 's', label: 'S' }, { id: 'm', label: 'M' }, { id: 'l', label: 'L' }, { id: 'xl', label: 'XL' }];

// Explicación de cada parámetro avanzado del algoritmo (para el formulario de Ajustes)
export const ALGO_FIELDS = [
  { k: 'againMin', label: '«Otra vez» vuelve en', unit: 'min', min: 0, max: 1440, step: 1 },
  { k: 'hardNewMin', label: '«Difícil» en una nueva vuelve en', unit: 'min', min: 0, max: 1440, step: 1 },
  { k: 'gradDays', label: 'Primer intervalo con «Bien»', unit: 'días', min: 1, max: 30, step: 1 },
  { k: 'easyDays', label: 'Primer intervalo con «Fácil»', unit: 'días', min: 1, max: 60, step: 1 },
  { k: 'secondDays', label: 'Segundo intervalo', unit: 'días', min: 1, max: 60, step: 1 },
  { k: 'startEase', label: 'Facilidad inicial', unit: '×', min: 1.3, max: 5, step: 0.05 },
  { k: 'easyBonus', label: 'Extra de «Fácil»', unit: '×', min: 1, max: 3, step: 0.05 },
  { k: 'hardFactor', label: 'Multiplicador de «Difícil»', unit: '×', min: 1, max: 2, step: 0.05 },
  { k: 'intervalMod', label: 'Modificador de intervalos', unit: '×', min: 0.3, max: 3, step: 0.05 },
  { k: 'maxDays', label: 'Intervalo máximo', unit: 'días', min: 2, max: 36500, step: 1 },
  { k: 'lapseEase', label: 'Penalización al fallar', unit: '', min: 0, max: 1, step: 0.05 },
];

const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
export function mergePrefs(base, saved) {
  const out = {};
  for (const k of Object.keys(base)) {
    out[k] = isObj(base[k]) ? mergePrefs(base[k], isObj(saved?.[k]) ? saved[k] : {}) : (saved && saved[k] !== undefined ? saved[k] : base[k]);
  }
  return out;
}
// Quien ya usaba la app sin haber elegido ritmo sigue con el que tenía (el clásico); los nuevos empiezan con FSRS
export const loadPrefs = saved => {
  const p = mergePrefs(DEFAULT_PREFS, saved || {});
  if (saved && Object.keys(saved).length && !saved.algo?.preset) p.algo.preset = 'standard';
  p.look.accent = accentId(p.look.accent);
  // El plan, tal cual se guardó (sus claves son ids de exámenes, listas y carpetas, que mergePrefs no conoce)
  p.plan = normalizePlan(saved?.plan);
  for (const path of SYNCED) { const [a, b] = path; const v = b ? p[a][b] : p[a]; if (!Array.isArray(v)) { if (b) p[a][b] = []; else p[a] = []; } }
  return p;
};

// Listas que se juntan por id al sincronizar (en vez de que la copia nueva machaque a la vieja): lo creado
// en otro dispositivo no se pierde. Cada elemento lleva «at» (cuándo cambió); con el mismo id gana el más
// reciente, y lo borrado queda como { id, deleted: true, at }.
export const SYNCED = [['sims']];
const clone = o => JSON.parse(JSON.stringify(o));
// El plan con todas sus partes: el nuevo (v: 2) con lo que le falte, o el de antes como estaba (para migrarlo)
export function normalizePlan(saved) {
  if (!isObj(saved)) return emptyPlan2();
  const p = clone(saved);
  if (p.v === 2) {
    const e = emptyPlan2();
    for (const k of Object.keys(e)) if (p[k] === undefined || (isObj(e[k]) && !isObj(p[k])) || (Array.isArray(e[k]) && !Array.isArray(p[k]))) p[k] = e[k];
    p.time = { ...e.time, ...p.time };
    if (!Array.isArray(p.time.special)) p.time.special = [];
    if (!isObj(p.time.week)) p.time.week = null;
    for (const k of ['simGoal', 'sim']) if (!isObj(p[k])) p[k] = {};
    return p;
  }
  for (const k of ['nodes', 'simGoal', 'sim']) if (!isObj(p[k])) p[k] = {};
  if (!isObj(p.week)) p.week = null;
  for (const k of ['special', 'stages']) if (!Array.isArray(p[k])) p[k] = [];
  return p;
}
// Juntar el plan de dos dispositivos: cada examen, tu tiempo y el reparto, el más reciente (su updated_at); los
// días especiales y las etapas, por id (como los simulacros); lo demás, el de este dispositivo
const newest = (a, b) => ((b?.updated_at || 0) >= (a?.updated_at || 0) ? b : a);
export function mergePlan(older, newer) {
  if (!isObj(older)) return newer;
  if (!isObj(newer)) return older;
  // Dos planes de antes (dos dispositivos que aún no han migrado): días especiales y etapas, por id
  if (older.v !== 2 && newer.v !== 2) return { ...newer, special: unionById(older.special, newer.special), stages: unionById(older.stages, newer.stages) };
  // Uno ya migrado y el otro de una versión vieja: el migrado, con lo que la vieja cambió desde su copia (sim.__v2)
  if (older.v !== 2 || newer.v !== 2) {
    const [v2, v1] = newer.v === 2 ? [newer, older] : [older, newer];
    return v1.sim?.__v2?.v === 2 ? absorbV1(v2, v1, v1.sim.__v2) : v2;
  }
  const out = { ...newer };
  const ex = new Map();
  for (const e of [...(older.exams || []), ...(newer.exams || [])]) if (e?.id) ex.set(e.id, ex.has(e.id) ? newest(ex.get(e.id), e) : e);
  out.exams = [...ex.values()];
  out.time = { ...newest(older.time, newer.time), special: unionById(older.time?.special, newer.time?.special) };
  out.split = newest(older.split, newer.split);
  out.stages = unionById(older.stages, newer.stages);
  return out;
}
export function unionById(a = [], b = []) {
  const m = new Map();
  for (const x of [...(Array.isArray(a) ? a : []), ...(Array.isArray(b) ? b : [])]) {
    if (!x || x.id == null) continue;
    const o = m.get(x.id);
    if (!o || (x.at || 0) >= (o.at || 0)) m.set(x.id, x);
  }
  return [...m.values()];
}
// Junta las preferencias guardadas en la nube (older) con las de este dispositivo (newer): todo lo demás,
// lo de este dispositivo
export function mergeSynced(older, newer) {
  if (!isObj(older)) return newer;
  if (!isObj(newer)) return older;
  // Lo que va a la nube lleva el plan con su espejo para las versiones viejas (ver withMirror)
  const out = { ...newer, plan: withMirror(mergePlan(older.plan, newer.plan)) };
  for (const [a, b] of SYNCED) {
    if (b) out[a][b] = unionById(older[a]?.[b], newer[a]?.[b]);
    else out[a] = unionById(older[a], newer[a]);
  }
  out.sims = trimSims(out.sims);
  return out;
}
// Simulacros: de cada examen, el detalle (pregunta a pregunta) solo de los 10 últimos; de los demás, el resumen
export const SIM_DETAIL = 10;
export function trimSims(sims) {
  const byExam = new Map();
  for (const s of Array.isArray(sims) ? sims : []) {
    if (!s || s.deleted || !s.qs) continue;
    if (!byExam.has(s.exam)) byExam.set(s.exam, []);
    byExam.get(s.exam).push(s);
  }
  const drop = new Set();
  for (const list of byExam.values()) list.sort((x, y) => (y.done || 0) - (x.done || 0)).slice(SIM_DETAIL).forEach(s => drop.add(s.id));
  return (Array.isArray(sims) ? sims : []).map(s => (s && drop.has(s.id) ? { ...s, qs: null } : s));
}

// Parámetros del algoritmo para un mazo: los del mazo si tiene un preajuste propio; si no, los globales.
export function algoFor(prefs, deck) {
  const own = deck?.options?.preset;
  const pick = (preset, custom) => preset === 'custom' ? { ...DEFAULT_ALGO, ...custom, fsrs: false }
    : { ...DEFAULT_ALGO, ...(ALGO_PRESETS[preset]?.algo || {}), ...(preset === 'fsrs' ? { retention: prefs.algo.retention || 0.9 } : {}) };
  if (own) return pick(own, deck.options.custom || prefs.algo.custom);
  return pick(prefs.algo.preset, prefs.algo.custom);
}

const FONT_STACKS = {
  system: 'var(--font)',
  legible: '"Atkinson Hyperlegible", var(--font)',
  serif: 'ui-serif, "New York", "Iowan Old Style", Georgia, "Times New Roman", serif',
  rounded: 'ui-rounded, "SF Pro Rounded", "Hiragino Maru Gothic ProN", "Nunito", "Segoe UI", sans-serif',
  native: 'var(--font-native)',
  mono: 'var(--mono)',
};
const CARD_SCALE = { s: 0.85, m: 1, l: 1.2, xl: 1.45 };

// Aplica la apariencia al documento (tema, color de acento, letra, tamaño y densidad)
export function applyLook(look) {
  const root = document.documentElement;
  if (look.theme === 'system') root.removeAttribute('data-theme'); else root.dataset.theme = look.theme;
  root.dataset.accent = accentId(look.accent);
  root.style.setProperty('--card-font', FONT_STACKS[look.font] || FONT_STACKS.system);
  root.style.setProperty('--card-scale', CARD_SCALE[look.cardSize] || 1);
  root.classList.toggle('dense', look.density === 'compact');
  root.classList.toggle('card-left', look.cardAlign === 'left');
  // color de la barra del navegador en el móvil
  const dark = look.theme === 'dark' || (look.theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  for (const m of document.querySelectorAll('meta[name="theme-color"]')) {
    if (look.theme === 'system') m.setAttribute('content', m.media.includes('dark') ? '#191919' : '#FFFFFF');
    else m.setAttribute('content', dark ? '#191919' : '#FFFFFF');
  }
  try { localStorage.setItem('flaski-look', JSON.stringify(look)); } catch {}
}
// Al arrancar, antes de cargar datos, se usa la última apariencia guardada en este navegador
export function applySavedLook() {
  try { const l = JSON.parse(localStorage.getItem('flaski-look') || 'null'); if (l) applyLook({ ...DEFAULT_PREFS.look, ...l }); } catch {}
}
