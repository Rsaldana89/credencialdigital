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

router.get('/login', redirectIfAuthenticated, adminController.loginForm);
router.post('/login', redirectIfAuthenticated, verifyCsrfToken, adminController.login);
router.get('/logout', adminController.logout);

router.use(requireAdmin);

router.get('/', adminController.dashboard);
router.get('/empleados', adminController.employees);
router.post('/empleados/descargar-qrs', verifyCsrfToken, adminController.downloadQrPackage);
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
