'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const view = fs.readFileSync(path.join(root, 'views', 'credential.ejs'), 'utf8');
const browserJs = fs.readFileSync(path.join(root, 'public', 'js', 'credential.js'), 'utf8');
const imageService = fs.readFileSync(path.join(root, 'services', 'credentialImageService.js'), 'utf8');

assert(view.includes('data-download-credential'));
assert(view.includes('data-download-url="/e/<%= token %>/credencial.png"'));
assert(browserJs.includes('repaintCredentialText'));
assert(browserJs.includes("ctx.fillText('QR ASOCIADO'"));
assert(browserJs.includes("fetch(downloadUrl"));
assert(browserJs.includes("canvas.toBlob"));
assert(browserJs.includes("Arial, Helvetica, sans-serif"));
assert(imageService.includes('DejaVu Sans, Liberation Sans, sans-serif'));
assert(!imageService.includes('font-weight="650"'));

console.log('v1.0.60 credential PNG browser text fallback: OK');
