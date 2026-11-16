// Japonés · los kana: la tabla de siempre (por filas, a i u e o), cómo se escriben en letras, un truco para cada uno
// (escritos para Flaski) y las parejas que se suelen confundir

// Filas de la tabla: [hiragana, katakana, romaji (con otras formas válidas tras «/»), truco del hiragana, truco del katakana]
export const ROWS = [
  [['あ', 'ア', 'a', 'Una «a» con un lazo que da la vuelta.', 'Un hacha (ア) que corta: «¡aaah!».'],
    ['い', 'イ', 'i', 'Dos palitos juntos, como «ii».', 'Una persona de lado: 亻, «i».'],
    ['う', 'ウ', 'u', 'Una oreja con algo encima: escucha «u».', 'Como う, pero con techo.'],
    ['え', 'エ', 'e', 'Alguien que estira una pierna: «¡eh!».', 'Una viga de hierro: «e».'],
    ['お', 'オ', 'o', 'Un muñeco que saluda: «¡oh!».', 'Alguien que abre los brazos: «¡oh!».']],
  [['か', 'カ', 'ka', 'Una navaja que corta un hilo: «ka».', 'Como か, sin la rayita.'],
    ['き', 'キ', 'ki', 'Una llave (key) con dos dientes.', 'Como き, sin la curva de abajo.'],
    ['く', 'ク', 'ku', 'El pico abierto de un cuco: «cu».', 'Un pico con tejado.'],
    ['け', 'ケ', 'ke', 'Un barril (keg) junto a un palo.', 'Una «k» torcida.'],
    ['こ', 'コ', 'ko', 'Dos gusanos tumbados: «co».', 'Una esquina: las dos rayas de こ unidas.']],
  [['さ', 'サ', 'sa', 'Un sable clavado: «sa».', 'Dos postes y una barra.'],
    ['し', 'シ', 'shi / si', 'Un anzuelo: «shi».', 'Dos rayitas a la izquierda y el trazo largo sube.'],
    ['す', 'ス', 'su', 'Un columpio con un lazo: «su».', 'Una persona que corre.'],
    ['せ', 'セ', 'se', 'Una boca con un diente: «se».', 'Como せ, sin una pata.'],
    ['そ', 'ソ', 'so', 'Un zigzag como un rayo: «so».', 'Dos rayas que bajan juntas, casi en vertical.']],
  [['た', 'タ', 'ta', 'Una «t» y una «a»: ta.', 'Como ク, con una rayita dentro.'],
    ['ち', 'チ', 'chi / ti', 'Un 5 al revés: «chi».', 'Un mechón que cae.'],
    ['つ', 'ツ', 'tsu / tu', 'Una ola: «tsu-nami».', 'Dos rayitas arriba y el trazo largo baja.'],
    ['て', 'テ', 'te', 'Una mano (te) extendida.', 'Una antena de televisión.'],
    ['と', 'ト', 'to', 'Un dedo del pie (toe) con una astilla.', 'Un poste con una rama.']],
  [['な', 'ナ', 'na', 'Una monja (nun) rezando con un nudo.', 'Una cruz torcida.'],
    ['に', 'ニ', 'ni', 'Una rodilla (knee) y dos rayas.', 'Dos rayas: «ni» (二 es dos).'],
    ['ぬ', 'ヌ', 'nu', 'Un fideo (noodle) enredado que acaba en un lazo.', 'Una cuchara con una raya.'],
    ['ね', 'ネ', 'ne', 'Un gato (neko) con la cola enroscada.', 'Un altar con una rayita.'],
    ['の', 'ノ', 'no', 'Una señal de «no» con una vuelta.', 'Una sola barrida.']],
  [['は', 'ハ', 'ha', 'Una «h» y una «a» juntas: ha.', 'Dos rayas que se abren: «ja, ja».'],
    ['ひ', 'ヒ', 'hi', 'Una sonrisa: «ji, ji».', 'Una silla de lado.'],
    ['ふ', 'フ', 'fu / hu', 'El monte Fuji con nubes.', 'Un gancho: «fu».'],
    ['へ', 'ヘ', 'he', 'Una montaña: «he».', 'Igual que el hiragana へ.'],
    ['ほ', 'ホ', 'ho', 'Una cruz con un lazo: «ho».', 'Una cruz con dos pies.']],
  [['ま', 'マ', 'ma', 'Una mamá con un lazo en la cabeza.', 'Una nariz de perfil.'],
    ['み', 'ミ', 'mi', 'El número 21: «mi».', 'Tres rayitas: «mi».'],
    ['む', 'ム', 'mu', 'Una vaca que dice «mu».', 'Un brazo doblado.'],
    ['め', 'メ', 'me', 'Un ojo (me) sin lazo al final.', 'Una «x» torcida.'],
    ['も', 'モ', 'mo', 'Un anzuelo con dos peces.', 'Como も, más recto.']],
  [['や', 'ヤ', 'ya', 'Un yak con cuernos.', 'Como や, con menos trazos.'],
    null,
    ['ゆ', 'ユ', 'yu', 'Un pez de lado: «yu».', 'Una «U» tumbada.'],
    null,
    ['よ', 'ヨ', 'yo', 'Un yoyó con su cuerda.', 'Una «E» al revés.']],
  [['ら', 'ラ', 'ra', 'Un conejo (rabbit) con una oreja.', 'Una rayita y un gancho.'],
    ['り', 'リ', 'ri', 'Dos juncos junto al río.', 'Dos rayas, la de la derecha más larga.'],
    ['る', 'ル', 'ru', 'Una ruta que acaba en un lazo.', 'Dos raíces.'],
    ['れ', 'レ', 're', 'Una persona arrodillada que se levanta: «re».', 'Una raya que sube.'],
    ['ろ', 'ロ', 'ro', 'Como る, pero sin lazo: «ro».', 'Una boca cuadrada.']],
  [['わ', 'ワ', 'wa', 'Un cisne nadando: «wa».', 'Como ウ, sin el punto.'],
    null, null, null,
    ['を', 'ヲ', 'o / wo', 'Un hombre que salta: se lee «o».', 'Como フ con una raya.']],
  [['ん', 'ン', 'n / nn', 'Una «n» escrita deprisa.', 'Una rayita y el trazo largo sube desde abajo.'], null, null, null, null],
];
export const ALL = ROWS.flat().filter(Boolean).map(([h, k, r, th, tk]) => ({ h, k, r, th, tk }));
// Las parejas que se suelen confundir (y la pista corta para distinguirlas)
export const PAIRS = [
  ['シ', 'ツ', 'En シ las rayitas están a la izquierda y el trazo largo sube; en ツ están arriba y baja.'],
  ['ソ', 'ン', 'En ソ las dos rayas bajan casi rectas; en ン la rayita es horizontal y el trazo largo sube.'],
  ['ぬ', 'め', 'ぬ lleva un lazo al final; め no.'],
  ['わ', 'れ', 'わ acaba en curva hacia dentro; れ acaba en una cola hacia fuera.'],
  ['ね', 'れ', 'ね acaba en un lazo; れ, en una cola hacia fuera.'],
  ['る', 'ろ', 'る lleva un lazo al final; ろ no.'],
  ['さ', 'き', 'き tiene dos rayas arriba; さ, una.'],
  ['は', 'ほ', 'ほ tiene una raya más arriba.'],
  ['ク', 'ケ', 'ケ tiene la raya de arriba que sobresale a la derecha.'],
  ['ウ', 'ワ', 'ウ lleva un punto arriba; ワ no.'],
  ['コ', 'ユ', 'コ es una esquina abierta a la izquierda; ユ, una base larga abajo.'],
];
// La pareja de un kana (o null) y su pista
export function pairOf(c) {
  const p = PAIRS.find(([a, b]) => a === c || b === c);
  return p ? { other: p[0] === c ? p[1] : p[0], tip: p[2] } : null;
}
// El romaji principal (sin las otras formas)
export const romaji = r => String(r || '').split('/')[0].trim();
// El kana cuyo romaji es este, en el mismo alfabeto que c (para «has puesto tsu y era shi»)
export function kanaForRomaji(r, kataLike) {
  const x = String(r || '').trim().toLowerCase();
  const hit = ALL.find(k => k.r.split('/').map(s => s.trim()).includes(x));
  return hit ? (kataLike ? hit.k : hit.h) : null;
}
