
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const controller = fs.readFileSync(path.join(root, 'controllers', 'adminController.js'), 'utf8');
const qrService = fs.readFileSync(path.join(root, 'services', 'qrService.js'), 'utf8');

const start = controller.indexOf('async function downloadQrWithIdPackage');
const end = controller.indexOf('async function downloadCredentialPackage', start);
assert(start >= 0 && end > start);
const fn = controller.slice(start, end);

// El endpoint debe iniciar el ZIP antes del bucle de generaciÃ³n.
assert(fn.includes("archiver('zip', { store: true })"));
assert(fn.includes('archive.pipe(res)'));
assert(fn.includes('res.flushHeaders'));
assert(fn.indexOf('archive.pipe(res)') < fn.indexOf('for (let index = 0; index < employeesWithQr.length'));

// No debe volver a preparar todos los buffers antes de abrir la descarga.
assert(!fn.includes('await buildQrWithIdFiles'));
assert(fn.includes('const batchSize = 4'));
assert(fn.includes('await buildQrWithIdFile(employee)'));
assert(fn.includes('archive.append(file.buffer'));

// Si el cliente abandona la peticiÃ³n, se cancela el trabajo restante.
assert(fn.includes("res.once('close'"));
assert(fn.includes('archive.abort()'));
assert(fn.includes('clientAborted'));

// La imagen conserva PNG, pero con compresiÃ³n moderada para reducir CPU.
assert(qrService.includes('.png({ compressionLevel: 4 })'));

console.log('v1.0.64 QR con ID streaming y optimizado: OK');
