// Organización: carpetas, etiquetas, colores, orden y filtros.
// Funciones puras (no tocan la pantalla ni la base de datos), fáciles de probar.

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

// Iconos sugeridos (se puede escribir cualquier emoji)
export const ICONS = ['📘', '📗', '📕', '📙', '📓', '🗂️', '🧠', '🎯', '⭐', '🔥', '💬', '🗣️', '✍️', '🔤', '🔢', '🧮',
  '🧪', '🧬', '🌍', '🗺️', '🏛️', '🎵', '🎨', '💻', '⚖️', '🩺', '📈', '🍳', '🇹🇷', '🇪🇸', '🇬🇧', '🇫🇷', '🇩🇪', '🇮🇹', '🇯🇵', '🇨🇳'];

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
