'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const view = fs.readFileSync(path.join(root, 'views', 'credential.ejs'), 'utf8');
const browserJs = fs.readFileSync(path.join(root, 'public', 'js', 'credential.js'), 'utf8');
const imageService = fs.readFileSync(path.join(root, 'services', 'credentialImageService.js'), 'utf8');
const portableText = fs.readFileSync(path.join(root, 'services', 'portableText.js'), 'utf8');

assert(view.includes('data-download-credential'));
assert(view.includes('data-download-url="/e/<%= token %>/credencial.png"'));
assert(browserJs.includes('fetch(downloadUrl'));
assert(!browserJs.includes('repaintCredentialText'));
assert(!browserJs.includes('canvas.toBlob'));
assert(imageService.includes("require('./portableText')"));
assert(imageService.includes("renderPortableText('QR ASOCIADO'"));
assert(!imageService.includes('<text'));
assert(portableText.includes('function renderPortableText'));
assert(portableText.includes('<path d='));

console.log('v1.0.61 credential PNG portable vector text: OK');
