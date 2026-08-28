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
router.get('/:eventId/estado-vivo', eventController.liveState);
router.post('/:eventId/escanear', verifyCsrfToken, eventController.scan);
router.post('/:eventId/asistentes/:attendeeId/asistencia', verifyCsrfToken, eventController.checkIn);
router.post('/:eventId/asistentes/:attendeeId/premio', verifyCsrfToken, eventController.award);
router.post('/:eventId/invitados/actualizar', verifyCsrfToken, eventController.refreshInvitees);
router.post('/:eventId/invitados/agregar', verifyCsrfToken, eventController.addInvitees);
router.post('/:eventId/estado', verifyCsrfToken, eventController.setStatus);
router.get('/:eventId/exportar.xlsx', eventController.exportXlsx);
router.get('/:eventId/exportar.pdf', eventController.exportPdf);

module.exports = router;
