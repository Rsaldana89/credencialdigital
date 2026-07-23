const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');
const archiver = require('archiver');
const employeeService = require('../services/employeeService');
const photoService = require('../services/photoService');
const qrService = require('../services/qrService');
const bulkPhotoImportService = require('../services/bulkPhotoImportService');

function formatDate(value) {
  if (!value) return 'No disponible';
  const text = String(value).slice(0, 10);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : text;
}

function safeEqual(left, right) {
  const leftDigest = crypto.createHash('sha256').update(String(left || '')).digest();
  const rightDigest = crypto.createHash('sha256').update(String(right || '')).digest();
  return crypto.timingSafeEqual(leftDigest, rightDigest);
}

function setFlash(req, type, message) {
  req.session.flash = { type, message };
}


function getSafeEmployeeNumber(value, fallback = 'empleado') {
  const normalized = employeeService.normalizeEmployeeNumber(value);
  if (normalized) return normalized;
  return String(fallback || 'empleado').replace(/[^A-Za-z0-9._-]/g, '_');
}

function getQrFilename(employeeNumber, qrId) {
  return `${getSafeEmployeeNumber(employeeNumber, `QR_${qrId || 'empleado'}`)}_QR.png`;
}

async function buildQrFiles(employees, batchSize = 20) {
  const files = [];

  for (let index = 0; index < employees.length; index += batchSize) {
    const batch = employees.slice(index, index + batchSize);
    const generated = await Promise.all(batch.map(async (employee) => {
      const employeeNumber = employeeService.normalizeEmployeeNumber(employee.employee_number);
      if (!employeeNumber || !employee.qr_token) return null;

      const buffer = await qrService.generatePngBuffer(employee.qr_token);
      return {
        buffer,
        filename: getQrFilename(employeeNumber, employee.qr_id)
      };
    }));

    files.push(...generated.filter(Boolean));
  }

  return files;
}

function loginForm(req, res) {
  res.render('admin/login', { title: 'Acceso administrativo' });
}

async function login(req, res, next) {
  try {
    const validUser = safeEqual(req.body.username, process.env.ADMIN_USER || 'admin');
    const validPassword = safeEqual(req.body.password, process.env.ADMIN_PASSWORD || 'admin123');

    if (!validUser || !validPassword) {
      return res.status(401).render('admin/login', {
        title: 'Acceso administrativo',
        loginError: 'Usuario o contraseña incorrectos.'
      });
    }

    const returnTo = req.session.returnTo && String(req.session.returnTo).startsWith('/admin')
      ? req.session.returnTo
      : '/admin';

    req.session.regenerate((error) => {
      if (error) return next(error);
      req.session.adminAuthenticated = true;
      req.session.adminUser = process.env.ADMIN_USER || 'admin';
      req.session.csrfToken = crypto.randomBytes(32).toString('hex');
      req.session.flash = { type: 'success', message: 'Sesión iniciada correctamente.' };
      return res.redirect(returnTo);
    });
  } catch (error) {
    return next(error);
  }
}

function logout(req, res, next) {
  req.session.destroy((error) => {
    if (error) return next(error);
    res.clearCookie('chc_credenciales_sid');
    return res.redirect('/admin/login');
  });
}

async function dashboard(req, res, next) {
  try {
    const stats = await employeeService.getDashboardStats();
    return res.render('admin/dashboard', {
      title: 'Panel administrativo',
      stats
    });
  } catch (error) {
    return next(error);
  }
}

async function employees(req, res, next) {
  try {
    const search = String(req.query.q || '').trim().slice(0, 100);
    const employeeList = await employeeService.listActiveEmployees(search);
    return res.render('admin/employees', {
      title: 'Empleados activos',
      employees: employeeList,
      search,
      formatDate
    });
  } catch (error) {
    return next(error);
  }
}

async function employeeDetail(req, res, next) {
  try {
    const employee = await employeeService.getEmployeeByNumber(req.params.employee_number);
    if (!employee) {
      return res.status(404).render('invalid', {
        title: 'Empleado no encontrado',
        heading: 'Empleado no encontrado',
        message: 'No se encontró un empleado con ese número.'
      });
    }

    const qrRecord = await employeeService.getActiveQrByEmployee(employee.employee_number);
    const publicUrl = qrRecord ? qrService.buildPublicUrl(qrRecord.qr_token) : null;
    const qrDataUrl = qrRecord ? await qrService.generateDataUrl(qrRecord.qr_token) : null;

    return res.render('admin/employeeDetail', {
      title: employee.full_name || `Empleado ${employee.employee_number}`,
      employee,
      employeeIsActive: employeeService.isEmployeeActive(employee),
      qrRecord,
      publicUrl,
      qrDataUrl,
      formatDate
    });
  } catch (error) {
    return next(error);
  }
}

async function adminEmployeePhoto(req, res, next) {
  try {
    const photo = await employeeService.getPhotoByEmployeeNumber(req.params.employee_number);
    if (!photo) {
      return res.sendFile(path.join(__dirname, '..', 'public', 'img', 'photo-placeholder.png'));
    }
    res.set({
      'Content-Type': photo.mime_type || 'image/jpeg',
      'Cache-Control': 'private, max-age=60',
      'X-Content-Type-Options': 'nosniff'
    });
    return res.send(photo.photo_blob);
  } catch (error) {
    return next(error);
  }
}

async function uploadPhoto(req, res, next) {
  try {
    const employee = await employeeService.getEmployeeByNumber(req.params.employee_number);
    if (!employee) {
      setFlash(req, 'danger', 'El empleado no existe.');
      return res.redirect('/admin/empleados');
    }
    if (!req.file) {
      setFlash(req, 'danger', 'Selecciona una imagen JPG, JPEG o PNG.');
      return res.redirect(`/admin/empleados/${encodeURIComponent(employee.employee_number)}`);
    }

    const normalized = await photoService.normalizePhoto(req.file.buffer);
    await photoService.saveEmployeePhoto({
      employeeNumber: employee.employee_number,
      normalized,
      originalFilename: req.file.originalname,
      uploadedBy: req.session.adminUser
    });

    setFlash(req, 'success', 'Foto guardada y normalizada correctamente.');
    return res.redirect(`/admin/empleados/${encodeURIComponent(employee.employee_number)}`);
  } catch (error) {
    if (error.code === 'INVALID_IMAGE_FORMAT' || error.name === 'InputBufferError') {
      setFlash(req, 'danger', 'La imagen no es válida o está dañada. Usa JPG, JPEG o PNG.');
      return res.redirect(`/admin/empleados/${encodeURIComponent(req.params.employee_number)}`);
    }
    return next(error);
  }
}

function bulkPhotoImportForm(req, res) {
  const limits = bulkPhotoImportService.getLimits();
  return res.render('admin/bulkPhotos', {
    title: 'Importación masiva de fotografías',
    limits
  });
}

async function bulkPhotoImport(req, res, next) {
  const temporaryPath = req.file?.path;
  try {
    if (!req.file) {
      setFlash(req, 'danger', 'Selecciona un archivo ZIP con las fotografías.');
      return res.redirect('/admin/fotografias/importar');
    }

    const report = await bulkPhotoImportService.processPhotoZip({
      zipPath: req.file.path,
      mode: req.body.mode,
      uploadedBy: req.session.adminUser,
      originalFilename: req.file.originalname
    });
    const reportToken = await bulkPhotoImportService.storeReport(report);
    return res.redirect(`/admin/fotografias/importar/resultados/${reportToken}`);
  } catch (error) {
    const friendlyErrors = new Set([
      'ZIP_INVALID',
      'ZIP_TRUNCATED',
      'ZIP_MULTIDISK_UNSUPPORTED',
      'ZIP64_UNSUPPORTED',
      'ZIP_TOO_MANY_ENTRIES',
      'ZIP_UNCOMPRESSED_TOO_LARGE',
      'ZIP_EMPTY',
      'TOO_MANY_IMAGES'
    ]);

    if (friendlyErrors.has(error.code)) {
      setFlash(req, 'danger', error.message);
      return res.redirect('/admin/fotografias/importar');
    }
    return next(error);
  } finally {
    if (temporaryPath) {
      await fs.unlink(temporaryPath).catch(() => {});
    }
  }
}

function bulkPhotoImportResult(req, res) {
  const stored = bulkPhotoImportService.getStoredReport(req.params.token);
  if (!stored) {
    return res.status(404).render('invalid', {
      title: 'Reporte no disponible',
      heading: 'Reporte no disponible',
      message: 'El reporte expiró o el identificador no es válido. Realiza nuevamente la importación.'
    });
  }

  return res.render('admin/bulkPhotoResult', {
    title: 'Resultado de importación',
    report: stored.report,
    reportToken: req.params.token
  });
}

function downloadBulkPhotoReport(req, res) {
  const stored = bulkPhotoImportService.getStoredReport(req.params.token);
  if (!stored) {
    return res.status(404).render('invalid', {
      title: 'Reporte no disponible',
      heading: 'Reporte no disponible',
      message: 'El reporte expiró o ya no está disponible.'
    });
  }

  const dateStamp = new Date(stored.report.finishedAt).toISOString().slice(0, 10);
  return res.download(stored.csvPath, `REPORTE_FOTOS_${dateStamp}.csv`);
}

async function generateQr(req, res, next) {
  try {
    const mode = String(req.body.mode || 'individual');
    if (mode === 'missing') {
      const generatedCount = await employeeService.generateMissingTokens();
      setFlash(req, 'success', `Proceso terminado. Se generaron ${generatedCount} QR nuevos.`);
      return res.redirect('/admin/empleados');
    }

    const employeeNumber = req.body.employee_number;
    const result = await employeeService.generateQrForEmployee(employeeNumber);
    setFlash(
      req,
      'success',
      result.created ? 'QR generado correctamente.' : 'El empleado ya tenía un QR activo.'
    );
    return res.redirect(`/admin/empleados/${encodeURIComponent(employeeNumber)}`);
  } catch (error) {
    setFlash(req, 'danger', error.message || 'No fue posible generar el QR.');
    const employeeNumber = String(req.body.employee_number || '');
    if (employeeService.normalizeEmployeeNumber(employeeNumber)) {
      return res.redirect(`/admin/empleados/${encodeURIComponent(employeeNumber)}`);
    }
    return res.redirect('/admin/empleados');
  }
}

async function deactivateInactive(req, res, next) {
  try {
    const count = await employeeService.deactivateQrForInactiveEmployees();
    setFlash(req, 'success', `Proceso terminado. Se desactivaron ${count} QR.`);
    return res.redirect('/admin');
  } catch (error) {
    return next(error);
  }
}

async function downloadQr(req, res, next) {
  try {
    const employee = await employeeService.getEmployeeByNumber(req.params.employee_number);
    const qrRecord = employee
      ? await employeeService.getActiveQrByEmployee(employee.employee_number)
      : null;

    if (!employee || !qrRecord) {
      return res.status(404).render('invalid', {
        title: 'QR no disponible',
        heading: 'QR no disponible',
        message: 'El empleado no tiene un QR activo.'
      });
    }

    const buffer = await qrService.generatePngBuffer(qrRecord.qr_token);
    const filename = getQrFilename(employee.employee_number, qrRecord.id);
    res.set({
      'Content-Type': 'image/png',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store'
    });
    return res.send(buffer);
  } catch (error) {
    return next(error);
  }
}

async function downloadQrPackage(req, res, next) {
  try {
    // Asegura que todos los empleados activos tengan token antes de preparar el paquete.
    await employeeService.generateMissingTokens();
    const employeesWithQr = await employeeService.listActiveEmployeesWithQr();

    if (!employeesWithQr.length) {
      setFlash(req, 'danger', 'No hay códigos QR disponibles para descargar.');
      return res.redirect('/admin/empleados');
    }

    const qrFiles = await buildQrFiles(employeesWithQr);
    if (!qrFiles.length) {
      setFlash(req, 'danger', 'No fue posible preparar los códigos QR del paquete.');
      return res.redirect('/admin/empleados');
    }

    const dateStamp = new Date().toISOString().slice(0, 10);
    const packageFilename = `QRS_EMPLEADOS_ACTIVOS_${dateStamp}.zip`;
    const archive = archiver('zip', { zlib: { level: 9 } });

    archive.on('warning', (error) => {
      if (error.code !== 'ENOENT') {
        console.error('Advertencia al preparar el paquete QR:', error);
      }
    });
    archive.on('error', (error) => {
      if (!res.destroyed) res.destroy(error);
    });

    res.set({
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${packageFilename}"`,
      'Cache-Control': 'no-store'
    });

    archive.pipe(res);
    qrFiles.forEach((file) => {
      archive.append(file.buffer, { name: file.filename });
    });
    archive.append(
      Buffer.from(
        `Paquete de códigos QR de empleados activos.\r\n` +
        `Generado: ${new Date().toLocaleString('es-MX')}\r\n` +
        `Total de archivos QR: ${qrFiles.length}\r\n` +
        `Formato de nombre: NUMERO_EMPLEADO_QR.png\r\n`,
        'utf8'
      ),
      { name: 'LEEME.txt' }
    );

    await archive.finalize();
    return undefined;
  } catch (error) {
    if (res.headersSent) {
      if (!res.destroyed) res.destroy(error);
      return undefined;
    }
    return next(error);
  }
}

module.exports = {
  loginForm,
  login,
  logout,
  dashboard,
  employees,
  employeeDetail,
  adminEmployeePhoto,
  uploadPhoto,
  bulkPhotoImportForm,
  bulkPhotoImport,
  bulkPhotoImportResult,
  downloadBulkPhotoReport,
  generateQr,
  deactivateInactive,
  downloadQr,
  downloadQrPackage
};
