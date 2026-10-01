const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const routes = read('routes/adminRoutes.js');
const controller = read('controllers/adminController.js');
const qrService = read('services/qrService.js');
const employeeService = read('services/employeeService.js');
const employeesView = read('views/admin/employees.ejs');

assert(routes.includes('/empleados/descargar-qrs-con-nombre'));
assert(routes.includes('downloadQrWithNamePackage'));
assert(controller.includes('buildQrWithNameFile'));
assert(controller.includes('generatePngWithEmployeeNameAndId'));
assert(controller.includes('QRS_CON_NOMBRE_E_ID_EMPLEADOS_ACTIVOS_'));
assert(qrService.includes('generatePngWithEmployeeNameAndId'));
assert(qrService.includes('wrapPortableText'));
assert(employeeService.includes('p.full_name'));
assert(employeesView.includes('Descargar QR con nombre'));

console.log('v1.0.65 QR con nombre completo, QR e ID: OK');
