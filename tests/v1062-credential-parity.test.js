'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const service = require('../services/credentialImageService');

const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'services', 'credentialImageService.js'), 'utf8');
const view = fs.readFileSync(path.join(root, 'views', 'credential.ejs'), 'utf8');

assert.strictEqual(service.CARD_WIDTH, 1001);
assert.strictEqual(service.CARD_HEIGHT, 1570);
assert.strictEqual(service.ICON_SIZE, 74);
assert(service.VALUE_SIZE > 21 && service.VALUE_SIZE < 22.5);
assert(service.LABEL_SIZE > 23 && service.LABEL_SIZE < 24.5);
assert(service.TENURE_SIZE > 15 && service.TENURE_SIZE < 16);
assert(Math.abs(service.FIELDS.top - (1570 * 0.482)) < 0.01);
assert(Math.abs(service.FIELDS.width - (1001 * 0.548)) < 0.01);
assert(source.includes('excessY * 0.38'));
assert(source.includes("label: `${employmentDateLabel}:`"));
assert(source.includes('tenure: credentialTenure'));
assert(view.includes('chc30-fields'), 'La vista web original debe conservarse como referencia visual');
assert(view.includes('chc30-photo'));

console.log('v1.0.62 credential download geometry aligned to browser CSS: OK');
