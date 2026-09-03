const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(path.join(__dirname, '..', 'services', 'eventExportService.js'), 'utf8');

const worksheetTemplateStart = source.indexOf('<worksheet xmlns=');
const worksheetTemplateEnd = source.indexOf('</worksheet>`;', worksheetTemplateStart);
if (worksheetTemplateStart < 0 || worksheetTemplateEnd < 0) {
  throw new Error('No se encontró la plantilla XML de la hoja Excel.');
}
const worksheetTemplate = source.slice(worksheetTemplateStart, worksheetTemplateEnd);
const autoFilterIndex = worksheetTemplate.indexOf('<autoFilter');
const mergeCellsIndex = worksheetTemplate.indexOf('<mergeCells');
if (autoFilterIndex < 0 || mergeCellsIndex < 0 || autoFilterIndex > mergeCellsIndex) {
  throw new Error('OOXML inválido: autoFilter debe escribirse antes de mergeCells.');
}
if (!source.includes('sanitizeXmlText(value)')) {
  throw new Error('Falta sanitización de caracteres no válidos de XML 1.0.');
}
if (!source.includes('\\u0000-\\u0008') || !source.includes('\\u000E-\\u001F')) {
  throw new Error('La sanitización XML no cubre los caracteres de control esperados.');
}
console.log('OK v1.0.58: estructura OOXML y sanitización de texto verificadas.');
