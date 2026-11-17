// Genera data/ja/jlpt.json: las palabras del N5 y del N4 con su significado en español.
// Listas de Jonathan Waller (tanos.co.uk, Creative Commons BY), tomadas de stephenmk/yomitan-jlpt-vocab
// (original_data/n5.csv y n4.csv, CC BY-SA 4.0), guardadas en tests/tools/jlpt/. El significado sale de nuestro
// diccionario (data/ja/dic, JMdict de EDRDG, CC BY-SA 4.0); si no tiene español, se queda el de Waller en inglés.
// Uso, desde tests/: node tools/jlpt.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const dic = path.join(root, 'data/ja/dic');
const shards = new Map();
const shard = ch => {
  if (!shards.has(ch)) {
    const f = path.join(dic, ch.codePointAt(0).toString(16) + '.json');
    shards.set(ch, fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : { e: [], w: {} });
  }
  return shards.get(ch);
};
const entries = w => { const s = shard([...w][0]); return (s.w[w] || []).map(i => s.e[i]); };

function csv(file) {
  const [head, ...rows] = fs.readFileSync(file, 'utf8').replace(/^﻿/, '').trim().split(/\r?\n/);
  const cols = head.split(',');
  return rows.map(line => {
    const out = [], re = /("([^"]|"")*"|[^,]*)(,|$)/g;
    let m;
    while ((m = re.exec(line)) && out.length < cols.length) { out.push(m[1].replace(/^"|"$/g, '').replace(/""/g, '"')); if (!m[3]) break; }
    return Object.fromEntries(cols.map((c, i) => [c, out[i] || '']));
  });
}

// Las que el diccionario no tiene en español, traducidas a mano
const ES = {
  いい: 'bueno, bien', いいえ: 'no', お酒: 'alcohol, sake', お皿: 'plato', おじさん: 'tío, señor', 伯母さん: 'tía',
  キログラム: 'kilogramo', コップ: 'vaso', さ来年: 'dentro de dos años', テープレコーダー: 'grabadora', とり肉: 'pollo (la carne)',
  はい: 'sí', バス: 'autobús', ペット: 'mascota', マッチ: 'cerilla', もう一度: 'otra vez', ラジオカセット: 'radiocasete',
  あ: '¡ah!', ああ: 'así, de esa manera', アルバイト: 'trabajo a tiempo parcial',
  いらっしゃる: 'ir, venir, estar (respetuoso)', おいでになる: 'ir, venir, estar (respetuoso)', おかげ: 'gracias a',
  お祭り: 'fiesta, festival', お見舞い: 'visita a un enfermo', 会議室: 'sala de reuniones', お金持ち: 'rico, persona rica',
  御主人: 'su marido (de otra persona)', さ来月: 'dentro de dos meses', さ来週: 'dentro de dos semanas', 然る: 'cierto, tal',
  それほど: 'tanto, hasta ese punto', チェック: 'comprobar, revisar', 妻: 'mi mujer, esposa', 二階建て: 'de dos plantas',
  ビル: 'edificio', 舟: 'barca', 降り出す: 'empezar a llover', ベル: 'timbre', もうすぐ: 'pronto, dentro de poco',
  やっと: 'por fin', 泳ぎ方: 'manera de nadar'
};
let noEs = 0;
const fixed = [], sinEs = [];
function words(level) {
  return csv(path.join(root, `tests/tools/jlpt/n${level}.csv`)).map(r => {
    let k = r.kanji.trim();
    const kana = r.kana.trim();
    let cands = k ? entries(k) : entries(kana);
    let e = cands.find(x => x.r?.includes(kana) && (!k || x.k?.includes(k))) || cands.find(x => x.r?.includes(kana));
    if (k && !e) {
      // Waller escribe alguna palabra a su manera (明い): se queda la forma del diccionario (明るい)
      e = entries(kana).find(x => x.r?.includes(kana) && x.k?.some(f => f[0] === k[0]));
      if (e) { fixed.push(`${k} → ${e.k.find(f => f[0] === k[0])}`); k = e.k.find(f => f[0] === k[0]); }
    }
    e = e || cands[0];
    const es = ES[k || kana] || (e?.es?.length ? e.es.slice(0, 2).join(', ') : '');
    if (!es) { noEs++; sinEs.push(k || kana); }
    return [k, kana, es || r.waller_definition.trim()];
  });
}
const out = { fuente: 'Jonathan Waller (tanos.co.uk), CC BY; significados de JMdict (EDRDG), CC BY-SA 4.0', n5: words(5), n4: words(4) };
fs.writeFileSync(path.join(root, 'data/ja/jlpt.json'), JSON.stringify(out));
console.log('N5', out.n5.length, 'N4', out.n4.length, 'sin español', noEs);
console.log('corregidas:', fixed.join(' · '));
console.log('sin español:', sinEs.join(' · '));
