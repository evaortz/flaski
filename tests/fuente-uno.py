# Genera fonts/flaski-uno.woff2: el «1», dibujado como un palo con un trazo corto arriba, y el «#» de las
# etiquetas, con cuatro trazos un poco torcidos (el de Gochi Hand es casi el de una letra normal)
import math, sys
from fontTools.fontBuilder import FontBuilder
from fontTools.pens.ttGlyphPen import TTGlyphPen

def capsule(pen, a, b, w):
    r = w / 2
    dx, dy = b[0] - a[0], b[1] - a[1]; L = math.hypot(dx, dy); d = (dx / L, dy / L); n = (-d[1], d[0])
    P = lambda p, *v: (round(p[0] + sum(x[0] * k for x, k in v)), round(p[1] + sum(x[1] * k for x, k in v)))
    pts = [('on', P(a, (n, -r))), ('on', P(b, (n, -r))), ('off', P(b, (n, -r), (d, r))), ('on', P(b, (d, r))), ('off', P(b, (n, r), (d, r))),
           ('on', P(b, (n, r))), ('on', P(a, (n, r))), ('off', P(a, (n, r), (d, -r))), ('on', P(a, (d, -r))), ('off', P(a, (n, -r), (d, -r)))]
    # sentido de las agujas del reloj (TrueType)
    poly = [p for _, p in pts]
    area = sum(poly[i][0] * poly[(i + 1) % len(poly)][1] - poly[(i + 1) % len(poly)][0] * poly[i][1] for i in range(len(poly)))
    if area > 0: pts = [pts[0]] + pts[1:][::-1]
    pen.moveTo(pts[0][1]); i = 1
    while i < len(pts):
        kind, p = pts[i]
        if kind == 'on': pen.lineTo(p); i += 1
        else: pen.qCurveTo(p, pts[(i + 1) % len(pts)][1]); i += 2
    pen.closePath()

pen = TTGlyphPen(None)
W = 150
capsule(pen, (430, 20), (470, 960), W)      # el palo, apenas inclinado
capsule(pen, (470, 960), (310, 830), W)     # el trazo corto arriba
one = pen.glyph()
pen = TTGlyphPen(None)
H = 110
capsule(pen, (330, 60), (420, 860), H)      # las dos rayas que suben, inclinadas y no del todo paralelas
capsule(pen, (610, 40), (690, 880), H)
capsule(pen, (150, 600), (860, 640), H)     # las dos que cruzan, una algo más corta
capsule(pen, (110, 310), (800, 290), H)
hashg = pen.glyph()
nd = TTGlyphPen(None).glyph()
fb = FontBuilder(2048, isTTF=True)
fb.setupGlyphOrder(['.notdef', 'one', 'numbersign'])
fb.setupCharacterMap({0x31: 'one', 0x23: 'numbersign'})
fb.setupGlyf({'.notdef': nd, 'one': one, 'numbersign': hashg})
g = fb.font['glyf']['one']; g.recalcBounds(fb.font['glyf'])
h = fb.font['glyf']['numbersign']; h.recalcBounds(fb.font['glyf'])
fb.setupHorizontalMetrics({'.notdef': (827, 0), 'one': (827, g.xMin), 'numbersign': (980, h.xMin)})
fb.setupHorizontalHeader(ascent=1579, descent=-835)
fb.setupNameTable({'familyName': 'Flaski Uno', 'styleName': 'Regular'})
fb.setupOS2(sTypoAscender=1579, sTypoDescender=-835, usWinAscent=1579, usWinDescent=835)
fb.setupPost()
fb.font.recalcBBoxes = True
fb.font.flavor = 'woff2'
fb.save(sys.argv[1])
