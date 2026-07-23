const QRCode = require('qrcode');

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
    width: 800,
    color: {
      dark: '#111111',
      light: '#FFFFFF'
    }
  });
}

module.exports = { buildPublicUrl, generateDataUrl, generatePngBuffer };
