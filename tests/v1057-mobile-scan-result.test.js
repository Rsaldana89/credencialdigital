const fs = require('fs');
const path = require('path');

function read(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
}

function expectIncludes(text, needle, label) {
  if (!text.includes(needle)) {
    throw new Error(`Falta ${label}: ${needle}`);
  }
}

const view = read('views/admin/events/show.ejs');
const js = read('public/js/events-show.js');
const css = read('public/css/events.css');
const controller = read('controllers/eventController.js');

expectIncludes(view, 'id="event-result-dismiss"', 'botón para cerrar el resultado móvil');
expectIncludes(view, '/js/events-show.js?v=1.0.57', 'cache bust JS v1.0.57');
expectIncludes(js, "resultKicker.textContent = '✓ ASISTENCIA REGISTRADA';", 'confirmación clara de asistencia nueva');
expectIncludes(js, "resultKicker.textContent = '✓ ASISTENCIA YA REGISTRADA';", 'confirmación clara de asistencia existente');
expectIncludes(js, 'no necesitas volver a escanear', 'indicación para premio sin reescaneo');
expectIncludes(js, 'now - lastQrAt < 7000', 'pausa de relectura del mismo QR');
expectIncludes(css, '.event-scan-result:not([hidden])', 'hoja inferior móvil');
expectIncludes(css, 'position: fixed;', 'resultado visible sobre la vista móvil');
expectIncludes(css, '.event-result-actions', 'acciones de premio visibles');
expectIncludes(controller, '/css/events.css?v=1.0.57', 'cache bust CSS v1.0.57');

console.log('v1.0.57 mobile scan result regression: OK');
