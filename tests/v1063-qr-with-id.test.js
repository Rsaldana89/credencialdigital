'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const portableText = require('../services/portableText');

const root = path.join(__dirname, '..');
const routes = fs.readFileSync(path.join(root, 'routes', 'adminRoutes.js'), 'utf8');
const controller = fs.readFileSync(path.join(root, 'controllers', 'adminController.js'), 'utf8');
const employeesView = fs.readFileSync(path.join(root, 'views', 'admin', 'employees.ejs'), 'utf8');
const qrService = fs.readFileSync(path.join(root, 'services', 'qrService.js'), 'utf8');

assert(routes.includes('/empleados/descargar-qrs-con-id'));
assert(routes.includes('adminController.downloadQrWithIdPackage'));
assert(controller.includes('async function downloadQrWithIdPackage'));
assert(controller.includes('buildQrWithIdFiles'));
assert(controller.includes('formatEmployeeNumber(employee.employee_number, 5)'));
assert(controller.includes('QRS_CON_ID_EMPLEADOS_ACTIVOS_'));
assert(employeesView.includes('Descargar QR con ID'));

// El QR base conserva 800 px y la variante solo agrega espacio inferior.
assert(qrService.includes('const QR_PNG_WIDTH = 800'));
assert(qrService.includes('const QR_WITH_ID_BOTTOM_SPACE = 190'));
assert(qrService.includes('.extend({'));
assert(qrService.includes('bottom: QR_WITH_ID_BOTTOM_SPACE'));
assert(qrService.includes('top: QR_PNG_WIDTH'));

// El ID se renderiza como vectores portables, centrado y con separacion entre digitos.
assert(qrService.includes('renderPortableText(displayId'));
assert(qrService.includes("anchor: 'middle'"));
assert(qrService.includes('letterSpacing: 6'));
const renderedId = portableText.renderPortableText('04986', {
  x: 400,
  y: 135,
  fontSize: 84,
  anchor: 'middle',
  letterSpacing: 6
});
assert(renderedId.includes('<path'));
assert(!renderedId.includes('<text'));
assert(portableText.measurePortableText('04986', 84) > 250);

console.log('v1.0.63 QR package with visible 5-digit employee ID: OK');
