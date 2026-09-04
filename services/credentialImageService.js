'use strict';

const sharp = require('sharp');
const { renderPortableText, wrapPortableText } = require('./portableText');

const CARD_WIDTH = 1001;
const CARD_HEIGHT = 1570;
const TOTAL_HEIGHT = CARD_HEIGHT;
const CW = CARD_WIDTH / 100;

// Geometría equivalente a public/css/credential-v30.css.
const FIELDS = {
  left: CARD_WIDTH * 0.046,
  top: CARD_HEIGHT * 0.482,
  width: CARD_WIDTH * 0.548,
  height: CARD_HEIGHT * 0.391
};
const ROW_HEIGHT = FIELDS.height / 5;
const ICON_SIZE = 74; // CSS: width 72%, max-width 74px.
const TEXT_X = FIELDS.left + (FIELDS.width * 0.195) + (2.25 * CW);
const FIELD_RIGHT = FIELDS.left + FIELDS.width;
const VALUE_MAX_WIDTH = FIELD_RIGHT - TEXT_X - (1.1 * CW);
const LABEL_SIZE = 2.38 * CW;
const VALUE_SIZE = 2.17 * CW;
const TENURE_SIZE = 1.52 * CW;

function normalizeText(value, fallback = 'No disponible') {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return text || fallback;
}

function iconContent(type) {
  const white = '#ffffff';
  const wine = '#68141e';
  switch (type) {
    case 'person':
      return `<circle cx="32" cy="21" r="9" fill="${white}"/><path d="M15 51c0-11 7-18 17-18s17 7 17 18z" fill="${white}"/>`;
    case 'id':
      return `<rect x="9" y="16" width="46" height="37" rx="4" fill="none" stroke="${white}" stroke-width="4"/><rect x="25" y="8" width="14" height="12" rx="3" fill="${white}"/><circle cx="22" cy="32" r="6" fill="${white}"/><path d="M13 46c1-7 4-10 9-10s8 3 9 10z" fill="${white}"/><path d="M38 29h11M38 36h11M38 43h8" fill="none" stroke="${white}" stroke-width="3" stroke-linecap="round"/>`;
    case 'briefcase':
      return `<rect x="8" y="22" width="48" height="31" rx="5" fill="none" stroke="${white}" stroke-width="4"/><path d="M23 22v-5c0-3 2-5 5-5h8c3 0 5 2 5 5v5M8 34h48" fill="none" stroke="${white}" stroke-width="4"/><rect x="29" y="31" width="7" height="7" rx="1" fill="${white}"/>`;
    case 'calendar':
      return `<rect x="10" y="14" width="44" height="41" rx="5" fill="none" stroke="${white}" stroke-width="4"/><path d="M20 8v12M44 8v12M10 27h44" fill="none" stroke="${white}" stroke-width="4" stroke-linecap="round"/><path d="M19 34h6v6h-6zM29 34h6v6h-6zM39 34h6v6h-6zM19 44h6v6h-6zM29 44h6v6h-6zM39 44h6v6h-6z" fill="${white}"/>`;
    case 'shield':
      return `<path d="M32 6 52 14v15c0 13-8 23-20 29C20 52 12 42 12 29V14z" fill="${white}"/><path d="M28 20h8v8h8v8h-8v8h-8v-8h-8v-8h8z" fill="${wine}"/>`;
    default:
      return '';
  }
}

function renderIcon(type, x, y, size = ICON_SIZE) {
  const scale = size / 64;
  return `<g transform="translate(${x} ${y})"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="#6b1420"/><g transform="scale(${scale})">${iconContent(type)}</g></g>`;
}

function renderWrappedValue(value, { x, baseline, fontSize = VALUE_SIZE, maxLines = 2, maxWidth = VALUE_MAX_WIDTH, lineHeight = VALUE_SIZE * 1.12, fill = '#781321' }) {
  const lines = wrapPortableText(normalizeText(value), maxWidth, fontSize, maxLines);
  return lines.map((line, index) => renderPortableText(line, {
    x,
    y: baseline + (index * lineHeight),
    fontSize,
    fill,
    uppercase: false
  })).join('');
}

function renderField({ row, iconType, label, value, maxLines = 2, valueSize = VALUE_SIZE, tenure = null }) {
  const rowTop = FIELDS.top + (row * ROW_HEIGHT);
  const iconY = rowTop + ((ROW_HEIGHT - ICON_SIZE) / 2);
  const labelBaseline = rowTop + 50;
  const valueBaseline = tenure ? rowTop + 80 : rowTop + 84;
  const copyLineTop = rowTop + 27;
  const copyLineBottom = rowTop + 97;
  const bottom = rowTop + ROW_HEIGHT;

  return `
    ${renderIcon(iconType, FIELDS.left, iconY, ICON_SIZE)}
    <line x1="${FIELDS.left + (FIELDS.width * 0.195)}" y1="${copyLineTop}" x2="${FIELDS.left + (FIELDS.width * 0.195)}" y2="${copyLineBottom}" stroke="#e19b05" stroke-width="${0.32 * CW}"/>
    ${renderPortableText(label, { x: TEXT_X, y: labelBaseline, fontSize: LABEL_SIZE, fill: '#16171a', uppercase: false })}
    ${renderWrappedValue(value, { x: TEXT_X, baseline: valueBaseline, fontSize: valueSize, maxLines })}
    ${tenure ? renderPortableText(`Antigüedad: ${normalizeText(tenure)}`, { x: TEXT_X, y: rowTop + 106, fontSize: TENURE_SIZE, fill: '#5f6064', uppercase: false }) : ''}
    ${row < 4 ? `<line x1="${FIELDS.left}" y1="${bottom}" x2="${FIELD_RIGHT}" y2="${bottom}" stroke="#c6c5c2" stroke-width="${0.16 * CW}"/>` : ''}
  `;
}

async function preparePhotoLikeBrowser(buffer) {
  const targetW = 372;
  const targetH = 372;
  const input = sharp(buffer).rotate();
  const meta = await input.metadata();
  const srcW = Number(meta.width || targetW);
  const srcH = Number(meta.height || targetH);
  const scale = Math.max(targetW / srcW, targetH / srcH);
  const resizedW = Math.max(targetW, Math.round(srcW * scale));
  const resizedH = Math.max(targetH, Math.round(srcH * scale));
  const excessX = Math.max(0, resizedW - targetW);
  const excessY = Math.max(0, resizedH - targetH);
  // Equivalente a object-position: 50% 38% del navegador.
  const left = Math.round(excessX * 0.5);
  const top = Math.round(excessY * 0.38);

  return input
    .resize(resizedW, resizedH, { fit: 'fill' })
    .extract({ left, top, width: targetW, height: targetH })
    .png()
    .toBuffer();
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
  employmentDateLabel = 'Fecha de Ingreso',
  credentialTenure = 'No disponible',
  displayEmployeeNumber
}) {
  const [photoPng, logoPng, sloganPng, qrPng] = await Promise.all([
    preparePhotoLikeBrowser(photoBuffer),
    prepareImage(logoBuffer, 760, 263),
    prepareImage(sloganBuffer, 620, 165),
    prepareImage(qrBuffer, 272, 272, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 1 } })
  ]);

  const data = {
    photo: photoPng.toString('base64'),
    logo: logoPng.toString('base64'),
    slogan: sloganPng.toString('base64'),
    qr: qrPng.toString('base64')
  };

  const qrLeft = CARD_WIDTH * 0.626;
  const qrTop = CARD_HEIGHT * 0.559;
  const qrWidth = CARD_WIDTH * 0.315;
  const qrHeight = CARD_HEIGHT * 0.2815;
  const qrCaptionHeight = qrHeight * 0.205;
  const qrBodyHeight = qrHeight - qrCaptionHeight;
  const qrImageY = qrTop + ((qrBodyHeight - 272) / 2);

  const svg = `
  <svg xmlns="http://www.w3.org/2000/svg" width="${CARD_WIDTH}" height="${TOTAL_HEIGHT}" viewBox="0 0 ${CARD_WIDTH} ${TOTAL_HEIGHT}">
    <defs>
      <radialGradient id="bodyGrad" cx="42%" cy="38%" r="80%"><stop offset="0%" stop-color="#ffffff"/><stop offset="58%" stop-color="#fbfaf8"/><stop offset="100%" stop-color="#f4f1ed"/></radialGradient>
      <radialGradient id="headerGlow" cx="50%" cy="5%" r="80%"><stop offset="0%" stop-color="#8f2d38"/><stop offset="48%" stop-color="#61151d"/><stop offset="100%" stop-color="#450d13"/></radialGradient>
      <linearGradient id="goldGrad" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#f0b51b"/><stop offset="50%" stop-color="#e19b05"/><stop offset="100%" stop-color="#bd7600"/></linearGradient>
      <linearGradient id="wineGrad" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#751b26"/><stop offset="55%" stop-color="#61151d"/><stop offset="100%" stop-color="#450d13"/></linearGradient>
      <clipPath id="cardClip"><rect x="10" y="10" width="981" height="1550" rx="52"/></clipPath>
      <clipPath id="photoClip"><ellipse cx="500" cy="553" rx="186" ry="186"/></clipPath>
      <filter id="cardShadow" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="18" stdDeviation="20" flood-color="#1b1414" flood-opacity="0.18"/></filter>
      <filter id="photoShadow" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="9" stdDeviation="10" flood-color="#000000" flood-opacity="0.13"/></filter>
    </defs>

    <rect width="${CARD_WIDTH}" height="${TOTAL_HEIGHT}" fill="#f5f5f4"/>
    <rect x="10" y="10" width="981" height="1550" rx="52" fill="url(#bodyGrad)" stroke="#d3d0cb" stroke-width="2" filter="url(#cardShadow)"/>
    <g clip-path="url(#cardClip)">
      <polygon points="10,10 991,10 991,317 10,614" fill="url(#headerGlow)"/>
      <polygon points="10,614 991,317 991,328 10,625" fill="url(#goldGrad)"/>
      <rect x="390" y="42" width="221" height="43" rx="22" fill="#ffffff" stroke="#cfcfcf" stroke-width="2"/>
      <image href="data:image/png;base64,${data.logo}" x="120" y="96" width="761" height="263" preserveAspectRatio="xMidYMid meet"/>

      <g filter="url(#photoShadow)">
        <ellipse cx="500" cy="553" rx="204" ry="204" fill="#ffffff"/>
        <ellipse cx="500" cy="553" rx="192" ry="192" fill="url(#goldGrad)"/>
        <image href="data:image/png;base64,${data.photo}" x="314" y="367" width="372" height="372" clip-path="url(#photoClip)" preserveAspectRatio="none"/>
      </g>

      ${renderField({ row: 0, iconType: 'person', label: 'Nombre de la persona trabajadora:', value: employee.full_name, maxLines: 2, valueSize: VALUE_SIZE })}
      ${renderField({ row: 1, iconType: 'id', label: '# de Empleado:', value: displayEmployeeNumber || employee.employee_number, maxLines: 1, valueSize: VALUE_SIZE })}
      ${renderField({ row: 2, iconType: 'briefcase', label: 'Puesto de Trabajo:', value: employee.puesto, maxLines: 2, valueSize: VALUE_SIZE })}
      ${renderField({ row: 3, iconType: 'calendar', label: `${employmentDateLabel}:`, value: formattedStartDate, maxLines: 1, valueSize: VALUE_SIZE, tenure: credentialTenure })}
      ${renderField({ row: 4, iconType: 'shield', label: 'NSS:', value: employee.nss, maxLines: 1, valueSize: VALUE_SIZE })}

      <rect x="${CARD_WIDTH * 0.6005}" y="${CARD_HEIGHT * 0.545}" width="${0.32 * CW}" height="${CARD_HEIGHT * 0.319}" fill="#e19b05"/>
      <rect x="${qrLeft}" y="${qrTop}" width="${qrWidth}" height="${qrHeight}" rx="${2.45 * CW}" fill="#ffffff" stroke="#711723" stroke-width="${0.44 * CW}"/>
      <image href="data:image/png;base64,${data.qr}" x="${qrLeft + ((qrWidth - 272) / 2)}" y="${qrImageY}" width="272" height="272" preserveAspectRatio="xMidYMid meet"/>
      <path d="M${qrLeft} ${qrTop + qrBodyHeight} H${qrLeft + qrWidth} V${qrTop + qrHeight - 24} Q${qrLeft + qrWidth} ${qrTop + qrHeight} ${qrLeft + qrWidth - 24} ${qrTop + qrHeight} H${qrLeft + 24} Q${qrLeft} ${qrTop + qrHeight} ${qrLeft} ${qrTop + qrHeight - 24} Z" fill="url(#wineGrad)"/>
      ${renderPortableText('QR ASOCIADO', { x: qrLeft + (qrWidth / 2), y: qrTop + qrBodyHeight + (qrCaptionHeight * 0.62), fontSize: 1.75 * CW, fill: '#ffffff', anchor: 'middle', uppercase: false })}

      <rect x="10" y="1390" width="981" height="170" fill="url(#wineGrad)"/>
      <rect x="10" y="1388" width="981" height="8" fill="url(#goldGrad)"/>
      <image href="data:image/png;base64,${data.slogan}" x="196" y="1400" width="609" height="155" preserveAspectRatio="xMidYMid meet"/>
    </g>
  </svg>`;

  return sharp(Buffer.from(svg)).png({ compressionLevel: 9, adaptiveFiltering: true }).toBuffer();
}

module.exports = {
  generateCredentialPng,
  CARD_WIDTH,
  CARD_HEIGHT,
  FIELDS,
  ROW_HEIGHT,
  ICON_SIZE,
  LABEL_SIZE,
  VALUE_SIZE,
  TENURE_SIZE
};
