'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const credentialImageService = require('../services/credentialImageService');

async function run() {
  const canonicalEmployeeNumber = (value) => {
    const text = String(value || '').trim();
    if (!/^\d+$/.test(text)) return text;
    return text.replace(/^0+(?=\d)/, '');
  };
  assert.strictEqual(canonicalEmployeeNumber('01310'), '1310');
  assert.strictEqual(canonicalEmployeeNumber('1310'), '1310');
  assert.strictEqual(canonicalEmployeeNumber('00001'), '1');
  assert.strictEqual(canonicalEmployeeNumber('AB01310'), 'AB01310');

  const employeeSource = fs.readFileSync(path.join(__dirname, '..', 'services', 'employeeService.js'), 'utf8');
  assert(employeeSource.includes("CAST(TRIM(p.employee_number) AS UNSIGNED) = CAST(? AS UNSIGNED)"));

  const eventsNewSource = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'events-new.js'), 'utf8');
  assert(eventsNewSource.includes('canonicalEmployeeNumber'));

  const credentialSource = fs.readFileSync(path.join(__dirname, '..', 'services', 'credentialImageService.js'), 'utf8');
  assert(!credentialSource.includes('Activo: Sí'));
  assert(!credentialSource.includes('Fecha de consulta: ${escapeXml(generatedAt)}'));

  const root = path.join(__dirname, '..');
  const qrBuffer = await sharp({ create: { width: 320, height: 320, channels: 3, background: '#ffffff' } }).png().toBuffer();
  const png = await credentialImageService.generateCredentialPng({
    employee: {
      full_name: 'EMPLEADO DE PRUEBA',
      employee_number: '01310',
      puesto: 'PUESTO DE PRUEBA',
      nss: '12345678901'
    },
    photoBuffer: fs.readFileSync(path.join(root, 'public', 'img', 'photo-placeholder.png')),
    logoBuffer: fs.readFileSync(path.join(root, 'public', 'img', 'logo-corporativo-v30.png')),
    sloganBuffer: fs.readFileSync(path.join(root, 'public', 'img', 'frase-corporativa-v30.png')),
    qrBuffer,
    formattedStartDate: '01/01/2026',
    employmentDateLabel: 'Fecha de Ingreso',
    credentialTenure: '8 meses',
    displayEmployeeNumber: '01310'
  });

  const metadata = await sharp(png).metadata();
  assert.strictEqual(metadata.width, 1001);
  assert.strictEqual(metadata.height, 1570);

  console.log('v1.0.59 final polish: OK');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
