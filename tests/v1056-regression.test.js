const assert = require('node:assert/strict');
const fs = require('node:fs');

function read(path) { return fs.readFileSync(path, 'utf8'); }

const eventService = read('services/eventService.js');
const migration = read('database/update_v1.0.56_event_action_type.sql');
const freshEventsMigration = read('database/update_v1.0.39_events.sql');

// Renombrar evento genera una accion de auditoria nueva.
assert.match(eventService, /actionType:\s*'EVENT_RENAMED'/);

// La base existente debe dejar de usar ENUM para action_type.
assert.match(migration, /ALTER TABLE `chc_event_action_logs` MODIFY COLUMN `action_type` VARCHAR\(40\) NOT NULL/i);
assert.match(migration, /data_type = 'enum'/i);

// Instalaciones nuevas tampoco deben recrear el ENUM limitado de versiones anteriores.
assert.match(freshEventsMigration, /action_type VARCHAR\(40\) NOT NULL/i);
assert.equal(/action_type\s+ENUM\s*\(/i.test(freshEventsMigration), false);

console.log('Regresiones criticas v1.0.56: OK');
