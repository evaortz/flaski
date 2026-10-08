// Crea un PDF de prueba de verdad (Helvetica y Helvetica-Bold, con tildes): un título grande, un apartado,
// un párrafo partido en varias líneas, una lista y un número de página; y una segunda página sin texto
// (solo un dibujo), como si estuviera escaneada.
export function makePdf() {
  const text = (font, size, x, y, s) => `BT /${font} ${size} Tf ${x} ${y} Td (${s.replace(/[()\\]/g, '\\$&').replace(/•/g, '\x95')}) Tj ET`;   // en WinAnsi, «•» es el byte 0x95
  const page1 = [
    text('F2', 24, 50, 780, 'Los casos del turco'),
    text('F2', 16, 50, 740, 'El locativo'),
    text('F1', 11, 50, 715, 'El locativo indica dónde está algo. Se forma con'),
    text('F1', 11, 50, 701, 'el sufijo -de o -da según la armonía vocálica.'),
    text('F2', 11, 50, 672, 'Ejemplos'),
    text('F1', 11, 60, 652, '• evde: en casa'),
    text('F1', 11, 60, 638, '• okulda: en la escuela'),
    text('F1', 9, 290, 30, '1'),
  ].join('\n');
  const page2 = '0.2 0.4 0.8 rg 100 300 400 300 re f';
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> /Contents 7 0 R >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << >> /Contents 8 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',
    `<< /Length ${Buffer.byteLength(page1, 'latin1')} >>\nstream\n${page1}\nendstream`,
    `<< /Length ${page2.length} >>\nstream\n${page2}\nendstream`,
    '<< /Title (Microsoft Word - casos.docx) >>',
  ];
  let out = '%PDF-1.4\n';
  const offs = [];
  objs.forEach((o, i) => { offs.push(Buffer.byteLength(out, 'latin1')); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = Buffer.byteLength(out, 'latin1');
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offs.map(o => String(o).padStart(10, '0') + ' 00000 n \n').join('')}`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R /Info 9 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}
