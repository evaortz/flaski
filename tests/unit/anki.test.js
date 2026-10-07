import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readApkg, ankiToFlaski, ankiHtmlToText, convertNotetype, ankiProgress, ankiHistory } from '../../js/anki.js';
import { makeApkg, DAY0 } from '../anki-fixture.js';

test('HTML de Anki → texto: negrita, saltos, entidades, imágenes, sonidos y huecos', () => {
  assert.equal(ankiHtmlToText('<b>ev</b>&nbsp;de<br>casa<div>otra</div>[sound:a.mp3]'), '**ev** de\ncasa\notra');
  assert.equal(ankiHtmlToText('<img src="mapa%20t.png">Turquía', n => (n === 'mapa t.png' ? 'abc123' : null)), '![](img:abc123)\nTurquía');
  assert.equal(ankiHtmlToText('<img src="falta.png">x', () => null), 'x');
  assert.equal(ankiHtmlToText('Ev{{c1::de::lugar}} okul{{c2::da}}'), 'Ev{{de::lugar}} okul{{da}}');
  assert.equal(ankiHtmlToText('<style>.x{}</style>&lt;3 &#233;'), '<3 é');
});

test('tipos de nota: los corrientes pasan a los de Flaski; el resto, a un tipo propio', () => {
  const basic = convertNotetype({ id: '1', name: 'Basic', fields: ['Front', 'Back'], templates: [{ ord: 0, q: '{{Front}}', a: '{{FrontSide}}<hr>{{Back}}' }] });
  assert.equal(basic.type.id, 'basic');
  assert.deepEqual(basic.map(['a', 'b']), { q: 'a', a: 'b' });
  const typing = convertNotetype({ id: '2', name: 'Basic (type in)', fields: ['Front', 'Back'], templates: [{ ord: 0, q: '{{Front}}{{type:Back}}', a: '{{FrontSide}}' }] });
  assert.equal(typing.type.id, 'typing');
  const own = convertNotetype({ id: '3', name: 'Japanese', fields: ['Expression', 'Meaning', 'Reading'], templates: [{ ord: 0, name: 'Recognition', q: '{{Expression}}', a: '{{FrontSide}}{{furigana:Reading}}{{Meaning}}' }] });
  assert.equal(own.type.builtin, false);
  assert.deepEqual(own.type.templates, [{ id: 't1', name: 'Recognition', mode: 'flip', front: ['f1'], back: ['f3', 'f2'] }]);
  assert.deepEqual(own.type.fields.map(f => f.name), ['Expression', 'Meaning', 'Reading']);
});

test('progreso: repaso con su fecha e intervalo; nueva sin progreso; aprendiendo para ya', () => {
  const now = DAY0 + 500 * 864e5;
  const p = ankiProgress({ type: 2, due: 400, ivl: 10, factor: 2300, reps: 5, lapses: 1 }, DAY0 / 1000, now);
  assert.equal(p.due, DAY0 + 400 * 864e5);
  assert.deepEqual([p.interval, p.ease, p.reps, p.lapses], [10, 2.3, 5, 1]);
  assert.equal(ankiProgress({ type: 0 }, 0, now), null);
  assert.deepEqual([ankiProgress({ type: 1, reps: 1 }, 0, now).interval, ankiProgress({ type: 1, reps: 1 }, 0, now).due], [0, now]);
});

for (const modern of [false, true]) {
  test(`leer un .apkg ${modern ? 'del formato nuevo (anki21b)' : 'del formato antiguo'}`, async () => {
    const col = await readApkg(makeApkg({ modern }));
    assert.equal(col.notetypes.length, 4);
    assert.ok(col.media.has('puerta.png'));
    let n = 0;
    const r = ankiToFlaski(col, { newImageId: () => 'img' + (++n) });
    assert.deepEqual(r.decks.map(d => [d.path.join('::'), d.cards.length]), [['Idiomas::Japonés', 1], ['Idiomas::Turco', 5]]);
    assert.equal(r.skipped, 1);
    const tr = r.decks[1].cards;
    assert.deepEqual(tr.map(c => [c.type_id, c.template]), [['basic', 't1'], ['basic', 't1'], ['reverse', 't1'], ['reverse', 't2'], ['cloze', 't1']]);
    assert.equal(tr[0].fields.q, '**ev**');
    assert.deepEqual(tr[0].tagNames, ['turco › básico']);
    assert.equal(tr[1].fields.q, 'kapı\n![](img:img1)');
    assert.equal(tr[1].fields.a, 'puerta\nla de casa');
    assert.equal(tr[4].fields.x, 'Ev{{de::lugar}} y okul{{da}}');
    assert.deepEqual([...r.images], [['puerta.png', 'img1']]);
    const ja = r.decks[0].cards[0];
    assert.equal(ja.fields.f3, '水[みず]');
    assert.equal(r.types.length, 1);
    // Historial: las respuestas de las tarjetas importadas
    const { events, seen } = ankiHistory(col.revlog, [tr[0].anki]);
    assert.equal(events.length, 5);
    assert.equal(events[0].state, 'new');
    assert.equal(events[1].state, 'review');
    assert.equal(seen.get(tr[0].anki).first, events[0].t);
  });
}
