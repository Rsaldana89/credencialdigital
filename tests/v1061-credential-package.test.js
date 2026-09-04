'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const routes = fs.readFileSync(path.join(root, 'routes', 'adminRoutes.js'), 'utf8');
const controller = fs.readFileSync(path.join(root, 'controllers', 'adminController.js'), 'utf8');
const employeeService = fs.readFileSync(path.join(root, 'services', 'employeeService.js'), 'utf8');
const employeesView = fs.readFileSync(path.join(root, 'views', 'admin', 'employees.ejs'), 'utf8');
const portableTextModule = require('../services/portableText');

assert(routes.includes("/empleados/descargar-credenciales"));
assert(routes.includes('adminController.downloadCredentialPackage'));
assert(controller.includes('async function downloadCredentialPackage'));
assert(controller.includes('buildCredentialFile'));
assert(controller.includes("archiver('zip', { store: true })"));
assert(employeeService.includes('listActiveEmployeesForCredentialPackage'));
assert(employeesView.includes('Descargar paquete de credenciales'));

const rendered = portableTextModule.renderPortableText('MARTÍNEZ Ñ 03296', {
  x: 10,
  y: 40,
  fontSize: 24,
  fill: '#781321'
});
assert(rendered.includes('<path'));
assert(!rendered.includes('<text'));
assert(portableTextModule.measurePortableText('03296', 30) > 0);

console.log('v1.0.61 credential package + portable text: OK');
