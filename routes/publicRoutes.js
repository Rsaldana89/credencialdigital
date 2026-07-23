const express = require('express');
const publicController = require('../controllers/publicController');

const router = express.Router();

router.get('/', publicController.home);
router.get('/e/:token', publicController.credential);
router.get('/e/:token/foto', publicController.employeePhoto);
router.get('/e/:token/credencial.png', publicController.downloadCredentialPng);

module.exports = router;
