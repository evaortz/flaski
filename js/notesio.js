// Importar y exportar apuntes en otros formatos:
//   exportar → Markdown (con sus imágenes en un .zip), Word (.docx), HTML (que también sirve para imprimir o guardar en PDF)
//   importar → Word (.docx), Markdown / texto, HTML, CSV y .zip con apuntes en Markdown (de Notion, Obsidian o de aquí)
// Sin librerías: el .zip se escribe y se lee a mano y el .docx es XML.
import { readZip } from './zip.js';
import { pageTitle, pageToMarkdown, parseTable, textToBlocks, tableToMarkdown, olNumbers, newBlock } from './pages.js';
import { toHTML, toRuns, escHTML } from './inline.js';
import { parseCSV } from './csv.js';

/* ---------------- Escribir un .zip (sin comprimir: los apuntes pesan poco y las imágenes ya van comprimidas) ---------------- */
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
export function crc32(b) { let c = 0xFFFFFFFF; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
const enc = new TextEncoder();
// files: [{ name, data: Uint8Array | string }] → Uint8Array
export function writeZip(files) {
  const parts = [], central = [];
  let off = 0;
  const now = new Date(), dt = ((now.getFullYear() - 1980) << 25) | ((now.getMonth() + 1) << 21) | (now.getDate() << 16) | (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
  for (const f of files) {
    const name = enc.encode(f.name), data = typeof f.data === 'string' ? enc.encode(f.data) : f.data;
    const crc = crc32(data);
    const head = new DataView(new ArrayBuffer(30));
    head.setUint32(0, 0x04034b50, true); head.setUint16(4, 20, true); head.setUint16(6, 0x0800, true);   // UTF-8 en los nombres
    head.setUint16(8, 0, true); head.setUint32(10, dt, true); head.setUint32(14, crc, true);
    head.setUint32(18, data.length, true); head.setUint32(22, data.length, true); head.setUint16(26, name.length, true);
    parts.push(new Uint8Array(head.buffer), name, data);
    const cd = new DataView(new ArrayBuffer(46));
    cd.setUint32(0, 0x02014b50, true); cd.setUint16(4, 20, true); cd.setUint16(6, 20, true); cd.setUint16(8, 0x0800, true);
    cd.setUint32(12, dt, true); cd.setUint32(16, crc, true); cd.setUint32(20, data.length, true); cd.setUint32(24, data.length, true);
    cd.setUint16(28, name.length, true); cd.setUint32(42, off, true);
    central.push(new Uint8Array(cd.buffer), name);
    off += 30 + name.length + data.length;
  }
  const size = central.reduce((n, p) => n + p.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
  end.setUint32(12, size, true); end.setUint32(16, off, true);
  const all = [...parts, ...central, new Uint8Array(end.buffer)];
  const out = new Uint8Array(all.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of all) { out.set(p, at); at += p.length; }
  return out;
}

// Un nombre de archivo válido en cualquier sistema
export const safeName = s => String(s || 'apunte').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) || 'apunte';
const IMG_IN = /!\[([^\]\n]*)\]\(img:([\w-]{4,64})\)/g;
// Las imágenes de un apunte (ids)
export const pageImageIds = page => [...new Set((page.blocks || []).flatMap(b => [b.type === 'img' ? b.src : null, ...[...String(b.text || '').matchAll(IMG_IN)].map(m => m[2])]).filter(Boolean))];

/* ---------------- Markdown (con las imágenes junto al texto) ---------------- */
// Markdown con las imágenes apuntando a la carpeta «dir» (y el nombre de archivo de cada una)
export function markdownWithImages(page, names, dir = 'imagenes') {
  return pageToMarkdown(page).replace(IMG_IN, (m, alt, id) => (names.has(id) ? `![${alt}](${dir}/${encodeURI(names.get(id))})` : m));
}

/* ---------------- HTML (para leer, compartir o imprimir en PDF) ---------------- */
const TEXT_COLOR = { gray: '#787774', brown: '#9F6B53', orange: '#D9730D', yellow: '#CB912F', green: '#448361', blue: '#337EA9', purple: '#9065B0', pink: '#C14C8A', red: '#D44C47' };
const BG_COLOR = { gray: '#F1F1EF', brown: '#F4EEEE', orange: '#FBECDD', yellow: '#FBF3DB', green: '#EDF3EC', blue: '#E7F3F8', purple: '#F6F3F9', pink: '#FAF1F5', red: '#FDEBEC' };
const HTML_CSS = `body{margin:0;background:#fff;color:#37352F;font:16px/1.65 ui-sans-serif,-apple-system,"Segoe UI",Helvetica,Arial,sans-serif}
article{max-width:720px;margin:48px auto;padding:0 24px}h1.title{font-size:34px;line-height:1.2;margin:0 0 24px}
h1{font-size:26px;margin:32px 0 8px}h2{font-size:21px;margin:26px 0 6px}h3{font-size:18px;margin:20px 0 4px}p{margin:4px 0}
ul,ol{margin:4px 0;padding-left:26px}li{margin:2px 0}li.todo{list-style:none;margin-left:-22px}li.todo.done{color:#9B9A97;text-decoration:line-through}
blockquote{margin:8px 0;padding:2px 14px;border-left:3px solid #37352F}.callout{display:flex;gap:10px;margin:8px 0;padding:12px 14px;border-radius:6px;background:#F1F1EF}
pre{margin:8px 0;padding:12px 14px;border-radius:6px;background:#F7F6F3;font:13.5px/1.55 ui-monospace,Menlo,Consolas,monospace;white-space:pre-wrap}
code{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:.88em;background:rgba(135,131,120,.15);color:#EB5757;padding:.1em .35em;border-radius:3px}pre code{background:none;color:inherit;padding:0}
table{border-collapse:collapse;margin:10px 0;font-size:15px}th,td{border:1px solid #E9E9E7;padding:6px 10px;vertical-align:top;text-align:left}th{background:#F7F6F3}
hr{border:0;border-top:1px solid #E9E9E7;margin:16px 0}figure{margin:12px 0}figure img,img.media{max-width:100%;border-radius:4px}figcaption{color:#787774;font-size:14px;text-align:center}
mark{border-radius:3px;padding:0 1px;color:inherit}a{color:inherit;text-decoration-color:#9B9A97}
${Object.entries(TEXT_COLOR).map(([k, v]) => `.tc-${k}{color:${v}}`).join('')}${Object.entries(BG_COLOR).map(([k, v]) => `.hl-${k}{background:${v}}`).join('')}
@media print{article{margin:0;max-width:none}h1,h2,h3{break-after:avoid}figure,table,pre{break-inside:avoid}}`;
// urls: Map id → dirección de la imagen (data: o un archivo)
export function pageToHTML(page, urls = new Map(), { print = false } = {}) {
  const t = String(page.title || '').trim() || pageTitle(page);
  const inline = s => toHTML(s).replace(/<img class="media" data-img="([\w-]+)"([^>]*)>/g, (m, id, rest) => (urls.has(id) ? `<img class="media" src="${urls.get(id)}"${rest.replace(/ loading="lazy"| decoding="async"/g, '')}>` : ''))
    .replace(/<a class="wl" href="#" data-wiki="[^"]*">([\s\S]*?)<\/a>/g, '$1');
  const nums = olNumbers(page.blocks || []);
  const out = [];
  const blocks = page.blocks || [];
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    if (['li', 'ol', 'todo'].includes(b.type)) {
      // Una lista seguida, con sus niveles de sangría
      let html = '';
      const stack = [];
      const open = (tag, d) => { html += `<${tag}${tag === 'ol' && nums.get(blocks[i].id) > 1 && !stack.length ? ` start="${nums.get(blocks[i].id)}"` : ''}>`; stack.push({ tag, d }); };
      for (; i < blocks.length && ['li', 'ol', 'todo'].includes(blocks[i].type); i++) {
        const x = blocks[i], d = x.indent || 0, tag = x.type === 'ol' ? 'ol' : 'ul';
        while (stack.length && (stack[stack.length - 1].d > d || (stack[stack.length - 1].d === d && stack[stack.length - 1].tag !== tag))) html += `</${stack.pop().tag}>`;
        while (!stack.length || stack[stack.length - 1].d < d) open(tag, stack.length ? stack[stack.length - 1].d + 1 : d < 1 ? d : 0);
        html += x.type === 'todo' ? `<li class="todo${x.checked ? ' done' : ''}"><input type="checkbox" disabled${x.checked ? ' checked' : ''}> ${inline(x.text)}</li>` : `<li>${inline(x.text)}</li>`;
      }
      while (stack.length) html += `</${stack.pop().tag}>`;
      out.push(html);
      i--;
      continue;
    }
    if (b.type === 'img') { if (urls.has(b.src)) out.push(`<figure><img src="${urls.get(b.src)}" alt="${escHTML(b.text)}">${b.text.trim() ? `<figcaption>${inline(b.text)}</figcaption>` : ''}</figure>`); continue; }
    if (b.type === 'hr') { out.push('<hr>'); continue; }
    if (!String(b.text || '').trim()) continue;
    if (/^h[123]$/.test(b.type)) out.push(`<${b.type}>${inline(b.text)}</${b.type}>`);
    else if (b.type === 'quote') out.push(`<blockquote>${inline(b.text)}</blockquote>`);
    else if (b.type === 'callout') out.push(`<div class="callout"><span>${escHTML(b.icon || '💡')}</span><div>${inline(b.text)}</div></div>`);
    else if (b.type === 'code') out.push(`<pre><code>${escHTML(b.text)}</code></pre>`);
    else if (b.type === 'table') {
      const tb = parseTable(b.text);
      if (!tb) { out.push(`<pre>${escHTML(b.text)}</pre>`); continue; }
      const al = k => (tb.align[k] ? ` style="text-align:${tb.align[k]}"` : '');
      out.push(`<table><thead><tr>${tb.head.map((c, k) => `<th${al(k)}>${inline(c)}</th>`).join('')}</tr></thead><tbody>${tb.rows.map(r => `<tr>${r.map((c, k) => `<td${al(k)}>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`);
    } else out.push(`<p${b.indent ? ` style="margin-left:${b.indent * 26}px"` : ''}>${inline(b.text)}</p>`);
  }
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escHTML(t)}</title><style>${HTML_CSS}</style></head>
<body><article><h1 class="title">${escHTML(t)}</h1>
${out.join('\n')}
</article>${print ? '<script>addEventListener("load",()=>setTimeout(()=>print(),300))</script>' : ''}</body></html>`;
}

/* ---------------- Word (.docx) ---------------- */
const x = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');
// images: Map id → { bytes: Uint8Array, ext: 'png'|'jpeg', w, h } (en píxeles)
export function pageToDocx(page, images = new Map()) {
  const rels = [], media = [];
  let relN = 10, numN = 2, drawN = 1;
  const rel = (type, target, external = false) => { const id = `rId${relN++}`; rels.push(`<Relationship Id="${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/${type}" Target="${x(target)}"${external ? ' TargetMode="External"' : ''}/>`); return id; };
  const imgRel = new Map();
  const imageXML = (id, maxPx = 600) => {
    const im = images.get(id);
    if (!im) return '';
    if (!imgRel.has(id)) { const file = `media/img${imgRel.size + 1}.${im.ext}`; media.push({ name: `word/${file}`, data: im.bytes }); imgRel.set(id, rel('image', file)); }
    const k = Math.min(1, maxPx / (im.w || maxPx)), cx = Math.round((im.w || 400) * k * 9525), cy = Math.round((im.h || 300) * k * 9525), n = drawN++;
    return `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${n}" name="Imagen ${n}"/>
<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">
<pic:nvPicPr><pic:cNvPr id="${n}" name="img${n}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${imgRel.get(id)}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>
<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`;
  };
  // El texto con formato → «runs» de Word
  const runs = (text, base = '') => toRuns(text).map(r => {
    if (r.raw && /^!\[/.test(r.text)) { const m = /img:([\w-]+)/.exec(r.text); return m ? imageXML(m[1], 400) : ''; }
    let t = r.raw ? r.text.replace(/^\[\[([^|\]]+)(?:\|([^\]]+))?\]\]$/, (m, a, b) => b || a).replace(/^([^[]+)\[([^\]]+)\]$/, '$1 ($2)') : r.text;
    const st = r.st, pr = [base];
    if (st.b) pr.push('<w:b/>');
    if (st.i) pr.push('<w:i/>');
    if (st.u || st.href) pr.push('<w:u w:val="single"/>');
    if (st.s) pr.push('<w:strike/>');
    if (st.code) pr.push('<w:rFonts w:ascii="Consolas" w:hAnsi="Consolas" w:cs="Consolas"/><w:color w:val="C7254E"/>');
    else if (st.href) pr.push('<w:color w:val="2E75B6"/>');
    else if (st.color && TEXT_COLOR[st.color]) pr.push(`<w:color w:val="${TEXT_COLOR[st.color].slice(1)}"/>`);
    if (st.bg && BG_COLOR[st.bg]) pr.push(`<w:shd w:val="clear" w:color="auto" w:fill="${BG_COLOR[st.bg].slice(1)}"/>`);
    const body = t.split('\n').map((l, k) => `${k ? '<w:br/>' : ''}<w:t xml:space="preserve">${x(l)}</w:t>`).join('');
    const run = `<w:r>${pr.join('') ? `<w:rPr>${pr.join('')}</w:rPr>` : ''}${body}</w:r>`;
    return st.href ? `<w:hyperlink r:id="${rel('hyperlink', st.href, true)}">${run}</w:hyperlink>` : run;
  }).join('');
  const para = (inner, ppr = '') => `<w:p>${ppr ? `<w:pPr>${ppr}</w:pPr>` : ''}${inner}</w:p>`;
  const nums = [];   // cada lista numerada empieza en 1
  const body = [];
  let prevType = null, curNum = 0;
  for (const b of page.blocks || []) {
    const ind = Math.min(4, b.indent || 0);
    if (b.type === 'ol' && prevType !== 'ol' && !(prevType && ['li', 'todo'].includes(prevType) && ind)) { curNum = numN++; nums.push(curNum); }
    prevType = b.type;
    const text = String(b.text || '');
    if (b.type === 'img') { const im = imageXML(b.src); if (im) body.push(para(im, '<w:jc w:val="center"/>')); if (text.trim()) body.push(para(runs(text), '<w:pStyle w:val="Caption"/><w:jc w:val="center"/>')); continue; }
    if (b.type === 'hr') { body.push(para('', '<w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="D9D9D9"/></w:pBdr>')); continue; }
    if (b.type === 'table') {
      const tb = parseTable(text);
      if (!tb) { body.push(para(runs(text))); continue; }
      const jc = k => ({ center: 'center', right: 'right' }[tb.align[k]] || 'left');
      const cell = (c, k, head) => `<w:tc><w:tcPr>${head ? '<w:shd w:val="clear" w:color="auto" w:fill="F2F2F2"/>' : ''}</w:tcPr>${para(runs(c, head ? '<w:b/>' : ''), `<w:spacing w:before="40" w:after="40"/><w:jc w:val="${jc(k)}"/>`)}</w:tc>`;
      body.push(`<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/><w:tblBorders>${['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(s => `<w:${s} w:val="single" w:sz="4" w:space="0" w:color="D9D9D9"/>`).join('')}</w:tblBorders><w:tblCellMar><w:left w:w="100" w:type="dxa"/><w:right w:w="100" w:type="dxa"/></w:tblCellMar></w:tblPr>
<w:tr><w:trPr><w:tblHeader/></w:trPr>${tb.head.map((c, k) => cell(c, k, true)).join('')}</w:tr>${tb.rows.map(r => `<w:tr>${r.map((c, k) => cell(c, k, false)).join('')}</w:tr>`).join('')}</w:tbl>`);
      body.push(para(''));
      continue;
    }
    if (!text.trim() && b.type !== 'p') continue;
    if (/^h[123]$/.test(b.type)) body.push(para(runs(text), `<w:pStyle w:val="Heading${b.type[1]}"/>`));
    else if (b.type === 'li') body.push(para(runs(text), `<w:pStyle w:val="ListParagraph"/><w:numPr><w:ilvl w:val="${ind}"/><w:numId w:val="1"/></w:numPr>`));
    else if (b.type === 'ol') body.push(para(runs(text), `<w:pStyle w:val="ListParagraph"/><w:numPr><w:ilvl w:val="${ind}"/><w:numId w:val="${curNum}"/></w:numPr>`));
    else if (b.type === 'todo') body.push(para(`<w:r><w:t xml:space="preserve">${b.checked ? '☑' : '☐'} </w:t></w:r>${runs(text, b.checked ? '<w:strike/><w:color w:val="9B9A97"/>' : '')}`, `<w:ind w:left="${360 + ind * 360}"/>`));
    else if (b.type === 'quote') body.push(para(runs(text), '<w:pStyle w:val="Quote"/>'));
    else if (b.type === 'callout') body.push(para(`<w:r><w:t xml:space="preserve">${x(b.icon || '💡')}  </w:t></w:r>${runs(text)}`, '<w:pStyle w:val="Callout"/>'));
    else if (b.type === 'code') body.push(para(text.split('\n').map((l, k) => `<w:r>${k ? '<w:br/>' : ''}<w:t xml:space="preserve">${x(l)}</w:t></w:r>`).join(''), '<w:pStyle w:val="Code"/>'));
    else body.push(para(runs(text), ind ? `<w:ind w:left="${ind * 360}"/>` : ''));
  }
  const title = String(page.title || '').trim() || pageTitle(page);
  const doc = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">
<w:body>${para(`<w:r><w:t xml:space="preserve">${x(title)}</w:t></w:r>`, '<w:pStyle w:val="Title"/>')}${body.join('')}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1418" w:right="1418" w:bottom="1418" w:left="1418" w:header="709" w:footer="709" w:gutter="0"/></w:sectPr></w:body></w:document>`;
  const lvl = (k, fmt, txt) => `<w:lvl w:ilvl="${k}"><w:start w:val="1"/><w:numFmt w:val="${fmt}"/><w:lvlText w:val="${txt}"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="${720 + k * 360}" w:hanging="360"/></w:pPr>${fmt === 'bullet' ? '<w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/></w:rPr>' : ''}</w:lvl>`;
  const numbering = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:abstractNum w:abstractNumId="0"><w:multiLevelType w:val="hybridMultilevel"/>${[0, 1, 2, 3, 4].map(k => lvl(k, 'bullet', ['•', '◦', '▪', '•', '◦'][k])).join('')}</w:abstractNum>
<w:abstractNum w:abstractNumId="1"><w:multiLevelType w:val="hybridMultilevel"/>${[0, 1, 2, 3, 4].map(k => lvl(k, ['decimal', 'lowerLetter', 'lowerRoman', 'decimal', 'lowerLetter'][k], `%${k + 1}.`)).join('')}</w:abstractNum>
<w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>
${nums.map(n => `<w:num w:numId="${n}"><w:abstractNumId w:val="1"/><w:lvlOverride w:ilvl="0"><w:startOverride w:val="1"/></w:lvlOverride></w:num>`).join('')}
</w:numbering>`;
  const style = (id, name, ppr = '', rpr = '', extra = '') => `<w:style w:type="paragraph" w:styleId="${id}"><w:name w:val="${name}"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/>${extra}${ppr ? `<w:pPr>${ppr}</w:pPr>` : ''}${rpr ? `<w:rPr>${rpr}</w:rPr>` : ''}</w:style>`;
  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:eastAsia="Calibri" w:cs="Calibri"/><w:sz w:val="22"/><w:lang w:val="es-ES"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>
${style('Title', 'Title', '<w:spacing w:after="240"/>', '<w:b/><w:sz w:val="52"/>')}
${style('Heading1', 'heading 1', '<w:keepNext/><w:spacing w:before="360" w:after="120"/><w:outlineLvl w:val="0"/>', '<w:b/><w:sz w:val="36"/>')}
${style('Heading2', 'heading 2', '<w:keepNext/><w:spacing w:before="280" w:after="100"/><w:outlineLvl w:val="1"/>', '<w:b/><w:sz w:val="30"/>')}
${style('Heading3', 'heading 3', '<w:keepNext/><w:spacing w:before="220" w:after="80"/><w:outlineLvl w:val="2"/>', '<w:b/><w:sz w:val="26"/>')}
${style('ListParagraph', 'List Paragraph', '<w:spacing w:after="40"/><w:contextualSpacing/>')}
${style('Quote', 'Quote', '<w:pBdr><w:left w:val="single" w:sz="18" w:space="8" w:color="37352F"/></w:pBdr><w:ind w:left="240"/>', '<w:i/>')}
${style('Callout', 'Destacado', '<w:shd w:val="clear" w:color="auto" w:fill="F1F1EF"/><w:spacing w:before="120" w:after="120"/><w:ind w:left="120" w:right="120"/>')}
${style('Code', 'Código', '<w:shd w:val="clear" w:color="auto" w:fill="F7F6F3"/><w:spacing w:after="120" w:line="240" w:lineRule="auto"/>', '<w:rFonts w:ascii="Consolas" w:hAnsi="Consolas" w:cs="Consolas"/><w:sz w:val="19"/>')}
${style('Caption', 'caption', '', '<w:color w:val="787774"/><w:sz w:val="19"/>')}
</w:styles>`;
  const files = [
    { name: '[Content_Types].xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Default Extension="jpeg" ContentType="image/jpeg"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>` },
    { name: '_rels/.rels', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>` },
    { name: 'docProps/core.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${x(title)}</dc:title><dc:creator>Flaski</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${new Date().toISOString().slice(0, 19)}Z</dcterms:created></cp:coreProperties>` },
    { name: 'word/document.xml', data: doc },
    { name: 'word/styles.xml', data: styles },
    { name: 'word/numbering.xml', data: numbering },
    { name: 'word/_rels/document.xml.rels', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>${rels.join('')}</Relationships>` },
    ...media,
  ];
  return writeZip(files);
}

/* ---------------- Importar Word (.docx) → HTML (que luego se convierte en bloques, como al pegar) ---------------- */
const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const HL = { yellow: '#FFFF00', green: '#00FF00', cyan: '#00FFFF', magenta: '#FF00FF', blue: '#0000FF', red: '#FF0000', darkBlue: '#00008B', darkCyan: '#008B8B', darkGreen: '#006400', darkMagenta: '#8B008B', darkRed: '#8B0000', darkYellow: '#808000', lightGray: '#D3D3D3', darkGray: '#A9A9A9' };
const MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp', svg: 'image/svg+xml' };
const toB64 = bytes => { let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(s); };
export async function docxToHTML(bytes) {
  const zip = readZip(bytes);
  const read = async name => (zip.has(name) ? new TextDecoder().decode(await zip.get(name).read()) : '');
  const xml = s => new DOMParser().parseFromString(s || '<x/>', 'application/xml');
  const docXml = await read('word/document.xml');
  if (!docXml) throw new Error('Ese archivo no parece un documento de Word (.docx).');
  const doc = xml(docXml), relsDoc = xml(await read('word/_rels/document.xml.rels')), stylesDoc = xml(await read('word/styles.xml')), numDoc = xml(await read('word/numbering.xml'));
  const A = (el, name) => el?.getAttributeNS(W, name) ?? el?.getAttribute(`w:${name}`) ?? null;
  const kids = (el, name) => [...(el?.childNodes || [])].filter(n => n.nodeType === 1 && n.localName === name);
  const kid = (el, name) => kids(el, name)[0] || null;
  const rels = new Map([...relsDoc.getElementsByTagName('Relationship')].map(r => [r.getAttribute('Id'), r.getAttribute('Target')]));
  // Estilos: id → nombre («Ttulo1» → «heading 1»), para saber qué es un título o una cita
  const styleName = new Map([...stylesDoc.getElementsByTagNameNS(W, 'style')].map(s => [A(s, 'styleId'), (A(kid(s, 'name'), 'val') || '').toLowerCase()]));
  // Listas: numId → abstractNum → formato de cada nivel (viñeta o número)
  const absFmt = new Map([...numDoc.getElementsByTagNameNS(W, 'abstractNum')].map(a => [A(a, 'abstractNumId'), new Map(kids(a, 'lvl').map(l => [A(l, 'ilvl'), A(kid(l, 'numFmt'), 'val')]))]));
  const numAbs = new Map([...numDoc.getElementsByTagNameNS(W, 'num')].map(n => [A(n, 'numId'), A(kid(n, 'abstractNumId'), 'val')]));
  const images = new Map();
  const imgData = async target => {
    const path = 'word/' + String(target).replace(/^\.?\//, '').replace(/^\/word\//, '');
    if (images.has(path)) return images.get(path);
    const f = zip.get(path);
    if (!f) return null;
    const ext = path.split('.').pop().toLowerCase();
    if (!MIME[ext]) return null;
    const url = `data:${MIME[ext]};base64,${toB64(await f.read())}`;
    images.set(path, url);
    return url;
  };
  const on = el => !!el && !['0', 'false', 'none'].includes(String(A(el, 'val') ?? 'true'));
  async function runHTML(r) {
    const pr = kid(r, 'rPr'), css = [];
    if (on(kid(pr, 'b'))) css.push('font-weight:700');
    if (on(kid(pr, 'i'))) css.push('font-style:italic');
    const deco = [];
    if (on(kid(pr, 'u'))) deco.push('underline');
    if (on(kid(pr, 'strike')) || on(kid(pr, 'dstrike'))) deco.push('line-through');
    if (deco.length) css.push(`text-decoration:${deco.join(' ')}`);
    const color = A(kid(pr, 'color'), 'val');
    if (color && color !== 'auto' && /^[0-9a-f]{6}$/i.test(color)) css.push(`color:#${color}`);
    const hl = A(kid(pr, 'highlight'), 'val'), fill = A(kid(pr, 'shd'), 'fill');
    if (hl && HL[hl]) css.push(`background-color:${HL[hl]}`);
    else if (fill && fill !== 'auto' && /^[0-9a-f]{6}$/i.test(fill)) css.push(`background-color:#${fill}`);
    const font = A(kid(pr, 'rFonts'), 'ascii') || '';
    if (/consolas|courier|mono/i.test(font)) css.push('font-family:monospace');
    let out = '';
    for (const n of r.childNodes) {
      if (n.nodeType !== 1) continue;
      if (n.localName === 't') out += escHTML(n.textContent);
      else if (n.localName === 'tab') out += ' ';
      else if (n.localName === 'br' || n.localName === 'cr') out += '<br>';
      else if (n.localName === 'drawing' || n.localName === 'pict') {
        const blip = n.getElementsByTagNameNS('http://schemas.openxmlformats.org/drawingml/2006/main', 'blip')[0] || n.getElementsByTagName('v:imagedata')[0];
        const rid = blip?.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'embed') || blip?.getAttribute('r:embed') || blip?.getAttribute('r:id');
        const url = rid && rels.get(rid) && await imgData(rels.get(rid));
        if (url) out += `\u0000IMG${url}\u0000`;
      }
    }
    return css.length && out ? `<span style="${css.join(';')}">${out}</span>` : out;
  }
  async function inlineHTML(p) {
    let out = '';
    for (const n of p.childNodes) {
      if (n.nodeType !== 1) continue;
      if (n.localName === 'r') out += await runHTML(n);
      else if (n.localName === 'hyperlink') {
        const href = rels.get(n.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id') || n.getAttribute('r:id'));
        let inner = '';
        for (const r of kids(n, 'r')) inner += await runHTML(r);
        out += href && /^(https?:|mailto:)/.test(href) ? `<a href="${escHTML(href)}">${inner}</a>` : inner;
      } else if (['ins', 'smartTag', 'sdt', 'sdtContent', 'fldSimple'].includes(n.localName)) out += await inlineHTML(n);
    }
    return out;
  }
  // Las imágenes van en su propio párrafo (como bloques de imagen)
  const split = html => html.split('\u0000').map(part => (part.startsWith('IMG') ? { img: part.slice(3) } : { html: part }));
  async function paraHTML(p) {
    const pr = kid(p, 'pPr');
    const sid = A(kid(pr, 'pStyle'), 'val') || '', name = styleName.get(sid) || sid.toLowerCase();
    const numPr = kid(pr, 'numPr');
    const inner = await inlineHTML(p);
    const out = [];
    for (const part of split(inner)) {
      if (part.img) { out.push(`<img src="${part.img}">`); continue; }
      const h = part.html;
      if (!h.replace(/<[^>]+>/g, '').trim()) continue;
      let m;
      if (name === 'title' || name === 'título') out.push(`<h1>${h}</h1>`);
      else if ((m = /heading\s*(\d)|t[íi]tulo\s*(\d)/.exec(name))) { const lv = Math.min(3, +(m[1] || m[2])); out.push(`<h${lv}>${h}</h${lv}>`); }
      else if (numPr) {
        const ilvl = A(kid(numPr, 'ilvl'), 'val') || '0', fmt = absFmt.get(numAbs.get(A(kid(numPr, 'numId'), 'val')))?.get(ilvl) || 'bullet';
        const tag = fmt === 'bullet' || fmt === 'none' ? 'ul' : 'ol';
        out.push(`<${tag}><li data-ind="${Math.min(4, +ilvl)}">${h}</li></${tag}>`);
      } else if (/quote|cita/.test(name)) out.push(`<blockquote>${h}</blockquote>`);
      else out.push(`<p>${h}</p>`);
    }
    return out.join('');
  }
  async function bodyHTML(el) {
    let out = '';
    for (const n of el.childNodes) {
      if (n.nodeType !== 1) continue;
      if (n.localName === 'p') out += await paraHTML(n);
      else if (n.localName === 'tbl') {
        let t = '<table>';
        for (const tr of kids(n, 'tr')) {
          t += '<tr>';
          for (const tc of kids(tr, 'tc')) {
            const span = +A(kid(kid(tc, 'tcPr'), 'gridSpan'), 'val') || 1;
            let cell = '';
            for (const p of kids(tc, 'p')) cell += (cell ? ' ' : '') + (await inlineHTML(p)).replace(/\u0000IMG[^\u0000]*\u0000/g, '');
            t += `<td${span > 1 ? ` colspan="${span}"` : ''}>${cell}</td>`;
          }
          t += '</tr>';
        }
        out += t + '</table>';
      } else if (n.localName === 'sdt') out += await bodyHTML(kid(n, 'sdtContent') || n);
    }
    return out;
  }
  const body = doc.getElementsByTagNameNS(W, 'body')[0];
  return body ? bodyHTML(body) : '';
}

/* ---------------- Otros formatos de entrada ---------------- */
// CSV o TSV → un bloque de tabla (la primera fila, de cabecera)
export function csvToBlocks(text) {
  const rows = parseCSV(text).map(r => r.map(c => c.replace(/\s*\n\s*/g, ' ').trim()));
  if (!rows.length) return [];
  const n = Math.max(...rows.map(r => r.length));
  const pad = r => Array.from({ length: n }, (_, k) => r[k] ?? '');
  return [newBlock('table', tableToMarkdown({ head: pad(rows[0]), rows: rows.slice(1).map(pad) }))];
}
// Markdown → { title, blocks }. El primer «# » es el título (si no, el nombre del archivo)
export function markdownToPage(text, fileName = '') {
  const clean = String(text ?? '').replace(/^﻿/, '').replace(/^---\n[\s\S]*?\n---\n/, '');   // sin la cabecera YAML de Obsidian
  const blocks = textToBlocks(clean);
  const title = blocks[0]?.type === 'h1' ? blocks.shift().text : titleFromFile(fileName);
  return { title, blocks };
}
// «Mitosis 2b3c…f1.md» (Notion) o «mitosis.md» → «Mitosis»
export const titleFromFile = name => String(name || '').split('/').pop().replace(/\.[^.]+$/, '').replace(/\s+[0-9a-f]{32}$/i, '').replace(/[-_]+/g, ' ').trim();
// Las imágenes que un Markdown cita con rutas relativas ( ![](carpeta/foto.png) o ![[foto.png]] de Obsidian )
export function markdownImageRefs(md) {
  const out = [];
  for (const m of String(md).matchAll(/!\[([^\]\n]*)\]\((?!img:|https?:|data:)([^)\s]+)(?:\s+"[^"]*")?\)/g)) out.push({ full: m[0], alt: m[1], path: m[2] });
  for (const m of String(md).matchAll(/!\[\[([^\]|\n]+?)(?:\|[^\]\n]*)?\]\]/g)) out.push({ full: m[0], alt: '', path: m[1], wiki: true });
  return out;
}
