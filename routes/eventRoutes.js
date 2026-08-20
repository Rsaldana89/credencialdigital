const express = require('express');
const eventController = require('../controllers/eventController');
const { requireAdmin } = require('../middleware/auth');
const { verifyCsrfToken } = require('../middleware/csrf');

const router = express.Router();

router.use(requireAdmin);

router.get('/', eventController.index);
router.get('/nuevo', eventController.newForm);
router.post('/', verifyCsrfToken, eventController.create);
router.get('/:eventId', eventController.show);
router.get('/:eventId/buscar', eventController.search);
router.post('/:eventId/escanear', verifyCsrfToken, eventController.scan);
router.post('/:eventId/asistentes/:attendeeId/asistencia', verifyCsrfToken, eventController.checkIn);
router.post('/:eventId/asistentes/:attendeeId/premio', verifyCsrfToken, eventController.award);
router.post('/:eventId/premios/habilitar', verifyCsrfToken, eventController.enableAwards);
router.post('/:eventId/estado', verifyCsrfToken, eventController.setStatus);
router.get('/:eventId/exportar.xlsx', eventController.exportXlsx);
router.get('/:eventId/exportar.pdf', eventController.exportPdf);

module.exports = router;
