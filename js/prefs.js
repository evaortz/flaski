// Preferencias del usuario: valores por defecto, mezcla con lo guardado y aplicación de la apariencia.
// Se guardan en settings.prefs (Supabase) o en el navegador (modo local) como un objeto JSON.
import { DEFAULT_ALGO, ALGO_PRESETS } from './srs.js';

export const DEFAULT_PREFS = {
  study: {
    maxReviews: 200,        // repasos máximos al día (0 = sin límite)
    newOrder: 'order',      // 'order' (como están en el mazo) | 'random'
    mix: 'mixed',           // 'mixed' | 'reviewsFirst' | 'newFirst'
    buttons: 4,             // 4 = Otra vez/Difícil/Bien/Fácil · 2 = Otra vez/Bien
    showIntervals: true,    // mostrar «3 d» debajo de cada botón
    suggest: true,          // resaltar la nota sugerida en tarjetas de escribir/elegir/dibujar
    burySiblings: true,     // solo una tarjeta nueva de cada nota por sesión
    autoplay: true,         // leer en voz alta los campos con audio automático
    rate: 1,                // velocidad de la voz
    shortcuts: true,        // mostrar la ayuda de atajos de teclado
    swipe: true,            // móvil: deslizar la tarjeta para valorarla
    haptics: true,          // móvil: vibración breve al responder y al trazar
    sound: true,            // efectos de sonido al valorar tarjetas
    nativeLang: 'es-ES',    // tu idioma: el de las traducciones en los mazos de idiomas
  },
  types: { hidden: [] },    // tipos de tarjeta que no quieres ver en el editor
  intro: { done: false },   // ya has visto la presentación de bienvenida
  algo: { preset: 'fsrs', custom: { ...DEFAULT_ALGO }, retention: 0.9 },   // FSRS para quien empieza
  look: {
    theme: 'system',        // 'system' | 'light' | 'dark'
    accent: 'blue',
    font: 'system',         // 'system' | 'serif' | 'rounded' | 'mono'
    cardSize: 'm',          // tamaño del texto de las tarjetas: s | m | l | xl
    density: 'comfy',       // 'comfy' | 'compact'
    cardAlign: 'center',    // 'center' | 'left'
  },
  home: { goal: 0, activity: true, forecast: true, forecastDays: 14, maturity: true, decks: true, friends: true },
};

export const ACCENTS = [
  { id: 'blue', label: 'Azul' }, { id: 'indigo', label: 'Índigo' }, { id: 'purple', label: 'Morado' },
  { id: 'pink', label: 'Rosa' }, { id: 'rose', label: 'Frambuesa' }, { id: 'red', label: 'Rojo' },
  { id: 'orange', label: 'Naranja' }, { id: 'amber', label: 'Ámbar' }, { id: 'lime', label: 'Lima' },
  { id: 'green', label: 'Verde' }, { id: 'teal', label: 'Turquesa' }, { id: 'cyan', label: 'Cian' },
  { id: 'brown', label: 'Marrón' }, { id: 'gray', label: 'Grafito' },
];
export const FONTS = [
  { id: 'system', label: 'Sistema' }, { id: 'serif', label: 'Serif' },
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
  return p;
};

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
  serif: 'ui-serif, "New York", "Iowan Old Style", Georgia, "Times New Roman", serif',
  rounded: 'ui-rounded, "SF Pro Rounded", "Hiragino Maru Gothic ProN", "Nunito", "Segoe UI", sans-serif',
  mono: 'var(--mono)',
};
const CARD_SCALE = { s: 0.85, m: 1, l: 1.2, xl: 1.45 };

// Aplica la apariencia al documento (tema, color de acento, letra, tamaño y densidad)
export function applyLook(look) {
  const root = document.documentElement;
  if (look.theme === 'system') root.removeAttribute('data-theme'); else root.dataset.theme = look.theme;
  root.dataset.accent = look.accent || 'blue';
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
