const crypto = require('crypto');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const employeeService = require('./employeeService');
const photoService = require('./photoService');
const { SafeZipReader } = require('./zipReader');

const ALLOWED_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png']);
const REPORTS = new Map();

function envInteger(name, defaultValue, minimum, maximum) {
  const parsed = Number.parseInt(process.env[name], 10);
  if (!Number.isFinite(parsed)) return defaultValue;
  return Math.min(maximum, Math.max(minimum, parsed));
}

function getLimits() {
  return {
    maxZipMb: envInteger('BULK_ZIP_MAX_MB', 200, 10, 500),
    maxImages: envInteger('BULK_MAX_IMAGES', 500, 1, 2000),
    maxArchiveEntries: envInteger('BULK_MAX_ARCHIVE_ENTRIES', 700, 10, 2500),
    maxImageMb: envInteger('BULK_IMAGE_MAX_MB', 10, 1, 25),
    maxTotalUncompressedMb: envInteger('BULK_TOTAL_UNCOMPRESSED_MB', 500, 20, 2000),
    reportTtlMinutes: envInteger('BULK_REPORT_TTL_MINUTES', 60, 10, 240)
  };
}

function normalizeZipPath(value) {
  return String(value || '').replace(/\\/g, '/');
}

function getEntryFilename(entryPath) {
  return path.posix.basename(normalizeZipPath(entryPath));
}

function isIgnoredEntry(entry) {
  const normalized = normalizeZipPath(entry.filename);
  const basename = path.posix.basename(normalized);
  return (
    entry.isDirectory ||
    !basename ||
    normalized.startsWith('__MACOSX/') ||
    basename === '.DS_Store' ||
    basename.startsWith('._')
  );
}

function csvCell(value) {
  const text = String(value ?? '');
  return `"${text.replace(/"/g, '""')}"`;
}

function statusLabel(status) {
  const labels = {
    IMPORTED: 'Fotografía nueva',
    REPLACED: 'Fotografía reemplazada',
    SKIPPED_EXISTING: 'Omitida: ya tenía fotografía',
    EMPLOYEE_NOT_FOUND: 'Empleado no encontrado',
    INVALID_FILENAME: 'Nombre de archivo no válido',
    INVALID_EXTENSION: 'Formato no permitido',
    INVALID_IMAGE: 'Imagen inválida o dañada',
    DUPLICATE_EMPLOYEE: 'Duplicada dentro del ZIP',
    FILE_TOO_LARGE: 'Imagen demasiado grande',
    UNSUPPORTED_COMPRESSION: 'Compresión no compatible',
    ERROR: 'Error al procesar'
  };
  return labels[status] || status;
}

function result({ filename, employeeNumber = '', employeeName = '', status, detail = '' }) {
  return {
    filename,
    employeeNumber,
    employeeName,
    status,
    statusLabel: statusLabel(status),
    detail
  };
}

function buildSummary(results, archiveEntries, ignoredEntries) {
  const count = (status) => results.filter((item) => item.status === status).length;
  return {
    archiveEntries,
    ignoredEntries,
    processedFiles: results.length,
    imported: count('IMPORTED'),
    replaced: count('REPLACED'),
    skippedExisting: count('SKIPPED_EXISTING'),
    employeeNotFound: count('EMPLOYEE_NOT_FOUND'),
    invalidFilename: count('INVALID_FILENAME'),
    invalidExtension: count('INVALID_EXTENSION'),
    invalidImage: count('INVALID_IMAGE'),
    duplicateEmployee: count('DUPLICATE_EMPLOYEE'),
    fileTooLarge: count('FILE_TOO_LARGE'),
    errors: results.filter((item) => !['IMPORTED', 'REPLACED', 'SKIPPED_EXISTING'].includes(item.status)).length
  };
}

async function processPhotoZip({ zipPath, mode, uploadedBy, originalFilename }) {
  const limits = getLimits();
  const selectedMode = mode === 'skip' ? 'skip' : 'replace';
  let reader;
  const startedAt = new Date();

  try {
    reader = await SafeZipReader.open(zipPath, {
      maxEntries: limits.maxArchiveEntries,
      maxEntryBytes: limits.maxImageMb * 1024 * 1024,
      maxTotalBytes: limits.maxTotalUncompressedMb * 1024 * 1024
    });

    const allEntries = reader.listEntries();
    const usableEntries = allEntries.filter((entry) => !isIgnoredEntry(entry));
    const imageCandidates = usableEntries.filter((entry) => ALLOWED_EXTENSIONS.has(path.extname(getEntryFilename(entry.filename)).toLowerCase()));

    if (!usableEntries.length) {
      const error = new Error('El ZIP no contiene archivos para procesar.');
      error.code = 'ZIP_EMPTY';
      throw error;
    }
    if (imageCandidates.length > limits.maxImages) {
      const error = new Error(
        `El ZIP contiene ${imageCandidates.length} imágenes. El máximo por lote es ${limits.maxImages}. Divide la carpeta en varios ZIP.`
      );
      error.code = 'TOO_MANY_IMAGES';
      throw error;
    }

    const employees = await employeeService.listEmployeesForPhotoImport();
    const exactEmployeeIndex = new Map();
    const canonicalEmployeeIndex = new Map();
    const ambiguousCanonicalNumbers = new Set();
    const existingPhotos = new Set();

    employees.forEach((employee) => {
      const storedEmployeeNumber = employeeService.normalizeEmployeeNumber(employee.employee_number);
      const canonicalNumber = employeeService.employeeNumberLookupKey(storedEmployeeNumber);
      if (!storedEmployeeNumber || !canonicalNumber) return;

      exactEmployeeIndex.set(storedEmployeeNumber, employee);

      if (canonicalEmployeeIndex.has(canonicalNumber)) {
        const previous = canonicalEmployeeIndex.get(canonicalNumber);
        const previousNumber = employeeService.normalizeEmployeeNumber(previous.employee_number);
        if (previousNumber !== storedEmployeeNumber) ambiguousCanonicalNumbers.add(canonicalNumber);
      } else {
        canonicalEmployeeIndex.set(canonicalNumber, employee);
      }

      if (Number(employee.has_photo) === 1) existingPhotos.add(storedEmployeeNumber);
    });

    const seenEmployeeNumbers = new Set();
    const results = [];
    let ignoredEntries = allEntries.length - usableEntries.length;

    for (const entry of usableEntries) {
      const filename = getEntryFilename(entry.filename);
      const extension = path.extname(filename).toLowerCase();

      if (!ALLOWED_EXTENSIONS.has(extension)) {
        results.push(result({
          filename,
          status: 'INVALID_EXTENSION',
          detail: 'Sólo se permiten archivos JPG, JPEG o PNG.'
        }));
        continue;
      }

      if (entry.uncompressedSize > limits.maxImageMb * 1024 * 1024) {
        results.push(result({
          filename,
          status: 'FILE_TOO_LARGE',
          detail: `La imagen supera ${limits.maxImageMb} MB sin comprimir.`
        }));
        continue;
      }

      const filenameWithoutExtension = path.basename(filename, extension).trim();
      const requestedEmployeeNumber = employeeService.normalizeEmployeeNumber(filenameWithoutExtension);
      const canonicalNumber = employeeService.employeeNumberLookupKey(requestedEmployeeNumber);
      if (!requestedEmployeeNumber || !canonicalNumber) {
        results.push(result({
          filename,
          status: 'INVALID_FILENAME',
          detail: 'El archivo debe llamarse exactamente NUMERO_EMPLEADO.jpg o NUMERO_EMPLEADO.png.'
        }));
        continue;
      }

      let employee = exactEmployeeIndex.get(requestedEmployeeNumber);
      if (!employee && !ambiguousCanonicalNumbers.has(canonicalNumber)) {
        employee = canonicalEmployeeIndex.get(canonicalNumber);
      }

      if (!employee) {
        results.push(result({
          filename,
          employeeNumber: employeeService.formatEmployeeNumber(requestedEmployeeNumber),
          status: 'EMPLOYEE_NOT_FOUND',
          detail: ambiguousCanonicalNumbers.has(canonicalNumber)
            ? 'El número coincide con más de un registro. Usa exactamente el valor guardado en personal.employee_number.'
            : 'No existe ese número de empleado en la tabla personal.'
        }));
        continue;
      }

      const storedEmployeeNumber = employeeService.normalizeEmployeeNumber(employee.employee_number);
      const displayedEmployeeNumber = employeeService.formatEmployeeNumber(storedEmployeeNumber);

      if (seenEmployeeNumbers.has(storedEmployeeNumber)) {
        results.push(result({
          filename,
          employeeNumber: displayedEmployeeNumber,
          employeeName: employee.full_name || '',
          status: 'DUPLICATE_EMPLOYEE',
          detail: 'El ZIP contiene más de una fotografía para el mismo número de empleado.'
        }));
        continue;
      }
      seenEmployeeNumbers.add(storedEmployeeNumber);

      const employeeName = employee.full_name || '';
      const hadPhoto = existingPhotos.has(storedEmployeeNumber);
      if (selectedMode === 'skip' && hadPhoto) {
        results.push(result({
          filename,
          employeeNumber: displayedEmployeeNumber,
          employeeName,
          status: 'SKIPPED_EXISTING',
          detail: 'Se conservó la fotografía que ya estaba guardada.'
        }));
        continue;
      }

      try {
        const fileBuffer = await reader.readEntry(entry);
        const normalized = await photoService.normalizePhoto(fileBuffer);
        await photoService.saveEmployeePhoto({
          employeeNumber: storedEmployeeNumber,
          normalized,
          originalFilename: filename,
          uploadedBy
        });
        existingPhotos.add(storedEmployeeNumber);

        results.push(result({
          filename,
          employeeNumber: displayedEmployeeNumber,
          employeeName,
          status: hadPhoto ? 'REPLACED' : 'IMPORTED',
          detail: hadPhoto
            ? 'La fotografía anterior fue reemplazada.'
            : 'La fotografía fue guardada correctamente.'
        }));
      } catch (error) {
        let status = 'ERROR';
        let detail = 'No fue posible procesar la imagen.';

        if (error.code === 'INVALID_IMAGE_FORMAT' || error.name === 'InputBufferError') {
          status = 'INVALID_IMAGE';
          detail = 'El archivo no es una imagen válida o está dañado.';
        } else if (error.code === 'ZIP_ENTRY_TOO_LARGE') {
          status = 'FILE_TOO_LARGE';
          detail = error.message;
        } else if (error.code === 'ZIP_COMPRESSION_UNSUPPORTED') {
          status = 'UNSUPPORTED_COMPRESSION';
          detail = error.message;
        } else if (error.message) {
          detail = error.message.slice(0, 300);
        }

        results.push(result({ filename, employeeNumber: displayedEmployeeNumber, employeeName, status, detail }));
      }
    }

    const finishedAt = new Date();
    return {
      originalFilename: String(originalFilename || 'fotografias.zip').slice(0, 255),
      mode: selectedMode,
      uploadedBy: String(uploadedBy || 'admin').slice(0, 100),
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      durationMs: finishedAt.getTime() - startedAt.getTime(),
      limits,
      results,
      summary: buildSummary(results, allEntries.length, ignoredEntries)
    };
  } finally {
    if (reader) await reader.close();
  }
}

function cleanupExpiredReports() {
  const now = Date.now();
  REPORTS.forEach((stored, token) => {
    if (stored.expiresAt <= now) {
      REPORTS.delete(token);
      fs.unlink(stored.csvPath).catch(() => {});
    }
  });
}

function reportToCsv(report) {
  const rows = [
    ['archivo', 'numero_empleado', 'nombre_empleado', 'resultado', 'detalle'],
    ...report.results.map((item) => [
      item.filename,
      item.employeeNumber,
      item.employeeName,
      item.statusLabel,
      item.detail
    ])
  ];
  return `\ufeff${rows.map((row) => row.map(csvCell).join(',')).join('\r\n')}\r\n`;
}

async function storeReport(report) {
  cleanupExpiredReports();
  const limits = getLimits();
  const token = crypto.randomBytes(24).toString('hex');
  const csvPath = path.join(os.tmpdir(), `chc_photo_import_${token}.csv`);
  await fs.writeFile(csvPath, reportToCsv(report), 'utf8');
  REPORTS.set(token, {
    report,
    csvPath,
    expiresAt: Date.now() + limits.reportTtlMinutes * 60 * 1000
  });
  return token;
}

function getStoredReport(token) {
  cleanupExpiredReports();
  if (!/^[a-f0-9]{48}$/.test(String(token || ''))) return null;
  return REPORTS.get(String(token)) || null;
}

module.exports = {
  getLimits,
  processPhotoZip,
  storeReport,
  getStoredReport
};
