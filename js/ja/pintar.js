// Japonés · cómo se pinta un campo de japonés ya convertido a HTML (el de fmt): el furigana solo en lo que no sabes
// (o siempre, o nunca), las partículas en color y la línea de la entonación de una palabra.
import { particlesByRule, PARTICLES } from './particulas.js';
import { hira } from './texto.js';

// furi: 'auto' | 'always' | 'never'; needsRuby(base) dice si hace falta en 'auto'; particles: true para colorearlas
export function jaHTML(html, { furi = 'always', needsRuby = () => true, particles = false } = {}) {
  let out = String(html || '');
  if (furi !== 'always') out = out.replace(/<ruby>([^<]*)<rt>([^<]*)<\/rt><\/ruby>/g, (m, base) => (furi === 'never' || !needsRuby(base) ? base : m));
  if (particles) out = colorParticles(out);
  return out;
}

// Trozos del HTML: etiquetas y texto (el de dentro de <rt> no cuenta como texto de la frase)
function parts(html) {
  const out = [];
  let inRt = false;
  for (const m of html.matchAll(/(<[^>]+>)|([^<]+)/g)) {
    if (m[1]) { const t = m[1].toLowerCase(); if (t.startsWith('<rt')) inRt = true; else if (t.startsWith('</rt')) inRt = false; out.push({ tag: m[1] }); }
    else out.push({ text: m[2], inRt });
  }
  return out;
}
const unent = s => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
const ent = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
export function colorParticles(html) {
  const ps = parts(html);
  const plain = ps.filter(p => p.text !== undefined && !p.inRt).map(p => unent(p.text)).join('');
  const at = new Map(particlesByRule(plain).map(x => [x.at, x.p]));
  if (!at.size) return html;
  let i = 0, out = '';
  for (const p of ps) {
    if (p.tag) { out += p.tag; continue; }
    if (p.inRt) { out += p.text; continue; }
    const chars = [...unent(p.text)];
    for (let k = 0; k < chars.length; k++) {
      const pt = at.get(i);
      if (pt && chars.slice(k, k + [...pt].length).join('') === pt) {
        out += `<span class="ja-pt ja-pt-${PARTICLES[pt]?.color || 'gray'}" data-pt="${pt}" role="button" tabindex="0">${ent(pt)}</span>`;
        k += [...pt].length - 1; i += [...pt].length;
        continue;
      }
      out += ent(chars[k]); i++;
    }
  }
  return out;
}

// Las moras de una lectura (las pequeñas ゃ, ゅ, ょ… van con la de antes)
export function moras(reading) {
  const out = [];
  for (const c of [...hira(reading)]) { if ('ゃゅょぁぃぅぇぉゎ'.includes(c) && out.length) out[out.length - 1] += c; else out.push(c); }
  return out;
}
// Alta o baja cada mora según el número de la entonación (0: llana; 1: la primera alta; n: sube y baja tras la n)
export function pitchPattern(reading, n) {
  const ms = moras(reading);
  return ms.map((m, i) => ({ m, hi: n === 0 ? i > 0 : n === 1 ? i === 0 : i > 0 && i < n }));
}
// La línea de la entonación, en HTML (cada mora con su raya arriba o abajo; donde cambia, un escalón)
export function pitchHTML(reading, n) {
  const p = pitchPattern(reading, n);
  if (!p.length) return '';
  const say = n === 0 ? 'baja y sube y se queda' : n === 1 ? 'empieza alta y baja' : `sube y baja tras la ${n}.ª`;
  return `<span class="ja-pitch" lang="ja" role="img" aria-label="Entonación: ${say}">${p.map((x, i) => `<span class="${x.hi ? 'hi' : 'lo'}${i && p[i - 1].hi !== x.hi ? ' step' : ''}">${x.m}</span>`).join('')}</span>`;
}
