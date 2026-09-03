const { PassThrough } = require('stream');
const archiver = require('archiver');
const eventService = require('./eventService');
const { formatUtcDateTimeInEventZone } = require('../utils/timeZone');

function sanitizeXmlText(value) {
  return String(value ?? '')
    // XML 1.0 no permite estos caracteres de control. Si alguno llega desde
    // MySQL (por copiado/pegado o datos heredados), Excel considera corrupta
    // la hoja completa. Los sustituimos por espacio antes de escapar XML.
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, ' ');
}

function xmlEscape(value) {
  return sanitizeXmlText(value)
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
    const effectiveStart = attendee.effective_start_date || attendee.start_date_snapshot;
    const tenure = eventService.getTenureDetails(effectiveStart, referenceDate);
    return {
      employee_number: eventService.formatEmployeeNumber(attendee.employee_number),
      full_name: attendee.full_name_snapshot || '',
      puesto: attendee.puesto_snapshot || '',
      department: attendee.department_snapshot || '',
      start_date: formatDate(effectiveStart),
      employment_date_type: attendee.employment_date_type || 'Ingreso',
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

function getReportTotals(event, exportRows) {
  const fiesta = event.event_type === 'FIESTA_PREMIOS';
  return {
    fiesta,
    invited: exportRows.length,
    attended: exportRows.filter((row) => row.attended === 'Sí').length,
    prizes: fiesta ? exportRows.filter((row) => row.prize === 'Sí').length : 0,
    consolations: fiesta ? exportRows.filter((row) => row.consolation === 'Sí').length : 0
  };
}

function reportScopeLabel(options = {}) {
  if (options.filtered) {
    return `Filtro de antigüedad: ${options.filterLabel || 'Ningún rango'}`;
  }
  return 'Alcance: lista completa · todos los rangos de antigüedad';
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

function buildWorksheetXml(event, exportRows, options = {}) {
  const totals = getReportTotals(event, exportRows);
  const fiesta = totals.fiesta;
  const headers = [
    'Número de empleado',
    'Nombre',
    'Puesto',
    'Departamento',
    'Fecha de ingreso/reingreso',
    'Tipo de fecha',
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
    ? [18, 38, 28, 26, 20, 15, 20, 22, 12, 20, 14, 12, 22, 20, 22]
    : [18, 38, 28, 26, 20, 15, 20, 22, 12, 20, 14];

  const typeLabel = fiesta ? 'Fiesta con Premios' : 'General';
  const summary = fiesta
    ? `Invitados en este reporte: ${totals.invited} · Asistentes: ${totals.attended} · Premios: ${totals.prizes} · Consolación: ${totals.consolations}`
    : `Invitados en este reporte: ${totals.invited} · Asistentes: ${totals.attended}`;
  const scope = reportScopeLabel(options);
  const reference = `Antigüedad calculada a la fecha del evento: ${formatDate(event.event_date)}`;

  const rows = [];
  rows.push(`<row r="1" ht="28" customHeight="1">${inlineCell('A1', event.event_name || `Evento #${event.id}`, 2)}</row>`);
  rows.push(`<row r="2" ht="20" customHeight="1">${inlineCell('A2', `Evento #${event.id} · ${typeLabel} · ${formatDateTime(event.event_date)}`, 3)}</row>`);
  rows.push(`<row r="3" ht="20" customHeight="1">${inlineCell('A3', summary, 3)}</row>`);
  rows.push(`<row r="4" ht="20" customHeight="1">${inlineCell('A4', scope, 3)}</row>`);
  rows.push(`<row r="5" ht="20" customHeight="1">${inlineCell('A5', reference, 3)}</row>`);
  rows.push('<row r="6" ht="8" customHeight="1"></row>');
  rows.push(`<row r="7" ht="24" customHeight="1">${headers.map((header, index) => inlineCell(`${columnName(index)}7`, header, 1)).join('')}</row>`);

  exportRows.forEach((row, rowIndex) => {
    const values = [
      row.employee_number,
      row.full_name,
      row.puesto,
      row.department,
      row.start_date,
      row.employment_date_type,
      row.tenure,
      row.tenure_group,
      row.attended,
      row.attended_at,
      row.attendance_method
    ];
    if (fiesta) values.push(row.prize, row.consolation, row.award_at, row.award_by);
    const excelRow = rowIndex + 8;
    rows.push(`<row r="${excelRow}">${values.map((value, index) => inlineCell(`${columnName(index)}${excelRow}`, value, 0)).join('')}</row>`);
  });

  const lastColumn = columnName(headers.length - 1);
  const lastRow = Math.max(7, exportRows.length + 7);
  const cols = widths.map((width, index) => `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`).join('');
  const mergeRefs = [1, 2, 3, 4, 5].map((row) => `<mergeCell ref="A${row}:${lastColumn}${row}"/>`).join('');

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <dimension ref="A1:${lastColumn}${lastRow}"/>
  <sheetViews><sheetView workbookViewId="0"><pane ySplit="7" topLeftCell="A8" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
  <sheetFormatPr defaultRowHeight="18"/>
  <cols>${cols}</cols>
  <sheetData>${rows.join('')}</sheetData>
  <autoFilter ref="A7:${lastColumn}${lastRow}"/>
  <mergeCells count="5">${mergeRefs}</mergeCells>
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
  <sheets><sheet name="${xmlEscape(sheetName)}" sheetId="1" r:id="rId1"/></sheets>
</workbook>`, { name: 'xl/workbook.xml' });

  archive.append(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`, { name: 'xl/_rels/workbook.xml.rels' });

  archive.append(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="3">
    <font><sz val="11"/><name val="Calibri"/></font>
    <font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="Calibri"/></font>
    <font><b/><color rgb="FF4C111C"/><sz val="16"/><name val="Calibri"/></font>
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
  <cellXfs count="4">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment vertical="center"/></xf>
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>
  </cellXfs>
  <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`, { name: 'xl/styles.xml' });

  archive.append(buildWorksheetXml(event, exportRows, options), { name: 'xl/worksheets/sheet1.xml' });

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

const PDF_PAGE_WIDTH = 841.89;
const PDF_PAGE_HEIGHT = 595.28;
const PDF_MARGIN_X = 24;
const PDF_TABLE_WIDTH = PDF_PAGE_WIDTH - (PDF_MARGIN_X * 2);

function sanitizePdfText(value) {
  return String(value ?? '')
    .replace(/[\u0000-\u001F]/g, ' ')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\u2026/g, '...')
    .replace(/[^\u0020-\u00FF]/g, '?');
}

function pdfEscape(value) {
  return sanitizePdfText(value)
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

function hexToPdfRgb(hex) {
  const clean = String(hex || '#000000').replace('#', '');
  const normalized = clean.length === 3
    ? clean.split('').map((char) => char + char).join('')
    : clean.padEnd(6, '0').slice(0, 6);
  const r = parseInt(normalized.slice(0, 2), 16) / 255;
  const g = parseInt(normalized.slice(2, 4), 16) / 255;
  const b = parseInt(normalized.slice(4, 6), 16) / 255;
  return `${r.toFixed(3)} ${g.toFixed(3)} ${b.toFixed(3)}`;
}

function rectFromTop(commands, x, top, width, height, fill, stroke = null, lineWidth = 0.6) {
  const y = PDF_PAGE_HEIGHT - top - height;
  if (fill) commands.push(`${hexToPdfRgb(fill)} rg`);
  if (stroke) commands.push(`${hexToPdfRgb(stroke)} RG ${lineWidth} w`);
  commands.push(`${x.toFixed(2)} ${y.toFixed(2)} ${width.toFixed(2)} ${height.toFixed(2)} re ${fill && stroke ? 'B' : fill ? 'f' : 'S'}`);
}

function textAt(commands, value, x, baselineFromTop, size, options = {}) {
  const font = options.bold ? 'F2' : 'F1';
  const color = hexToPdfRgb(options.color || '#22252a');
  const y = PDF_PAGE_HEIGHT - baselineFromTop;
  commands.push(`BT /${font} ${Number(size).toFixed(2)} Tf ${color} rg 1 0 0 1 ${Number(x).toFixed(2)} ${y.toFixed(2)} Tm (${pdfEscape(value)}) Tj ET`);
}

function truncateLatin(value, maxLength) {
  const text = sanitizePdfText(value).trim();
  if (text.length <= maxLength) return text;
  if (maxLength <= 3) return text.slice(0, maxLength);
  return `${text.slice(0, maxLength - 3).trimEnd()}...`;
}

function wrapText(value, maxChars, maxLines = 2) {
  const text = sanitizePdfText(value).replace(/\s+/g, ' ').trim();
  if (!text) return [''];
  const words = text.split(' ');
  const lines = [];
  let current = '';

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= maxChars) {
      current = candidate;
      continue;
    }
    if (current) lines.push(current);
    current = word.length > maxChars ? truncateLatin(word, maxChars) : word;
    if (lines.length >= maxLines) break;
  }
  if (lines.length < maxLines && current) lines.push(current);

  if (lines.length > maxLines) lines.length = maxLines;
  const consumed = lines.join(' ').replace(/\.\.\.$/, '').length;
  if (lines.length === maxLines && consumed < text.length && !lines[maxLines - 1].endsWith('...')) {
    lines[maxLines - 1] = truncateLatin(lines[maxLines - 1], Math.max(4, maxChars - 1));
  }
  return lines;
}

function drawCellText(commands, value, x, top, width, rowHeight, options = {}) {
  const fontSize = options.fontSize || 7.6;
  const paddingX = options.paddingX || 6;
  const lineHeight = options.lineHeight || (fontSize + 2.1);
  const maxLines = options.maxLines || 2;
  const maxChars = Math.max(4, Math.floor((width - (paddingX * 2)) / (fontSize * 0.52)));
  const lines = wrapText(value, maxChars, maxLines);
  const blockHeight = lines.length * lineHeight;
  const startBaseline = top + Math.max(fontSize + 4, ((rowHeight - blockHeight) / 2) + fontSize + 1);
  lines.forEach((line, index) => {
    textAt(commands, line, x + paddingX, startBaseline + (index * lineHeight), fontSize, {
      bold: Boolean(options.bold),
      color: options.color || '#22252a'
    });
  });
}

function buildPdfPageContent(event, rows, pageNumber, totalPages, totals, options = {}) {
  const fiesta = totals.fiesta;
  const commands = [];
  const typeLabel = fiesta ? 'Fiesta con Premios' : 'General';
  const summary = fiesta
    ? `Invitados en este reporte: ${totals.invited} · Asistentes: ${totals.attended} · Premios: ${totals.prizes} · Consolación: ${totals.consolations}`
    : `Invitados en este reporte: ${totals.invited} · Asistentes: ${totals.attended}`;
  const scope = reportScopeLabel(options);
  const reference = `Antigüedad calculada a la fecha del evento: ${formatDate(event.event_date)}`;

  rectFromTop(commands, 0, 0, PDF_PAGE_WIDTH, 12, '#6d1725');
  textAt(commands, truncateLatin(event.event_name || `Evento #${event.id}`, 78), PDF_MARGIN_X, 36, 18, { bold: true, color: '#4c111c' });
  textAt(commands, `Evento #${event.id} · ${typeLabel} · ${formatDateTime(event.event_date)}`, PDF_MARGIN_X, 53, 9.4, { color: '#5f6368' });
  textAt(commands, summary, PDF_MARGIN_X, 70, 9.4, { bold: true, color: '#33363a' });
  textAt(commands, truncateLatin(scope, 108), PDF_MARGIN_X, 86, 8.4, { color: '#5f6368' });
  textAt(commands, reference, PDF_MARGIN_X, 101, 8.4, { color: '#5f6368' });
  textAt(commands, `Página ${pageNumber} de ${totalPages}`, PDF_PAGE_WIDTH - PDF_MARGIN_X - 76, 70, 8.4, { color: '#666a70' });

  const tableTop = 113;
  const headerHeight = 25;
  const rowHeight = 29;
  const columns = fiesta
    ? [
        { key: 'employee', title: 'Empleado', width: 50 },
        { key: 'name', title: 'Nombre', width: 170 },
        { key: 'puesto', title: 'Puesto', width: 135 },
        { key: 'tenure', title: 'Antigüedad', width: 120 },
        { key: 'attendance', title: 'Asistencia', width: 145 },
        { key: 'award', title: 'Premio / consolación', width: PDF_TABLE_WIDTH - 620 }
      ]
    : [
        { key: 'employee', title: 'Empleado', width: 55 },
        { key: 'name', title: 'Nombre', width: 200 },
        { key: 'puesto', title: 'Puesto', width: 170 },
        { key: 'tenure', title: 'Antigüedad', width: 125 },
        { key: 'attendance', title: 'Asistencia', width: PDF_TABLE_WIDTH - 550 }
      ];

  rectFromTop(commands, PDF_MARGIN_X, tableTop, PDF_TABLE_WIDTH, headerHeight, '#6d1725');
  let columnX = PDF_MARGIN_X;
  columns.forEach((column) => {
    drawCellText(commands, column.title, columnX, tableTop, column.width, headerHeight, {
      fontSize: 7.7,
      bold: true,
      color: '#ffffff',
      maxLines: 2
    });
    columnX += column.width;
  });

  rows.forEach((row, index) => {
    const top = tableTop + headerHeight + (index * rowHeight);
    rectFromTop(commands, PDF_MARGIN_X, top, PDF_TABLE_WIDTH, rowHeight, index % 2 === 0 ? '#ffffff' : '#f7f5f2', '#dedad4', 0.45);

    const attendance = row.attended === 'Sí'
      ? `Sí${row.attended_at ? ` · ${row.attended_at}` : ''}${row.attendance_method ? ` · ${row.attendance_method}` : ''}`
      : 'No';
    const awardLabel = row.prize === 'Sí'
      ? 'Premio'
      : row.consolation === 'Sí'
        ? 'Consolación'
        : 'Sin entrega';
    const award = awardLabel !== 'Sin entrega' && row.award_at
      ? `${awardLabel} · ${row.award_at}`
      : awardLabel;
    const tenure = `${row.tenure_group_short || row.tenure_group} · ${row.tenure}`;
    const values = fiesta
      ? [row.employee_number, row.full_name, row.puesto, tenure, attendance, award]
      : [row.employee_number, row.full_name, row.puesto, tenure, attendance];

    columnX = PDF_MARGIN_X;
    columns.forEach((column, columnIndex) => {
      drawCellText(commands, values[columnIndex], columnX, top, column.width, rowHeight, {
        fontSize: columnIndex === 0 ? 7.8 : 7.3,
        bold: columnIndex === 0 || columnIndex === 1,
        maxLines: 2
      });
      columnX += column.width;
    });
  });

  textAt(commands, 'Cremería Hermanos Coronel · Módulo de Asistencia a Eventos', PDF_MARGIN_X, 579, 7.5, { color: '#777b82' });
  return Buffer.from(commands.join('\n'), 'latin1');
}

function buildVectorPdf(pageContents) {
  const objects = [];
  objects[1] = Buffer.from('<< /Type /Catalog /Pages 2 0 R >>', 'latin1');
  objects[3] = Buffer.from('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>', 'latin1');
  objects[4] = Buffer.from('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>', 'latin1');

  const pageObjectNumbers = [];
  const contentObjectNumbers = [];
  let nextObject = 5;
  pageContents.forEach(() => {
    pageObjectNumbers.push(nextObject++);
    contentObjectNumbers.push(nextObject++);
  });

  objects[2] = Buffer.from(
    `<< /Type /Pages /Count ${pageObjectNumbers.length} /Kids [${pageObjectNumbers.map((number) => `${number} 0 R`).join(' ')}] >>`,
    'latin1'
  );

  pageContents.forEach((content, index) => {
    const pageNumber = pageObjectNumbers[index];
    const contentNumber = contentObjectNumbers[index];
    objects[pageNumber] = Buffer.from(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PDF_PAGE_WIDTH.toFixed(2)} ${PDF_PAGE_HEIGHT.toFixed(2)}] ` +
      `/Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentNumber} 0 R >>`,
      'latin1'
    );
    objects[contentNumber] = Buffer.concat([
      Buffer.from(`<< /Length ${content.length} >>\nstream\n`, 'latin1'),
      content,
      Buffer.from('\nendstream', 'latin1')
    ]);
  });

  const header = Buffer.from('%PDF-1.4\n%\xFF\xFF\xFF\xFF\n', 'binary');
  const chunks = [header];
  const offsets = [0];
  let offset = header.length;
  const maxObject = objects.length - 1;

  for (let objectNumber = 1; objectNumber <= maxObject; objectNumber += 1) {
    offsets[objectNumber] = offset;
    const prefix = Buffer.from(`${objectNumber} 0 obj\n`, 'latin1');
    const body = objects[objectNumber] || Buffer.from('<<>>', 'latin1');
    const suffix = Buffer.from('\nendobj\n', 'latin1');
    chunks.push(prefix, body, suffix);
    offset += prefix.length + body.length + suffix.length;
  }

  const xrefOffset = offset;
  let xref = `xref\n0 ${maxObject + 1}\n0000000000 65535 f \n`;
  for (let objectNumber = 1; objectNumber <= maxObject; objectNumber += 1) {
    xref += `${String(offsets[objectNumber]).padStart(10, '0')} 00000 n \n`;
  }
  const trailer = `trailer\n<< /Size ${maxObject + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  chunks.push(Buffer.from(xref + trailer, 'latin1'));
  return Buffer.concat(chunks);
}

async function buildPdfBuffer(event, attendees, options = {}) {
  const exportRows = buildExportRows(event, attendees);
  const totals = getReportTotals(event, exportRows);
  const rowsPerPage = 14;
  const totalPages = Math.max(1, Math.ceil(exportRows.length / rowsPerPage));
  const pageContents = [];

  for (let page = 0; page < totalPages; page += 1) {
    const rows = exportRows.slice(page * rowsPerPage, (page + 1) * rowsPerPage);
    pageContents.push(buildPdfPageContent(event, rows, page + 1, totalPages, totals, options));
  }

  return buildVectorPdf(pageContents);
}

module.exports = {
  buildExportRows,
  buildXlsxBuffer,
  buildPdfBuffer
};
