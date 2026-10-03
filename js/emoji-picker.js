// Selector de emojis completo, como el teclado del iPhone / WhatsApp:
// categorías, búsqueda en español, recientes y tono de piel.
// Los emojis se dibujan con la fuente del sistema, así que en un iPhone se ven
// exactamente igual que en WhatsApp. Los datos vienen de data/emoji.json
// (emojibase, licencia MIT) y solo se descargan la primera vez que se abre.

import { icon } from './icons.js';

let DATA = null;
let loading = null;
const RECENT_KEY = 'flaski-emoji-recent';
const TONE_KEY = 'flaski-emoji-tone';
const TONES = ['', '🏻', '🏼', '🏽', '🏾', '🏿'];
const TABS = [
  { id: 'r', icon: 'clock', name: 'Recientes' },
  { id: 0, icon: 'smile', name: 'Emoticonos' },
  { id: 1, icon: 'user', name: 'Personas' },
  { id: 3, icon: 'leaf', name: 'Animales y naturaleza' },
  { id: 4, icon: 'utensils', name: 'Comida y bebida' },
  { id: 5, icon: 'plane', name: 'Viajes y lugares' },
  { id: 6, icon: 'volleyball', name: 'Actividades' },
  { id: 7, icon: 'lightbulb', name: 'Objetos' },
  { id: 8, icon: 'shapes', name: 'Símbolos' },
  { id: 9, icon: 'flag', name: 'Banderas' },
];

function load() {
  if (DATA) return Promise.resolve(DATA);
  if (!loading) loading = fetch('data/emoji.json').then(r => r.json()).then(d => {
    DATA = d.emoji.map(([e, label, tags, group, skins]) => ({ e, group, skins, key: norm(`${label} ${tags}`) }));
    return DATA;
  });
  return loading;
}
const norm = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const store = {
  get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};
const recent = () => store.get(RECENT_KEY, []);
function pushRecent(e) { store.set(RECENT_KEY, [e, ...recent().filter(x => x !== e)].slice(0, 32)); }

// Monta el selector dentro de `panel`. onPick(emoji) se llama al elegir uno.
export async function mountEmojiPicker(panel, onPick) {
  panel.innerHTML = '<div class="ep-loading">Cargando emojis…</div>';
  let data;
  try { data = await load(); } catch { panel.innerHTML = '<div class="ep-loading">No se pudieron cargar los emojis. Escríbelo en «Otro».</div>'; return; }
  let tone = store.get(TONE_KEY, 0);

  panel.innerHTML = `
    <div class="ep-top">
      <input type="search" class="ep-search" placeholder="Buscar emoji (perro, corazón, España…)" aria-label="Buscar emoji">
      <div class="ep-tones" role="radiogroup" aria-label="Tono de piel">${TONES.map((t, i) =>
        `<button type="button" class="ep-tone" data-tone="${i}" aria-pressed="${i === tone}" aria-label="Tono ${i || 'por defecto'}">✋${t}</button>`).join('')}</div>
    </div>
    <div class="ep-tabs" role="tablist">${TABS.map(t => `<button type="button" class="ep-tab" data-tab="${t.id}" title="${t.name}" aria-label="${t.name}">${icon(t.icon, { size: 18 })}</button>`).join('')}</div>
    <div class="ep-grid" tabindex="-1"></div>
    <div class="ep-own"><label>¿No está? Pega o escribe el tuyo: <input class="ep-own-input" maxlength="8" aria-label="Otro emoji"></label></div>`;

  const grid = panel.querySelector('.ep-grid');
  const search = panel.querySelector('.ep-search');
  const withTone = item => (tone && item.skins ? item.skins[tone - 1] : item.e);
  const btn = e => `<button type="button" class="ep-e" data-emoji="${e}">${e}</button>`;

  function draw() {
    const q = norm(search.value.trim());
    if (q) {
      const hits = data.filter(x => x.key.includes(q)).slice(0, 300);
      grid.innerHTML = hits.length ? `<div class="ep-sec">${hits.map(x => btn(withTone(x))).join('')}</div>` : '<p class="ep-empty">No hay resultados.</p>';
      return;
    }
    const rec = recent();
    let html = rec.length ? `<h4 class="ep-h" id="ep-r">Recientes</h4><div class="ep-sec">${rec.map(btn).join('')}</div>` : '';
    for (const t of TABS.slice(1)) {
      html += `<h4 class="ep-h" id="ep-${t.id}">${t.name}</h4><div class="ep-sec">${data.filter(x => x.group === t.id).map(x => btn(withTone(x))).join('')}</div>`;
    }
    grid.innerHTML = html;
  }
  draw();

  panel.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    e.preventDefault();
    if (b.dataset.emoji) { pushRecent(b.dataset.emoji); onPick(b.dataset.emoji); return; }
    if (b.dataset.tone !== undefined) {
      tone = Number(b.dataset.tone); store.set(TONE_KEY, tone);
      panel.querySelectorAll('.ep-tone').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
      const top = grid.scrollTop; draw(); grid.scrollTop = top;
      return;
    }
    if (b.dataset.tab !== undefined) {
      search.value = ''; draw();
      const h = panel.querySelector(`#ep-${b.dataset.tab}`);
      grid.scrollTop = h ? h.offsetTop - 4 : 0;  // .ep-grid es position:relative, así que offsetTop ya es relativo a ella
    }
  });
  search.addEventListener('input', draw);
  search.addEventListener('keydown', e => { if (e.key === 'Enter') e.preventDefault(); });
  const own = panel.querySelector('.ep-own-input');
  own.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); if (own.value.trim()) onPick(own.value.trim()); } });
  own.addEventListener('change', () => { if (own.value.trim()) onPick(own.value.trim()); });
  if (matchMedia('(hover:hover)').matches) search.focus();
}
