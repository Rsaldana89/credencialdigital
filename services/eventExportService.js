const { PassThrough } = require('stream');
const archiver = require('archiver');
const sharp = require('sharp');
const eventService = require('./eventService');
const { formatUtcDateTimeInEventZone } = require('../utils/timeZone');

function xmlEscape(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function formatDateTime(value) {
  if (!value) return '';
  const text = String(value).replace('T', ' ').slice(0, 19);
  const match = /^(\d{4})-(\d{2})-(\d{2})[ ](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(text);
  if (!match) return text;
  return `${match[3]}/${match[2]}/${match[1]} ${match[4]}:${match[5]}`;
}

function formatDate(value) {
  if (!value) return '';
  const text = String(value).slice(0, 10);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : text;
}

function buildExportRows(event, attendees) {
  const referenceDate = String(event.event_date || '').slice(0, 10);
  return attendees.map((attendee) => {
    const tenure = eventService.getTenureDetails(attendee.start_date_snapshot, referenceDate);
    return {
      employee_number: eventService.formatEmployeeNumber(attendee.employee_number),
      full_name: attendee.full_name_snapshot || '',
      puesto: attendee.puesto_snapshot || '',
      department: attendee.department_snapshot || '',
      start_date: formatDate(attendee.start_date_snapshot),
      tenure: tenure.label,
      tenure_group: tenure.groupLabel,
      tenure_group_short: tenure.groupShortLabel,
      attended: attendee.attended_at ? 'Sí' : 'No',
      attended_at: formatUtcDateTimeInEventZone(attendee.attended_at, ''),
      attendance_method: attendee.attendance_method || '',
      prize: attendee.award_type === 'PREMIO' ? 'Sí' : 'No',
      consolation: attendee.award_type === 'CONSOLACION' ? 'Sí' : 'No',
      award_at: formatUtcDateTimeInEventZone(attendee.award_delivered_at, ''),
      award_by: attendee.award_delivered_by || ''
    };
  });
}

function columnName(index) {
  let value = index + 1;
  let name = '';
  while (value > 0) {
    const remainder = (value - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    value = Math.floor((value - 1) / 26);
  }
  return name;
}

function inlineCell(ref, value, style = 0) {
  const text = String(value ?? '');
  const preserve = /^\s|\s$|\n/.test(text) ? ' xml:space="preserve"' : '';
  return `<c r="${ref}" t="inlineStr" s="${style}"><is><t${preserve}>${xmlEscape(text)}</t></is></c>`;
}

function buildWorksheetXml(event, exportRows) {
  const fiesta = event.event_type === 'FIESTA_PREMIOS';
  const headers = [
    'Número de empleado',
    'Nombre',
    'Puesto',
    'Departamento',
    'Fecha de ingreso',
    'Antigüedad',
    'Rango de antigüedad',
    'Asistió',
    'Hora de asistencia',
    'Método'
  ];
  if (fiesta) {
    headers.push('Premio', 'Premio de consolación', 'Hora de entrega', 'Registrado por');
  }

  const widths = fiesta
    ? [18, 38, 28, 26, 16, 20, 22, 12, 20, 14, 12, 22, 20, 22]
    : [18, 38, 28, 26, 16, 20, 22, 12, 20, 14];

  const rows = [];
  rows.push(`<row r="1" ht="22" customHeight="1">${headers.map((header, index) => inlineCell(`${columnName(index)}1`, header, 1)).join('')}</row>`);

  exportRows.forEach((row, rowIndex) => {
    const values = [
      row.employee_number,
      row.full_name,
      row.puesto,
      row.department,
      row.start_date,
      row.tenure,
      row.tenure_group,
      row.attended,
      row.attended_at,
      row.attendance_method
    ];
    if (fiesta) values.push(row.prize, row.consolation, row.award_at, row.award_by);
    const excelRow = rowIndex + 2;
    rows.push(`<row r="${excelRow}">${values.map((value, index) => inlineCell(`${columnName(index)}${excelRow}`, value, 0)).join('')}</row>`);
  });

  const lastColumn = columnName(headers.length - 1);
  const lastRow = Math.max(1, exportRows.length + 1);
  const cols = widths.map((width, index) => `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`).join('');

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
  <sheetFormatPr defaultRowHeight="15"/>
  <cols>${cols}</cols>
  <sheetData>${rows.join('')}</sheetData>
  <autoFilter ref="A1:${lastColumn}${lastRow}"/>
</worksheet>`;
}

async function buildXlsxBuffer(event, attendees, options = {}) {
  const exportRows = buildExportRows(event, attendees);
  const output = new PassThrough();
  const chunks = [];
  output.on('data', (chunk) => chunks.push(chunk));

  const completed = new Promise((resolve, reject) => {
    output.on('end', () => resolve(Buffer.concat(chunks)));
    output.on('error', reject);
  });

  const archive = archiver('zip', { zlib: { level: 9 } });
  archive.on('error', (error) => output.destroy(error));
  archive.pipe(output);

  const createdIso = new Date().toISOString();
  const sheetName = options.filtered ? 'Asistencia filtrada' : 'Asistencia';

  archive.append(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>`, { name: '[Content_Types].xml' });

  archive.append(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`, { name: '_rels/.rels' });

  archive.append(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets><sheet name="${sheetName}" sheetId="1" r:id="rId1"/></sheets>
</workbook>`, { name: 'xl/workbook.xml' });

  archive.append(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`, { name: 'xl/_rels/workbook.xml.rels' });

  archive.append(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="2">
    <font><sz val="11"/><name val="Calibri"/></font>
    <font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="Calibri"/></font>
  </fonts>
  <fills count="3">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF6D1725"/><bgColor indexed="64"/></patternFill></fill>
  </fills>
  <borders count="2">
    <border><left/><right/><top/><bottom/><diagonal/></border>
    <border><left style="thin"><color rgb="FFD9D9D9"/></left><right style="thin"><color rgb="FFD9D9D9"/></right><top style="thin"><color rgb="FFD9D9D9"/></top><bottom style="thin"><color rgb="FFD9D9D9"/></bottom><diagonal/></border>
  </borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="2">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>
  </cellXfs>
  <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`, { name: 'xl/styles.xml' });

  archive.append(buildWorksheetXml(event, exportRows), { name: 'xl/worksheets/sheet1.xml' });

  archive.append(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:creator>Cremería Hermanos Coronel</dc:creator>
  <cp:lastModifiedBy>Credenciales Digitales QR CHC</cp:lastModifiedBy>
  <dcterms:created xsi:type="dcterms:W3CDTF">${createdIso}</dcterms:created>
  <dcterms:modified xsi:type="dcterms:W3CDTF">${createdIso}</dcterms:modified>
  <dc:title>${xmlEscape(event.event_name)}</dc:title>
</cp:coreProperties>`, { name: 'docProps/core.xml' });

  archive.append(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
  <Application>Credenciales Digitales QR CHC</Application>
</Properties>`, { name: 'docProps/app.xml' });

  await archive.finalize();
  return completed;
}

function truncate(value, maxLength) {
  const text = String(value ?? '');
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 1))}…`;
}

function svgText(value) {
  return xmlEscape(String(value ?? '').replace(/[\u0000-\u001F]/g, ' '));
}

function buildPdfPageSvg(event, rows, pageNumber, totalPages, totals, options = {}) {
  const fiesta = event.event_type === 'FIESTA_PREMIOS';
  const width = 1123;
  const height = 794;
  const headerY = 92;
  const tableTop = 168;
  const rowHeight = 34;
  const columns = fiesta
    ? [
        { x: 24, w: 90, title: 'Empleado' },
        { x: 114, w: 260, title: 'Nombre' },
        { x: 374, w: 205, title: 'Puesto' },
        { x: 579, w: 150, title: 'Antigüedad' },
        { x: 729, w: 165, title: 'Asistencia' },
        { x: 894, w: 205, title: 'Premio' }
      ]
    : [
        { x: 24, w: 100, title: 'Empleado' },
        { x: 124, w: 300, title: 'Nombre' },
        { x: 424, w: 250, title: 'Puesto' },
        { x: 674, w: 180, title: 'Antigüedad' },
        { x: 854, w: 245, title: 'Asistencia' }
      ];

  const tableWidth = 1075;
  const rowSvgs = rows.map((row, index) => {
    const y = tableTop + rowHeight + index * rowHeight;
    const fill = index % 2 === 0 ? '#ffffff' : '#f7f5f2';
    const attendance = row.attended === 'Sí'
      ? `Sí ${row.attended_at ? `· ${row.attended_at}` : ''}`
      : 'No';
    const awardLabel = row.prize === 'Sí'
      ? 'Premio'
      : row.consolation === 'Sí'
        ? 'Consolación'
        : 'Sin entrega';
    const award = awardLabel !== 'Sin entrega' && row.award_at
      ? `${awardLabel} · ${row.award_at}`
      : awardLabel;
    const tenureLabel = `${row.tenure_group_short || row.tenure_group} · ${row.tenure}`;
    const values = fiesta
      ? [row.employee_number, row.full_name, row.puesto, tenureLabel, attendance, award]
      : [row.employee_number, row.full_name, row.puesto, tenureLabel, attendance];

    return `
      <rect x="24" y="${y}" width="${tableWidth}" height="${rowHeight}" fill="${fill}" stroke="#dedad4" stroke-width="1"/>
      ${columns.map((column, columnIndex) => {
        const max = fiesta && columnIndex === 5 ? 34 : columnIndex === 1 ? 36 : columnIndex === 2 ? 28 : 22;
        return `<text x="${column.x + 7}" y="${y + 22}" font-size="12" fill="#22252a">${svgText(truncate(values[columnIndex], max))}</text>`;
      }).join('')}`;
  }).join('');

  const typeLabel = fiesta ? 'Fiesta con Premios' : 'General';
  const summary = fiesta
    ? `Invitados: ${totals.invited} · Asistentes: ${totals.attended} · Premios: ${totals.prizes} · Consolación: ${totals.consolations}`
    : `Invitados: ${totals.invited} · Asistentes: ${totals.attended}`;

  const filterLabel = options.filtered
    ? `Filtro de antigüedad: ${options.filterLabel || 'Ningún rango'}`
    : 'Filtro de antigüedad: Lista completa';
  const tenureReference = `Antigüedad calculada al ${formatDate(event.event_date)}`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <rect width="${width}" height="${height}" fill="#ffffff"/>
    <rect x="0" y="0" width="${width}" height="18" fill="#6d1725"/>
    <text x="24" y="52" font-family="Arial, sans-serif" font-size="26" font-weight="700" fill="#4c111c">${svgText(truncate(event.event_name, 62))}</text>
    <text x="24" y="78" font-family="Arial, sans-serif" font-size="14" fill="#5f6368">Evento #${event.id} · ${svgText(typeLabel)} · ${svgText(formatDateTime(event.event_date))}</text>
    <text x="24" y="${headerY + 22}" font-family="Arial, sans-serif" font-size="14" font-weight="700" fill="#33363a">${svgText(summary)}</text>
    <text x="24" y="${headerY + 43}" font-family="Arial, sans-serif" font-size="12" fill="#666a70">${svgText(`${filterLabel} · ${tenureReference}`)}</text>
    <text x="1099" y="${headerY + 22}" text-anchor="end" font-family="Arial, sans-serif" font-size="12" fill="#666a70">Página ${pageNumber} de ${totalPages}</text>

    <rect x="24" y="${tableTop}" width="${tableWidth}" height="${rowHeight}" rx="4" fill="#6d1725"/>
    ${columns.map((column) => `<text x="${column.x + 7}" y="${tableTop + 22}" font-family="Arial, sans-serif" font-size="12" font-weight="700" fill="#ffffff">${svgText(column.title)}</text>`).join('')}
    <g font-family="Arial, sans-serif">${rowSvgs}</g>
    <text x="24" y="770" font-family="Arial, sans-serif" font-size="10" fill="#777b82">Cremería Hermanos Coronel · Módulo de Asistencia a Eventos</text>
  </svg>`;
}

function buildPdfFromJpegs(jpegs, imageWidth = 1123, imageHeight = 794) {
  const pageWidth = 842;
  const pageHeight = 595;
  const objects = [];
  const pageObjectNumbers = [];
  const imageObjectNumbers = [];
  const contentObjectNumbers = [];

  objects[1] = Buffer.from('<< /Type /Catalog /Pages 2 0 R >>');
  let nextObject = 3;
  for (let index = 0; index < jpegs.length; index += 1) {
    pageObjectNumbers.push(nextObject++);
    imageObjectNumbers.push(nextObject++);
    contentObjectNumbers.push(nextObject++);
  }

  objects[2] = Buffer.from(
    `<< /Type /Pages /Count ${jpegs.length} /Kids [${pageObjectNumbers.map((number) => `${number} 0 R`).join(' ')}] >>`
  );

  jpegs.forEach((jpeg, index) => {
    const pageNumber = pageObjectNumbers[index];
    const imageNumber = imageObjectNumbers[index];
    const contentNumber = contentObjectNumbers[index];
    const imageName = `Im${index + 1}`;
    objects[pageNumber] = Buffer.from(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] ` +
      `/Resources << /XObject << /${imageName} ${imageNumber} 0 R >> >> /Contents ${contentNumber} 0 R >>`
    );
    objects[imageNumber] = Buffer.concat([
      Buffer.from(
        `<< /Type /XObject /Subtype /Image /Width ${imageWidth} /Height ${imageHeight} ` +
        `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`
      ),
      jpeg,
      Buffer.from('\nendstream')
    ]);
    const content = Buffer.from(`q\n${pageWidth} 0 0 ${pageHeight} 0 0 cm\n/${imageName} Do\nQ\n`);
    objects[contentNumber] = Buffer.concat([
      Buffer.from(`<< /Length ${content.length} >>\nstream\n`),
      content,
      Buffer.from('endstream')
    ]);
  });

  const header = Buffer.from('%PDF-1.4\n%\xFF\xFF\xFF\xFF\n', 'binary');
  const chunks = [header];
  const offsets = [0];
  let offset = header.length;
  const maxObject = objects.length - 1;

  for (let objectNumber = 1; objectNumber <= maxObject; objectNumber += 1) {
    offsets[objectNumber] = offset;
    const prefix = Buffer.from(`${objectNumber} 0 obj\n`);
    const body = objects[objectNumber] || Buffer.from('<<>>');
    const suffix = Buffer.from('\nendobj\n');
    chunks.push(prefix, body, suffix);
    offset += prefix.length + body.length + suffix.length;
  }

  const xrefOffset = offset;
  let xref = `xref\n0 ${maxObject + 1}\n0000000000 65535 f \n`;
  for (let objectNumber = 1; objectNumber <= maxObject; objectNumber += 1) {
    xref += `${String(offsets[objectNumber]).padStart(10, '0')} 00000 n \n`;
  }
  const trailer = `trailer\n<< /Size ${maxObject + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  chunks.push(Buffer.from(xref + trailer));
  return Buffer.concat(chunks);
}

async function buildPdfBuffer(event, attendees, options = {}) {
  const exportRows = buildExportRows(event, attendees);
  const rowsPerPage = 16;
  const totalPages = Math.max(1, Math.ceil(exportRows.length / rowsPerPage));
  const totals = {
    invited: attendees.length,
    attended: attendees.filter((row) => row.attended_at).length,
    prizes: attendees.filter((row) => row.award_type === 'PREMIO').length,
    consolations: attendees.filter((row) => row.award_type === 'CONSOLACION').length
  };

  const jpegs = [];
  for (let page = 0; page < totalPages; page += 1) {
    const rows = exportRows.slice(page * rowsPerPage, (page + 1) * rowsPerPage);
    const svg = buildPdfPageSvg(event, rows, page + 1, totalPages, totals, options);
    const jpeg = await sharp(Buffer.from(svg))
      .jpeg({ quality: 86, chromaSubsampling: '4:4:4' })
      .toBuffer();
    jpegs.push(jpeg);
  }
  return buildPdfFromJpegs(jpegs);
}

module.exports = {
  buildExportRows,
  buildXlsxBuffer,
  buildPdfBuffer
};
