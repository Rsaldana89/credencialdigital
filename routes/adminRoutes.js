const crypto = require('crypto');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const express = require('express');
const multer = require('multer');
const adminController = require('../controllers/adminController');
const { requireAdmin, redirectIfAuthenticated } = require('../middleware/auth');
const { verifyCsrfToken } = require('../middleware/csrf');

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, callback) => {
    const allowed = new Set(['image/jpeg', 'image/jpg', 'image/png']);
    if (!allowed.has(file.mimetype)) {
      const error = new Error('Sólo se permiten imágenes JPG, JPEG o PNG.');
      error.code = 'INVALID_UPLOAD_TYPE';
      return callback(error);
    }
    return callback(null, true);
  }
});

function bulkZipMaxBytes() {
  const configured = Number.parseInt(process.env.BULK_ZIP_MAX_MB, 10);
  const megabytes = Number.isFinite(configured) ? Math.min(500, Math.max(10, configured)) : 200;
  return megabytes * 1024 * 1024;
}

const bulkZipUpload = multer({
  storage: multer.diskStorage({
    destination: os.tmpdir(),
    filename: (req, file, callback) => {
      callback(null, `chc_photo_import_${Date.now()}_${crypto.randomBytes(12).toString('hex')}.zip`);
    }
  }),
  limits: { fileSize: bulkZipMaxBytes(), files: 1 },
  fileFilter: (req, file, callback) => {
    const extension = path.extname(file.originalname || '').toLowerCase();
    const allowedMimes = new Set([
      'application/zip',
      'application/x-zip-compressed',
      'application/octet-stream'
    ]);
    if (extension !== '.zip' || !allowedMimes.has(String(file.mimetype || '').toLowerCase())) {
      const error = new Error('Selecciona un archivo ZIP válido.');
      error.code = 'INVALID_ZIP_TYPE';
      return callback(error);
    }
    return callback(null, true);
  }
});

router.get('/login', redirectIfAuthenticated, adminController.loginForm);
router.post('/login', redirectIfAuthenticated, verifyCsrfToken, adminController.login);
router.get('/logout', adminController.logout);

router.use(requireAdmin);

router.get('/', adminController.dashboard);
router.get('/empleados', adminController.employees);
router.post('/empleados/descargar-qrs', verifyCsrfToken, adminController.downloadQrPackage);

router.get('/fotografias/importar', adminController.bulkPhotoImportForm);
router.post(
  '/fotografias/importar',
  (req, res, next) => {
    bulkZipUpload.single('photos_zip')(req, res, (error) => {
      if (!error) {
        if (req.file?.path) {
          const temporaryPath = req.file.path;
          res.once('finish', () => {
            fs.unlink(temporaryPath).catch(() => {});
          });
        }
        return next();
      }
      req.session.flash = {
        type: 'danger',
        message: error.code === 'LIMIT_FILE_SIZE'
          ? `El ZIP supera el límite permitido de ${Math.round(bulkZipMaxBytes() / 1024 / 1024)} MB.`
          : error.message || 'No fue posible recibir el archivo ZIP.'
      };
      return res.redirect('/admin/fotografias/importar');
    });
  },
  verifyCsrfToken,
  adminController.bulkPhotoImport
);
router.get('/fotografias/importar/resultados/:token', adminController.bulkPhotoImportResult);
router.get('/fotografias/importar/reportes/:token.csv', adminController.downloadBulkPhotoReport);

router.get('/empleados/:employee_number', adminController.employeeDetail);
router.get('/empleados/:employee_number/foto', adminController.adminEmployeePhoto);
router.get('/empleados/:employee_number/qr.png', adminController.downloadQr);
router.post(
  '/empleados/:employee_number/foto',
  (req, res, next) => {
    // En formularios multipart/form-data, Multer debe procesar primero los
    // campos del formulario para que req.body._csrf esté disponible.
    upload.single('photo')(req, res, (error) => {
      if (!error) return next();
      req.session.flash = {
        type: 'danger',
        message: error.code === 'LIMIT_FILE_SIZE'
          ? 'La imagen supera el límite de 5 MB.'
          : error.message || 'No fue posible procesar la imagen.'
      };
      return res.redirect(`/admin/empleados/${encodeURIComponent(req.params.employee_number)}`);
    });
  },
  verifyCsrfToken,
  adminController.uploadPhoto
);
router.post('/generar-qr', verifyCsrfToken, adminController.generateQr);
router.post('/desactivar-bajas', verifyCsrfToken, adminController.deactivateInactive);

module.exports = router;
