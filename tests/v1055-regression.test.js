const assert = require('node:assert/strict');
const fs = require('node:fs');

function read(path) {
  return fs.readFileSync(path, 'utf8');
}

const employeeService = read('services/employeeService.js');
const publicController = read('controllers/publicController.js');
const credentialView = read('views/credential.ejs');
const eventService = read('services/eventService.js');
const tenureService = read('services/tenureService.js');

// Regresión crítica de v1.0.54: nunca inyectar campos antes de DISTINCT ni dentro del INSERT de QR.
assert.equal(employeeService.includes("employment_date_type, DISTINCT"), false);
assert.match(employeeService, /SELECT\s+DISTINCT\s+p\.employee_number/i);
assert.match(employeeService, /INSERT INTO employee_qr_tokens\s*\(employee_number, qr_token, is_active, created_at\)\s*VALUES \(\?, \?, 1, NOW\(\)\)/i);

// El dashboard debe conservar consultas autocontenidas, sin alias p suelto en el SELECT principal.
const dashboardStart = employeeService.indexOf('async function getDashboardStats()');
const dashboardEnd = employeeService.indexOf('async function listEmployeesForPhotoImport()', dashboardStart);
const dashboard = employeeService.slice(dashboardStart, dashboardEnd);
assert.match(dashboard, /FROM personal p/);
assert.equal(dashboard.includes('p.start_date AS original_start_date'), false);

// Credencial: la fecha efectiva y la etiqueta de reingreso deben usarse realmente.
assert.match(employeeService, /COALESCE\(p\.fecha_reingreso, p\.start_date\) AS effective_start_date/);
assert.match(publicController, /employee\.effective_start_date \|\| employee\.start_date/);
assert.match(publicController, /Fecha de Reingreso/);
assert.match(credentialView, /employmentDateLabel/);
assert.match(credentialView, /credentialTenure/);
assert.match(publicController, /calculateTenureDetails\(effectiveStartDate, getCurrentDateInEventZone\(\)\)/);

// Evento abierto usa personal actual; cerrado usa snapshot histórico.
assert.match(eventService, /WHEN e\.status = 'CLOSED' THEN COALESCE\(a\.effective_start_date_snapshot, a\.start_date_snapshot\)/);
assert.match(eventService, /ELSE COALESCE\(p\.fecha_reingreso, p\.start_date, a\.effective_start_date_snapshot, a\.start_date_snapshot\)/);
assert.match(eventService, /snapshotEmploymentForClosedEvent/);
assert.match(tenureService, /attendee\?\.effective_start_date \|\| attendee\?\.start_date_snapshot/);

console.log('Regresiones críticas v1.0.55: OK');
