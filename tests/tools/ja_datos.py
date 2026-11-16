# Datos de japonés para Flaski: kanji.json y el diccionario troceado (data/ja/).
# Se ejecuta solo para actualizar los datos, no al publicar:
#   python -I tests/tools/ja_datos.py <carpeta con los originales> <carpeta de salida (data/ja)>
# Originales (EDRDG, CC BY-SA 4.0 · Kanjium, CC BY-SA 4.0):
#   kanjidic2.xml.gz  http://www.edrdg.org/kanjidic/kanjidic2.xml.gz
#   kradfile.gz       http://ftp.edrdg.org/pub/Nihongo/kradfile.gz
#   JMdict.gz         http://ftp.edrdg.org/pub/Nihongo/JMdict.gz
#   accents.txt       https://github.com/mifunetoshiro/kanjium (data/source_files/raw/accents.txt)
import gzip, json, os, re, sys
import xml.etree.ElementTree as ET

SRC, OUT = sys.argv[1], sys.argv[2]
os.makedirs(os.path.join(OUT, 'dic'), exist_ok=True)

# KRADFILE usa caracteres completos para algunas piezas: aquí, la pieza tal como se ve dentro del kanji
KRAD_FIX = {'化': '亻', '个': '𠆢', '并': '丷', '刈': '刂', '忙': '忄', '扎': '扌', '汁': '氵', '犯': '犭', '艾': '艹',
            '邦': '阝', '阡': '阝', '尚': '⺌', '杰': '灬', '礼': '礻', '疔': '疒', '初': '衤', '老': '耂', '込': '辶', '買': '罒'}


def kata2hira(s):
    return ''.join(chr(ord(c) - 0x60) if 'ァ' <= c <= 'ヶ' else c for c in s)


# ---------- kanji ----------
krad = {}
with gzip.open(os.path.join(SRC, 'kradfile.gz'), 'rb') as f:
    for line in f.read().decode('euc_jp', errors='ignore').splitlines():
        if line.startswith('#') or ' : ' not in line:
            continue
        k, parts = line.split(' : ', 1)
        krad[k.strip()] = [KRAD_FIX.get(p, p) for p in parts.split()]

kanji = {}
with gzip.open(os.path.join(SRC, 'kanjidic2.xml.gz'), 'rb') as f:
    root = ET.parse(f).getroot()
for ch in root.iter('character'):
    lit = ch.findtext('literal')
    misc = ch.find('misc')
    grade = misc.findtext('grade')
    jlpt = misc.findtext('jlpt')
    if not grade or int(grade) > 8:      # los 2.136 de uso común (jōyō)
        continue
    on, kun, es, en = [], [], [], []
    rm = ch.find('reading_meaning')
    if rm is not None:
        for r in rm.iter('reading'):
            t = r.get('r_type')
            if t == 'ja_on':
                on.append(kata2hira(r.text))
            elif t == 'ja_kun':
                kun.append(r.text)
        for m in rm.iter('meaning'):
            lang = m.get('m_lang')
            if lang == 'es':
                es.append(m.text)
            elif lang is None:
                en.append(m.text)
    item = {'s': int(misc.findtext('stroke_count') or 0), 'on': on, 'kun': kun, 'es': es[:4], 'en': en[:3]}
    if jlpt:
        item['j'] = int(jlpt)       # el JLPT antiguo: 4 = N5, 3 = N4, 2 = N3/N2, 1 = N1
    item['g'] = int(grade)
    if misc.findtext('freq'):
        item['f'] = int(misc.findtext('freq'))
    if lit in krad:
        item['p'] = [p for p in krad[lit] if p != lit]
    kanji[lit] = item

with open(os.path.join(OUT, 'kanji.json'), 'w', encoding='utf8') as f:
    json.dump(kanji, f, ensure_ascii=False, separators=(',', ':'))
print('kanji', len(kanji), 'con español', sum(1 for k in kanji.values() if k['es']))

# ---------- entonación (Kanjium): palabra \t lectura \t acentos ----------
accent = {}
with open(os.path.join(SRC, 'accents.txt'), encoding='utf8') as f:
    for line in f:
        parts = line.rstrip('\n').split('\t')
        if len(parts) >= 3:
            w, r, a = parts[0], parts[1] or parts[0], parts[2]
            n = re.match(r'\d+', a)
            if n:
                accent[(w, kata2hira(r))] = int(n.group())

# ---------- diccionario: solo palabras comunes ----------
PRI = {'news1', 'ichi1', 'spec1', 'spec2', 'gai1'}
POS = {'v1': 'v1', 'v1-s': 'v1', 'vs-i': 'vs', 'vs-s': 'vs', 'vs': 'vs', 'vk': 'vk', 'vz': 'vz', 'adj-i': 'i', 'adj-ix': 'i', 'adj-na': 'na',
       'n': 'n', 'prt': 'prt', 'adv': 'adv', 'exp': 'exp', 'pn': 'pn', 'int': 'int', 'conj': 'conj', 'aux-v': 'aux', 'ctr': 'ctr', 'pref': 'pref', 'suf': 'suf'}

raw = gzip.open(os.path.join(SRC, 'JMdict.gz'), 'rb').read().decode('utf8')
# Las etiquetas de tipo de palabra son entidades (&v5k;): se dejan como texto para leerlas
raw = re.sub(r'<!DOCTYPE JMdict \[.*?\]>', '', raw, flags=re.S)
raw = re.sub(r'&([\w-]+);', r'\1', raw)
entries = []
for ent in ET.fromstring(raw).iter('entry'):
    kebs = [(k.findtext('keb'), {p.text for p in k.findall('ke_pri')}) for k in ent.findall('k_ele')]
    rebs = [(r.findtext('reb'), {p.text for p in r.findall('re_pri')}, r.find('re_nokanji') is not None) for r in ent.findall('r_ele')]
    common = any(p & PRI for _, p in kebs) or any(p & PRI for _, p, _ in rebs)
    if not common:
        continue
    ks = [k for k, p in kebs if p & PRI] or [k for k, _ in kebs[:1]]
    rs = [r for r, p, _ in rebs if p & PRI] or [rebs[0][0]]
    pos, es, en = [], [], []
    for s in ent.findall('sense'):
        for p in s.findall('pos'):
            t = p.text.strip()
            v = POS.get(t) or (t if t.startswith('v5') else None)
            if v and v not in pos:
                pos.append(v)
        for g in s.findall('gloss'):
            lang = g.get('{http://www.w3.org/XML/1998/namespace}lang', 'eng')
            if lang == 'spa' and len(es) < 4:
                es.append(g.text)
            elif lang == 'eng' and len(en) < 3:
                en.append(g.text)
    e = {'k': ks, 'r': rs, 'p': pos}
    if es:
        e['es'] = es
    if en:
        e['en'] = en
    a = accent.get((ks[0] if ks else rs[0], rs[0]))
    if a is not None:
        e['a'] = a
    entries.append(e)

# Trozos por el primer carácter de cada forma (kanji o lectura); un trozo por carácter
shards = {}
for i, e in enumerate(entries):
    for key in set(e['k'] + e['r']):
        shards.setdefault(key[0], {}).setdefault(key, []).append(i)
total = 0
for ch, keys in shards.items():
    ids = sorted({i for v in keys.values() for i in v})
    local = {i: n for n, i in enumerate(ids)}
    data = {'e': [entries[i] for i in ids], 'w': {k: [local[i] for i in v] for k, v in keys.items()}}
    s = json.dumps(data, ensure_ascii=False, separators=(',', ':'))
    total += len(s.encode('utf8'))
    with open(os.path.join(OUT, 'dic', '%x.json' % ord(ch)), 'w', encoding='utf8') as f:
        f.write(s)
print('palabras', len(entries), 'con español', sum(1 for e in entries if 'es' in e), 'con entonación', sum(1 for e in entries if 'a' in e))
print('trozos', len(shards), 'MB', round(total / 1e6, 1))
