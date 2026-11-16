// Flaski · Apuntes con IA (sale de app.js)
//   «Apunte con IA» (Crear): la IA prepara el apunte en Markdown y, debajo, sus preguntas en formato flaski-notes
//   «Preguntas con IA» (menú del apunte): se copia el apunte con las instrucciones y la IA devuelve sus preguntas
// En los dos, cada pregunta dice de qué apartado sale ("section") y se crea unida a ese bloque del apunte.
import * as api from '../api.js';
import { icon } from '../icons.js';
import { S, esc, toast, fail } from '../comun.js';
import { notesToDeck, splitPagePaste, sectionBlockId, notesOf, parsePasted, isNotesDeck } from '../notes.js';
import { markdownToPage } from '../notesio.js';
import { pageTitle, pageToMarkdown } from '../pages.js';
import { openSheet, closeSheet } from './editor.js';
import { issuesHTML, folderNamed, findFolder, loadAiGuide } from './explorar.js';
import { makeSuggested } from './sugerencias.js';
import { newPage, curPage } from './apuntes.js';
import { plural } from './mazos.js';
import { langLabel } from './estudio.js';
import { go } from '../app.js';

/* ---------------- Lo que se copia para la IA ---------------- */
const PAGE_ASK = guide => `Quiero un apunte para estudiar, con sus preguntas. Sigue las instrucciones de abajo, sobre todo la parte «Apuntes con preguntas». El tema o mi material te lo doy al final de este mensaje o en el siguiente.\n\n---\n\n${guide}`;
const CARDS_ASK = p => guide => `Hazme preguntas para estudiar el apunte de abajo, siguiendo las instrucciones del final. Pregunta solo por lo que está en el apunte. En cada nota pon "section" con el título del apartado del que sale, escrito igual que en el apunte. Responde solo con el bloque \`\`\`json.\n\n=== MI APUNTE ===\n\n${pageToMarkdown(p)}\n\n=== FIN DEL APUNTE ===\n\n---\n\n${guide}`;
// Para «Copiar instrucciones» (data-ai): qué va con la guía y a qué hoja vuelve si no se puede copiar
export function aiCopyOpts(ai) {
  if (ai === 'page') return { wrap: PAGE_ASK, back: 'ai-page' };
  if (ai === 'cards' && curPage()) return { wrap: CARDS_ASK(curPage()), back: 'ai-cards' };
  return {};
}

/* ---------------- «Preguntas con IA» (desde un apunte) ---------------- */
export function aiCardsSheet() {
  const p = curPage();
  if (!p) return;
  openSheet(`<h2 class="sheet-hand">Preguntas con IA</h2>
    <ol class="ai-steps"><li>Copia tu apunte junto con las instrucciones y pégalo en tu IA (ChatGPT, Gemini, Claude…).</li><li>Pega aquí lo que te responda. Cada pregunta queda unida al apartado del que sale.</li></ol>
    <span class="btnrow"><button type="button" class="ghost small-btn" data-act="copy-ai-guide" data-ai="cards">${icon('copy', { size: 16 })} Copiar apunte e instrucciones</button></span>
    <textarea id="pasteText" class="paste-box" rows="8" spellcheck="false" autocapitalize="off" autocomplete="off" aria-label="Lo que te ha respondido la IA" placeholder="{ &quot;format&quot;: &quot;flaski-notes&quot;, … }">${esc(S.aiCardsText || '')}</textarea>
    <p class="error" id="pasteError" role="alert" hidden></p>
    <div class="btnrow"><span class="spacer"></span><button class="ghost" data-act="close-sheet">Cancelar</button><button class="primary" data-act="ai-cards-preview">Ver vista previa</button></div>`);
  loadAiGuide();
}
// Lo pegado en «Preguntas con IA»: solo las preguntas (si viene también un apunte, se toman sus preguntas)
export function previewCardsForPage(text) {
  const p = curPage();
  if (!p) return;
  S.aiCardsText = text;
  const sp = splitPagePaste(text);
  const parsed = sp ? { kind: 'json', data: sp.data } : parsePasted(text);
  if (parsed.kind !== 'json' || !parsed.data || !isNotesDeck(parsed.data)) throw new Error('No parecen preguntas de Flaski. Pide a la IA que responda solo con el bloque ```json de las instrucciones.');
  const deck = notesToDeck(parsed.data);
  S.aiImport = { kind: 'cards', pageId: p.id, deck, notes: notesOf(deck) };
  showAiPreview();
}

/* ---------------- «Apunte con IA» (lo pegado trae un apunte) ---------------- */
// Si lo pegado es un apunte (Markdown con «# Título», con o sin preguntas), enseña su vista previa y devuelve true
export function previewPastedPage(text) {
  const sp = splitPagePaste(text);
  if (!sp) return false;
  const { title, blocks } = markdownToPage(sp.md);
  const data = sp.data && isNotesDeck(sp.data) && (Array.isArray(sp.data) || Array.isArray(sp.data.notes)) ? sp.data : null;
  const deck = data ? notesToDeck(data) : null;
  const meta = sp.data && !Array.isArray(sp.data) ? sp.data : {};
  S.aiImport = {
    kind: 'page', title: (title || String(meta.name || '')).trim().slice(0, 200) || 'Apunte', blocks, deck, notes: deck ? notesOf(deck) : [],
    folder: typeof meta.folder === 'string' ? meta.folder.trim().slice(0, 80) : '', lang: deck?.lang || '',
  };
  showAiPreview();
  return true;
}

/* ---------------- Vista previa y crear ---------------- */
const isPage = x => x.kind === 'page';
function showAiPreview() {
  const x = S.aiImport, page = isPage(x);
  const p = page ? null : S.pages.get(x.pageId);
  const blocks = page ? x.blocks : p?.blocks || [];
  const count = x.notes.reduce((k, n) => k + n.cards, 0);
  // Cuántas preguntas salen de cada apartado (y cuántas no dicen uno que exista)
  const per = new Map();
  let loose = 0;
  for (const n of x.notes) { const id = sectionBlockId(blocks, n.section); if (id) per.set(id, (per.get(id) || 0) + n.cards); else loose += n.cards; }
  const heads = blocks.filter(b => /^h[1-3]$/.test(b.type));
  const rows = heads.filter(h => page || per.has(h.id)).map(h => `<li><span>${esc(h.text.replace(/\*\*/g, ''))}</span><b>${per.get(h.id) ? plural(per.get(h.id), 'pregunta', 'preguntas') : '—'}</b></li>`).join('')
    + (loose ? `<li><span class="muted">Sin apartado</span><b>${plural(loose, 'pregunta', 'preguntas')}</b></li>` : '');
  const back = page ? 'ai-page' : 'ai-cards';
  if (!page && !count) {
    return openSheet(`<h2>No se ha podido crear ninguna pregunta</h2><p class="muted">Ninguna nota es válida. Esto es lo que falla:</p>
      ${issuesHTML(x.deck.issues.length ? x.deck.issues : [{ n: 0, reason: 'la lista de notas está vacía', skipped: true }])}
      <div class="btnrow"><span class="spacer"></span><button class="ghost" data-act="${back}">Volver a pegar</button><button class="primary" data-act="close-sheet">Cerrar</button></div>`);
  }
  const deck = p?.deck_id && S.decks.get(p.deck_id);
  const where = !count ? '' : deck ? `Van a la lista «${esc(deck.name)}».` : `Van a una lista nueva: «${esc(page ? x.title : pageTitle(p))}».`;
  const folder = page && x.folder ? ` ${icon('folder', { size: 14 })} En la carpeta «${esc(x.folder)}»${findFolder(x.folder) ? '' : ' (se crea)'}.` : '';
  openSheet(`<h2 class="sheet-hand">${esc(page ? x.title : `Preguntas para «${pageTitle(p)}»`)}</h2>
    <p class="muted small">${page ? `Apunte · ${plural(heads.length, 'apartado', 'apartados')} · ` : ''}${plural(count, 'pregunta', 'preguntas')}${x.lang ? ` · ${esc(langLabel(x.lang))}` : ''}</p>
    ${rows ? `<ul class="preview ai-secs">${rows}</ul>` : ''}
    ${where || folder ? `<p class="muted small ai-where">${where}${folder}</p>` : ''}
    ${page && !x.deck ? '<p class="muted small">No trae preguntas: se crea solo el apunte. Luego puedes pedirlas con «Preguntas con IA», en su menú.</p>' : ''}
    ${x.deck ? issuesHTML(x.deck.issues) : ''}
    <div class="btnrow"><button class="ghost" data-act="${back}">Volver a pegar</button><span class="spacer"></span><button class="primary" data-act="ai-import">${page ? 'Crear apunte' : `Añadir ${plural(count, 'pregunta', 'preguntas')}`}</button></div>`);
}

export async function aiImport(btn) {
  const x = S.aiImport;
  if (!x) return;
  btn.disabled = true; btn.textContent = isPage(x) ? 'Creando…' : 'Añadiendo…';
  try {
    let p;
    if (isPage(x)) {
      const folder = x.folder ? (await folderNamed(x.folder)).id : undefined;
      closeSheet();
      p = newPage({ title: x.title, blocks: x.blocks, folder });
      if (!p?.id) return;
      S.pasteText = '';
    } else {
      p = S.pages.get(x.pageId);
      closeSheet();
      if (!p) return;
      S.aiCardsText = '';
    }
    const picked = x.notes.map(n => ({ ...n, blockId: sectionBlockId(p.blocks, n.section) }));
    let made = [];
    if (picked.length) {
      let deckId = p.deck_id && S.decks.has(p.deck_id) ? p.deck_id : 'new';
      if (deckId === 'new' && x.lang) {
        const deck = await api.createDeck({ owner: S.uid, name: pageTitle(p).slice(0, 80) || 'Apuntes', description: '', source: 'apuntes', folder_id: p.folder_id || null, options: { lang: x.lang } });
        S.decks.set(deck.id, { tags: [], ...deck });
        deckId = deck.id;
      }
      ({ made } = await makeSuggested(p, picked, deckId));
    }
    S.aiImport = null;
    toast(isPage(x) ? (made.length ? `Apunte creado con ${plural(made.length, 'pregunta', 'preguntas')}` : 'Apunte creado') : `${plural(made.length, 'pregunta añadida', 'preguntas añadidas')} al apunte`);
    go('page', { pageId: p.id });
  } catch (e) { btn.disabled = false; btn.textContent = 'Reintentar'; fail(e); }
}
