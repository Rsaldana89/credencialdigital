const sharp = require('sharp');

const CARD_WIDTH = 1001;
const CARD_HEIGHT = 1570;
const META_HEIGHT = 140;
const TOTAL_HEIGHT = CARD_HEIGHT + META_HEIGHT;

function escapeXml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function normalizeText(value, fallback = 'No disponible') {
  const text = String(value ?? '').trim();
  return text || fallback;
}

function wrapText(value, maxChars, maxLines = 2) {
  const words = normalizeText(value).split(/\s+/);
  const lines = [];
  let current = '';

  for (const word of words) {
    if (!current) {
      current = word;
      continue;
    }

    if (`${current} ${word}`.length <= maxChars) {
      current = `${current} ${word}`;
      continue;
    }

    lines.push(current);
    current = word;
    if (lines.length === maxLines - 1) break;
  }

  if (lines.length < maxLines && current) {
    const consumedWords = lines.join(' ').split(/\s+/).filter(Boolean).length;
    const remaining = words.slice(consumedWords).join(' ');
    const finalLine = remaining || current;
    lines.push(finalLine.length > maxChars + 7 ? `${finalLine.slice(0, maxChars + 4)}…` : finalLine);
  }

  return lines.slice(0, maxLines);
}

function renderLines(lines, {
  x,
  y,
  fontSize,
  lineHeight,
  fill = '#781321',
  weight = 800,
  anchor = 'start'
}) {
  return lines.map((line, index) => (
    `<text x="${x}" y="${y + (index * lineHeight)}" text-anchor="${anchor}" ` +
    `font-family="Arial, Helvetica, sans-serif" font-size="${fontSize}" font-weight="${weight}" fill="${fill}">` +
    `${escapeXml(line)}</text>`
  )).join('');
}

function iconContent(type) {
  const white = '#ffffff';
  const wine = '#68141e';

  switch (type) {
    case 'person':
      return `
        <circle cx="32" cy="21" r="9" fill="${white}"/>
        <path d="M15 51c0-11 7-18 17-18s17 7 17 18z" fill="${white}"/>
      `;
    case 'id':
      return `
        <rect x="9" y="16" width="46" height="37" rx="4" fill="none" stroke="${white}" stroke-width="4"/>
        <rect x="25" y="8" width="14" height="12" rx="3" fill="${white}"/>
        <circle cx="22" cy="32" r="6" fill="${white}"/>
        <path d="M13 46c1-7 4-10 9-10s8 3 9 10z" fill="${white}"/>
        <path d="M38 29h11M38 36h11M38 43h8" fill="none" stroke="${white}" stroke-width="3" stroke-linecap="round"/>
      `;
    case 'briefcase':
      return `
        <rect x="8" y="22" width="48" height="31" rx="5" fill="none" stroke="${white}" stroke-width="4"/>
        <path d="M23 22v-5c0-3 2-5 5-5h8c3 0 5 2 5 5v5M8 34h48" fill="none" stroke="${white}" stroke-width="4"/>
        <rect x="29" y="31" width="7" height="7" rx="1" fill="${white}"/>
      `;
    case 'calendar':
      return `
        <rect x="10" y="14" width="44" height="41" rx="5" fill="none" stroke="${white}" stroke-width="4"/>
        <path d="M20 8v12M44 8v12M10 27h44" fill="none" stroke="${white}" stroke-width="4" stroke-linecap="round"/>
        <path d="M19 34h6v6h-6zM29 34h6v6h-6zM39 34h6v6h-6zM19 44h6v6h-6zM29 44h6v6h-6zM39 44h6v6h-6z" fill="${white}"/>
      `;
    case 'shield':
      return `
        <path d="M32 6 52 14v15c0 13-8 23-20 29C20 52 12 42 12 29V14z" fill="${white}"/>
        <path d="M28 20h8v8h8v8h-8v8h-8v-8h-8v-8h8z" fill="${wine}"/>
      `;
    default:
      return '';
  }
}

function renderIcon(type, x, y, size = 82) {
  const scale = size / 64;
  return `
    <g transform="translate(${x} ${y})">
      <circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="#6b1420"/>
      <g transform="scale(${scale})">${iconContent(type)}</g>
    </g>
  `;
}

function renderField({
  y,
  iconType,
  label,
  value,
  maxChars = 27,
  maxLines = 2,
  valueFontSize = 23
}) {
  const valueLines = wrapText(value, maxChars, maxLines);

  return `
    ${renderIcon(iconType, 48, y + 8, 82)}
    <line x1="165" y1="${y + 9}" x2="165" y2="${y + 80}" stroke="#e19b05" stroke-width="3"/>
    <text x="188" y="${y + 26}" font-family="Arial, Helvetica, sans-serif" font-size="24" font-weight="650" fill="#16171a">${escapeXml(label)}</text>
    ${renderLines(valueLines, {
      x: 188,
      y: y + 58,
      fontSize: valueFontSize,
      lineHeight: 26,
      fill: '#781321',
      weight: 800
    })}
    <line x1="48" y1="${y + 100}" x2="576" y2="${y + 100}" stroke="#c6c5c2" stroke-width="1.8"/>
  `;
}

async function prepareImage(buffer, width, height, options = {}) {
  return sharp(buffer)
    .rotate()
    .resize(width, height, {
      fit: options.fit || 'contain',
      position: options.position || 'centre',
      background: options.background || { r: 255, g: 255, b: 255, alpha: 0 }
    })
    .png()
    .toBuffer();
}

async function generateCredentialPng({
  employee,
  photoBuffer,
  logoBuffer,
  sloganBuffer,
  qrBuffer,
  formattedStartDate,
  displayEmployeeNumber,
  generatedAt
}) {
  const [photoPng, logoPng, sloganPng, qrPng] = await Promise.all([
    prepareImage(photoBuffer, 382, 390, {
      fit: 'cover',
      position: 'centre',
      background: { r: 238, g: 238, b: 237, alpha: 1 }
    }),
    prepareImage(logoBuffer, 760, 263),
    prepareImage(sloganBuffer, 620, 165),
    prepareImage(qrBuffer, 272, 272, {
      fit: 'contain',
      background: { r: 255, g: 255, b: 255, alpha: 1 }
    })
  ]);

  const data = {
    photo: photoPng.toString('base64'),
    logo: logoPng.toString('base64'),
    slogan: sloganPng.toString('base64'),
    qr: qrPng.toString('base64')
  };

  const svg = `
  <svg xmlns="http://www.w3.org/2000/svg" width="${CARD_WIDTH}" height="${TOTAL_HEIGHT}" viewBox="0 0 ${CARD_WIDTH} ${TOTAL_HEIGHT}">
    <defs>
      <radialGradient id="bodyGrad" cx="42%" cy="38%" r="80%">
        <stop offset="0%" stop-color="#ffffff"/>
        <stop offset="58%" stop-color="#fbfaf8"/>
        <stop offset="100%" stop-color="#f4f1ed"/>
      </radialGradient>
      <radialGradient id="headerGlow" cx="50%" cy="5%" r="80%">
        <stop offset="0%" stop-color="#8f2d38"/>
        <stop offset="48%" stop-color="#61151d"/>
        <stop offset="100%" stop-color="#450d13"/>
      </radialGradient>
      <linearGradient id="goldGrad" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#f0b51b"/>
        <stop offset="50%" stop-color="#e19b05"/>
        <stop offset="100%" stop-color="#bd7600"/>
      </linearGradient>
      <linearGradient id="wineGrad" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#751b26"/>
        <stop offset="55%" stop-color="#61151d"/>
        <stop offset="100%" stop-color="#450d13"/>
      </linearGradient>
      <clipPath id="cardClip"><rect x="10" y="10" width="981" height="1550" rx="52"/></clipPath>
      <clipPath id="photoClip"><ellipse cx="500" cy="553" rx="189" ry="190"/></clipPath>
      <filter id="cardShadow" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0" dy="18" stdDeviation="20" flood-color="#1b1414" flood-opacity="0.18"/>
      </filter>
      <filter id="photoShadow" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0" dy="9" stdDeviation="10" flood-color="#000000" flood-opacity="0.13"/>
      </filter>
    </defs>

    <rect width="${CARD_WIDTH}" height="${TOTAL_HEIGHT}" fill="#f5f5f4"/>
    <rect x="10" y="10" width="981" height="1550" rx="52" fill="url(#bodyGrad)" stroke="#d3d0cb" stroke-width="2" filter="url(#cardShadow)"/>

    <g clip-path="url(#cardClip)">
      <polygon points="10,10 991,10 991,317 10,614" fill="url(#headerGlow)"/>
      <polygon points="10,614 991,317 991,328 10,625" fill="url(#goldGrad)"/>

      <rect x="390" y="42" width="221" height="43" rx="22" fill="#ffffff" stroke="#cfcfcf" stroke-width="2"/>
      <image href="data:image/png;base64,${data.logo}" x="120" y="92" width="761" height="263" preserveAspectRatio="xMidYMid meet"/>

      <g filter="url(#photoShadow)">
        <ellipse cx="500" cy="553" rx="204" ry="205" fill="#ffffff"/>
        <ellipse cx="500" cy="553" rx="194" ry="195" fill="url(#goldGrad)"/>
        <image href="data:image/png;base64,${data.photo}" x="311" y="363" width="378" height="380" clip-path="url(#photoClip)" preserveAspectRatio="xMidYMid slice"/>
      </g>

      ${renderField({
        y: 754,
        iconType: 'person',
        label: 'Nombre de la persona trabajadora:',
        value: employee.full_name,
        maxChars: 28,
        maxLines: 2,
        valueFontSize: 23
      })}
      ${renderField({
        y: 870,
        iconType: 'id',
        label: '# de Empleado:',
        value: displayEmployeeNumber || employee.employee_number,
        maxChars: 20,
        maxLines: 1,
        valueFontSize: 24
      })}
      ${renderField({
        y: 986,
        iconType: 'briefcase',
        label: 'Puesto de Trabajo:',
        value: employee.puesto,
        maxChars: 28,
        maxLines: 2,
        valueFontSize: 23
      })}
      ${renderField({
        y: 1102,
        iconType: 'calendar',
        label: 'Fecha de Ingreso:',
        value: formattedStartDate,
        maxChars: 20,
        maxLines: 1,
        valueFontSize: 24
      })}
      ${renderField({
        y: 1218,
        iconType: 'shield',
        label: 'NSS:',
        value: employee.nss,
        maxChars: 20,
        maxLines: 1,
        valueFontSize: 24
      })}

      <line x1="602" y1="857" x2="602" y2="1325" stroke="#e19b05" stroke-width="3"/>
      <rect x="626" y="878" width="315" height="430" rx="24" fill="#ffffff" stroke="#711723" stroke-width="5"/>
      <image href="data:image/png;base64,${data.qr}" x="648" y="915" width="272" height="272" preserveAspectRatio="xMidYMid meet"/>
      <path d="M626 1220 H941 V1284 Q941 1308 917 1308 H650 Q626 1308 626 1284 Z" fill="url(#wineGrad)"/>
      <text x="783.5" y="1269" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="25" font-weight="800" fill="#ffffff">QR ASOCIADO</text>

      <rect x="10" y="1390" width="981" height="170" fill="url(#wineGrad)"/>
      <rect x="10" y="1388" width="981" height="8" fill="url(#goldGrad)"/>
      <image href="data:image/png;base64,${data.slogan}" x="196" y="1400" width="609" height="155" preserveAspectRatio="xMidYMid meet"/>
    </g>

    <rect x="24" y="1592" width="280" height="84" rx="18" fill="#e7f4ed" stroke="#bfdcc8" stroke-width="2"/>
    <text x="164" y="1645" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="32" font-weight="800" fill="#155c39">Activo: Sí</text>
    <rect x="326" y="1592" width="650" height="84" rx="18" fill="#ffffff" stroke="#e1e1e1" stroke-width="2"/>
    <text x="651" y="1645" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="32" font-weight="800" fill="#4b0f19">Fecha de consulta: ${escapeXml(generatedAt)}</text>
  </svg>`;

  return sharp(Buffer.from(svg))
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer();
}

module.exports = { generateCredentialPng };
