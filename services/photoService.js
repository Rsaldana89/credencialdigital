const sharp = require('sharp');
const { pool } = require('../config/db');

const ALLOWED_FORMATS = new Set(['jpeg', 'png']);

async function normalizePhoto(fileBuffer) {
  const image = sharp(fileBuffer, { failOn: 'error', limitInputPixels: 40_000_000 });
  const metadata = await image.metadata();

  if (!metadata.format || !ALLOWED_FORMATS.has(metadata.format)) {
    const error = new Error('El archivo debe ser una imagen JPG, JPEG o PNG válida.');
    error.code = 'INVALID_IMAGE_FORMAT';
    throw error;
  }

  const normalizedBuffer = await image
    .rotate()
    .resize(300, 400, {
      fit: 'cover',
      position: 'attention',
      withoutEnlargement: false
    })
    .flatten({ background: '#f2f2f2' })
    .jpeg({ quality: 80, mozjpeg: true })
    .toBuffer();

  return {
    buffer: normalizedBuffer,
    mimeType: 'image/jpeg',
    width: 300,
    height: 400
  };
}

async function saveEmployeePhoto({ employeeNumber, normalized, originalFilename, uploadedBy }) {
  const sql = `
    INSERT INTO employee_photos
      (employee_number, photo_blob, mime_type, original_filename, width, height, uploaded_at, uploaded_by)
    VALUES (?, ?, ?, ?, ?, ?, NOW(), ?)
    ON DUPLICATE KEY UPDATE
      photo_blob = VALUES(photo_blob),
      mime_type = VALUES(mime_type),
      original_filename = VALUES(original_filename),
      width = VALUES(width),
      height = VALUES(height),
      uploaded_at = NOW(),
      uploaded_by = VALUES(uploaded_by)
  `;

  await pool.execute(sql, [
    employeeNumber,
    normalized.buffer,
    normalized.mimeType,
    String(originalFilename || 'foto.jpg').slice(0, 255),
    normalized.width,
    normalized.height,
    String(uploadedBy || 'admin').slice(0, 100)
  ]);
}

module.exports = { normalizePhoto, saveEmployeePhoto };
