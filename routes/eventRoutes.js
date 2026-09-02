const express = require('express');
const eventController = require('../controllers/eventController');
const { requireAdmin, requireRole } = require('../middleware/auth');
const { verifyCsrfToken } = require('../middleware/csrf');

const router = express.Router();

router.use(requireAdmin);

router.get('/', eventController.index);
router.get('/nuevo', requireRole('admin', 'capital_humano'), eventController.newForm);
router.post('/', requireRole('admin', 'capital_humano'), verifyCsrfToken, eventController.create);
router.get('/:eventId', eventController.show);
router.get('/:eventId/buscar', eventController.search);
router.get('/:eventId/estado-vivo', eventController.liveState);
router.post('/:eventId/escanear', verifyCsrfToken, eventController.scan);
router.post('/:eventId/asistentes/:attendeeId/asistencia', verifyCsrfToken, eventController.checkIn);
router.post('/:eventId/asistentes/:attendeeId/premio', verifyCsrfToken, eventController.award);
router.post('/:eventId/invitados/actualizar', requireRole('admin', 'capital_humano'), verifyCsrfToken, eventController.refreshInvitees);
router.post('/:eventId/invitados/agregar', requireRole('admin', 'capital_humano'), verifyCsrfToken, eventController.addInvitees);
router.post('/:eventId/estado', requireRole('admin', 'capital_humano'), verifyCsrfToken, eventController.setStatus);
router.post('/:eventId/renombrar', requireRole('admin', 'capital_humano'), verifyCsrfToken, eventController.rename);
router.get('/:eventId/exportar.xlsx', requireRole('admin', 'capital_humano'), eventController.exportXlsx);
router.get('/:eventId/exportar.pdf', requireRole('admin', 'capital_humano'), eventController.exportPdf);

module.exports = router;
