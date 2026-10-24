// Organización: carpetas, etiquetas, colores, orden y filtros.
// Funciones puras (no tocan la pantalla ni la base de datos), fáciles de probar.
import { DRAWING_SVG } from './dibujos.js';

// Paleta de colores de Notion: nombre → variable CSS
export const COLORS = [
  { id: '', label: 'Sin color' },
  { id: 'gray', label: 'Gris' },
  { id: 'brown', label: 'Marrón' },
  { id: 'orange', label: 'Naranja' },
  { id: 'yellow', label: 'Amarillo' },
  { id: 'green', label: 'Verde' },
  { id: 'blue', label: 'Azul' },
  { id: 'purple', label: 'Morado' },
  { id: 'pink', label: 'Rosa' },
  { id: 'red', label: 'Rojo' },
];
export const colorVar = id => (id ? `var(--c-${id})` : 'var(--faint)');
// Colores de carpeta: los 9 acentos (sin color, el del tema). Los de antes pasan al más parecido
export const FOLDER_COLORS = [
  { id: '', label: 'El del tema' }, { id: 'cobalto', label: 'Cobalto', hex: '#2F3DB5' }, { id: 'violeta', label: 'Violeta', hex: '#6338C2' }, { id: 'ciruela', label: 'Ciruela', hex: '#94307F' },
  { id: 'frambuesa', label: 'Frambuesa', hex: '#BF2F5C' }, { id: 'teja', label: 'Teja', hex: '#B4482A' }, { id: 'oliva', label: 'Oliva', hex: '#5A7420' },
  { id: 'bosque', label: 'Bosque', hex: '#1D7550' }, { id: 'laguna', label: 'Laguna', hex: '#106E7C' }, { id: 'tinta', label: 'Tinta', hex: '#3B4157' },
];
const OLD_FOLDER = { blue: 'cobalto', purple: 'violeta', pink: 'ciruela', red: 'frambuesa', orange: 'teja', brown: 'teja', yellow: 'oliva', green: 'bosque', gray: 'tinta' };
export const folderColorId = id => (FOLDER_COLORS.some(c => c.id === id) ? id : OLD_FOLDER[id] || '');
export const folderColor = id => FOLDER_COLORS.find(c => c.id === folderColorId(id))?.hex || '';

// Etiquetas «pegatina»: siete colores suaves (el CSS pone fondo y texto con [data-tc])
export const TAG_COLORS = [
  { id: 'lavanda', label: 'Lavanda' }, { id: 'rosa', label: 'Rosa' }, { id: 'limon', label: 'Limón' },
  { id: 'salvia', label: 'Salvia' }, { id: 'agua', label: 'Agua' }, { id: 'arena', label: 'Arena' }, { id: 'gris', label: 'Gris' },
];
// Los colores de antes (los de Notion) pasan al más parecido
const OLD_TAG = { purple: 'lavanda', pink: 'rosa', red: 'rosa', yellow: 'limon', orange: 'limon', green: 'salvia', blue: 'agua', brown: 'arena', gray: 'gris', default: 'gris' };
export const tagColor = c => (TAG_COLORS.some(t => t.id === c) ? c : OLD_TAG[c] || 'gris');
// Cada pegatina sale un poco torcida, entre 1° y 2° a un lado u otro, y siempre igual: el giro sale del nombre
export function tagTilt(name) {
  let h = 0;
  for (const ch of String(name)) h = (h * 31 + ch.codePointAt(0)) | 0;
  h = Math.abs(h);
  return (h % 2 ? -1 : 1) * (10 + (h >> 1) % 11) / 10;
}

// Iconos sugeridos (se puede escribir cualquier emoji)
export const ICONS = ['📘', '📗', '📕', '📙', '📓', '🗂️', '🧠', '🎯', '⭐', '🔥', '💬', '🗣️', '✍️', '🔤', '🔢', '🧮',
  '🧪', '🧬', '🌍', '🗺️', '🏛️', '🎵', '🎨', '💻', '⚖️', '🩺', '📈', '🍳', '🇹🇷', '🇪🇸', '🇬🇧', '🇫🇷', '🇩🇪', '🇮🇹', '🇯🇵', '🇨🇳'];

// Dibujos para las carpetas (en línea, en dibujos.js). Se guardan en el icono como «d:id», que cabe en sus 16 caracteres
export const DRAWINGS = [
  { id: 'turquia', svg: 'bandera-turquia', label: 'Bandera de Turquía' },
  { id: 'japon', svg: 'bandera-japon', label: 'Bandera de Japón' },
  { id: 'gramatica', svg: 'gramatica-japones', label: 'Gramática japonesa' },
  { id: 'clase', svg: 'clase-online', label: 'Clase en línea' },
  { id: 'economia', svg: 'economia', label: 'Economía' },
  { id: 'balanza', svg: 'balanza-color', label: 'Balanza' },
  { id: 'derecho', svg: 'derecho', label: 'Derecho' },
  { id: 'brujula', svg: 'brujula', label: 'Brújula' },
];
export const drawingOf = ic => DRAWINGS.find(d => 'd:' + d.id === ic) || null;
// El dibujo en línea: lo que era cobalto toma el color del tema (clase .dw)
export const drawingSVG = (d, cls = '', label = '') => DRAWING_SVG[d.svg].replace('<svg', `<svg class="dw ${cls}" data-dw="${d.id}" ${label ? `role="img" aria-label="${label}"` : 'aria-hidden="true"'}`);
// Una imagen propia de la carpeta: «i:<id>» (el id de media.js, de 14 letras, cabe en los 16 del icono)
export const imageOf = ic => (/^i:[\w-]{4,14}$/.test(ic || '') ? ic.slice(2) : null);
// El icono como texto (rutas, desplegables): el emoji; un dibujo o una imagen no se pueden escribir
export const iconText = ic => (ic && !/^[di]:/.test(String(ic)) ? ic : '');

export const SORTS = [
  { id: 'manual', label: 'Fijados primero' },
  { id: 'name', label: 'Nombre (A-Z)' },
  { id: 'due', label: 'Más pendientes' },
  { id: 'progress', label: 'Menos avanzados' },
  { id: 'recent', label: 'Editados recientemente' },
  { id: 'created', label: 'Más nuevos' },
];

/* ---------------- Carpetas ---------------- */

// Lista de carpetas desde la raíz hasta la carpeta indicada (para la ruta "Mis mazos › Idiomas › Turco")
export function folderPath(folders, id) {
  const path = [];
  const seen = new Set();
  let f = folders.get(id);
  while (f && !seen.has(f.id)) { seen.add(f.id); path.unshift(f); f = folders.get(f.parent_id); }
  return path;
}

// Ids de una carpeta y todas las que hay dentro, a cualquier profundidad
export function descendants(folders, id) {
  const out = new Set([id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const f of folders.values()) if (f.parent_id && out.has(f.parent_id) && !out.has(f.id)) { out.add(f.id); grew = true; }
  }
  return out;
}

// Árbol aplanado para un desplegable: [{ id, name, depth }]
export function folderTree(folders, exclude = null) {
  const banned = exclude ? descendants(folders, exclude) : new Set();
  const kids = new Map();
  for (const f of folders.values()) {
    const p = f.parent_id && folders.has(f.parent_id) ? f.parent_id : null;
    if (!kids.has(p)) kids.set(p, []);
    kids.get(p).push(f);
  }
  const out = [];
  const walk = (parent, depth) => {
    for (const f of (kids.get(parent) || []).sort((a, b) => a.name.localeCompare(b.name, 'es'))) {
      if (banned.has(f.id)) continue;
      out.push({ id: f.id, name: f.name, icon: f.icon, depth });
      walk(f.id, depth + 1);
    }
  };
  walk(null, 0);
  return out;
}

// Mazos dentro de una carpeta (incluidas subcarpetas)
export function decksInFolder(decks, folders, id) {
  const ids = descendants(folders, id);
  return [...decks.values()].filter(d => ids.has(d.folder_id));
}

/* ---------------- Orden y filtros ---------------- */

// stats: Map deckId → { due, newToday, total, mature }
export function sortDecks(list, sort, stats) {
  const by = {
    name: (a, b) => a.name.localeCompare(b.name, 'es'),
    due: (a, b) => (stats.get(b.id).due + stats.get(b.id).newToday) - (stats.get(a.id).due + stats.get(a.id).newToday),
    progress: (a, b) => ratio(stats.get(a.id)) - ratio(stats.get(b.id)),
    recent: (a, b) => String(b.updated_at || b.created_at).localeCompare(String(a.updated_at || a.created_at)),
    created: (a, b) => String(b.created_at).localeCompare(String(a.created_at)),
  };
  const ratio = s => (s.total ? s.mature / s.total : 0);
  const pinnedFirst = (a, b) => Number(!!b.pinned) - Number(!!a.pinned);
  const main = by[sort] || by.name;
  return [...list].sort((a, b) => (sort === 'manual' ? pinnedFirst(a, b) || by.name(a, b) : pinnedFirst(a, b) || main(a, b) || by.name(a, b)));
}

export function matchesDeck(d, { query = '', tagIds = [], archived = false }) {
  if (!!d.archived !== archived) return false;
  if (tagIds.length && !tagIds.every(t => (d.tags || []).includes(t))) return false;
  if (query) {
    const q = query.toLocaleLowerCase();
    if (!(`${d.name} ${d.description || ''}`).toLocaleLowerCase().includes(q)) return false;
  }
  return true;
}
