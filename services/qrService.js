const QRCode = require('qrcode');
const sharp = require('sharp');
const { renderPortableText, wrapPortableText } = require('./portableText');

const QR_PNG_WIDTH = 800;
const QR_WITH_ID_BOTTOM_SPACE = 190;
const QR_WITH_ID_HEIGHT = QR_PNG_WIDTH + QR_WITH_ID_BOTTOM_SPACE;
const QR_WITH_ID_FONT_SIZE = 84;
const QR_WITH_ID_BASELINE = 135;

const QR_WITH_NAME_TOP_SPACE = 210;
const QR_WITH_NAME_BOTTOM_SPACE = 190;
const QR_WITH_NAME_HEIGHT = QR_WITH_NAME_TOP_SPACE + QR_PNG_WIDTH + QR_WITH_NAME_BOTTOM_SPACE;
const QR_WITH_NAME_FONT_SIZE = 46;
const QR_WITH_NAME_LINE_HEIGHT = 64;
const QR_WITH_NAME_FIRST_BASELINE = 78;

function getBaseUrl() {
  return String(process.env.APP_URL || 'http://localhost:3000').replace(/\/+$/, '');
}

function buildPublicUrl(token) {
  return `${getBaseUrl()}/e/${encodeURIComponent(token)}`;
}

async function generateDataUrl(token) {
  return QRCode.toDataURL(buildPublicUrl(token), {
    errorCorrectionLevel: 'M',
    margin: 2,
    width: 420,
    color: {
      dark: '#111111',
      light: '#FFFFFF'
    }
  });
}

async function generatePngBuffer(token) {
  return QRCode.toBuffer(buildPublicUrl(token), {
    type: 'png',
    errorCorrectionLevel: 'M',
    margin: 2,
    width: QR_PNG_WIDTH,
    color: {
      dark: '#111111',
      light: '#FFFFFF'
    }
  });
}

/**
 * Genera el mismo QR de 800 x 800 px y agrega una franja blanca inferior.
 * El numero de empleado se dibuja como trazos SVG, no como una fuente del
 * servidor, para que se vea igual en Railway, Windows o Linux.
 */
async function generatePngWithEmployeeId(token, employeeId) {
  const qrBuffer = await generatePngBuffer(token);
  const displayId = String(employeeId || '').trim();

  const labelSvg = Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="${QR_PNG_WIDTH}" height="${QR_WITH_ID_BOTTOM_SPACE}" viewBox="0 0 ${QR_PNG_WIDTH} ${QR_WITH_ID_BOTTOM_SPACE}">
      <rect width="${QR_PNG_WIDTH}" height="${QR_WITH_ID_BOTTOM_SPACE}" fill="#FFFFFF"/>
      ${renderPortableText(displayId, {
        x: QR_PNG_WIDTH / 2,
        y: QR_WITH_ID_BASELINE,
        fontSize: QR_WITH_ID_FONT_SIZE,
        fill: '#111111',
        anchor: 'middle',
        uppercase: false,
        letterSpacing: 6
      })}
    </svg>
  `, 'utf8');

  return sharp(qrBuffer)
    .extend({
      top: 0,
      bottom: QR_WITH_ID_BOTTOM_SPACE,
      left: 0,
      right: 0,
      background: '#FFFFFF'
    })
    .composite([{ input: labelSvg, left: 0, top: QR_PNG_WIDTH }])
    .png({ compressionLevel: 4 })
    .toBuffer();
}


/**
 * Genera una ficha PNG con nombre completo, QR e ID del empleado.
 * El nombre puede ocupar hasta dos líneas, centradas sobre el QR, y el ID se
 * conserva centrado debajo. Se usan trazos SVG portables para evitar depender
 * de fuentes instaladas en Railway.
 */
async function generatePngWithEmployeeNameAndId(token, fullName, employeeId) {
  const qrBuffer = await generatePngBuffer(token);
  const displayId = String(employeeId || '').trim();
  const nameLines = wrapPortableText(fullName || 'NO DISPONIBLE', QR_PNG_WIDTH - 80, QR_WITH_NAME_FONT_SIZE, 2);

  const topSvg = Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="${QR_PNG_WIDTH}" height="${QR_WITH_NAME_TOP_SPACE}" viewBox="0 0 ${QR_PNG_WIDTH} ${QR_WITH_NAME_TOP_SPACE}">
      <rect width="${QR_PNG_WIDTH}" height="${QR_WITH_NAME_TOP_SPACE}" fill="#FFFFFF"/>
      ${nameLines.map((line, index) => renderPortableText(line, {
        x: QR_PNG_WIDTH / 2,
        y: QR_WITH_NAME_FIRST_BASELINE + (index * QR_WITH_NAME_LINE_HEIGHT),
        fontSize: QR_WITH_NAME_FONT_SIZE,
        fill: '#111111',
        anchor: 'middle',
        uppercase: true,
        letterSpacing: 0.8
      })).join('')}
    </svg>
  `, 'utf8');

  const bottomSvg = Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="${QR_PNG_WIDTH}" height="${QR_WITH_NAME_BOTTOM_SPACE}" viewBox="0 0 ${QR_PNG_WIDTH} ${QR_WITH_NAME_BOTTOM_SPACE}">
      <rect width="${QR_PNG_WIDTH}" height="${QR_WITH_NAME_BOTTOM_SPACE}" fill="#FFFFFF"/>
      ${renderPortableText(displayId, {
        x: QR_PNG_WIDTH / 2,
        y: QR_WITH_ID_BASELINE,
        fontSize: QR_WITH_ID_FONT_SIZE,
        fill: '#111111',
        anchor: 'middle',
        uppercase: false,
        letterSpacing: 6
      })}
    </svg>
  `, 'utf8');

  return sharp(qrBuffer)
    .extend({
      top: QR_WITH_NAME_TOP_SPACE,
      bottom: QR_WITH_NAME_BOTTOM_SPACE,
      left: 0,
      right: 0,
      background: '#FFFFFF'
    })
    .composite([
      { input: topSvg, left: 0, top: 0 },
      { input: bottomSvg, left: 0, top: QR_WITH_NAME_TOP_SPACE + QR_PNG_WIDTH }
    ])
    .png({ compressionLevel: 4 })
    .toBuffer();
}

module.exports = {
  QR_PNG_WIDTH,
  QR_WITH_ID_HEIGHT,
  QR_WITH_NAME_HEIGHT,
  buildPublicUrl,
  generateDataUrl,
  generatePngBuffer,
  generatePngWithEmployeeId,
  generatePngWithEmployeeNameAndId
};
