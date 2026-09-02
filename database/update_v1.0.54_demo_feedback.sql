-- Credenciales Digitales QR CHC v1.0.54
-- OBLIGATORIO: ejecutar una sola vez antes de desplegar la aplicación.
-- Solo modifica tablas propias de Credenciales; NO toca personal ni usuarios de Incidencias.

SET @schema_name = DATABASE();

SET @sql = IF(
  EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema=@schema_name AND table_name='chc_event_attendees')
  AND NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=@schema_name AND table_name='chc_event_attendees' AND column_name='effective_start_date_snapshot'),
  'ALTER TABLE `chc_event_attendees` ADD COLUMN `effective_start_date_snapshot` DATE NULL AFTER `employee_number`',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF(
  EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema=@schema_name AND table_name='chc_event_attendees')
  AND NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=@schema_name AND table_name='chc_event_attendees' AND column_name='employment_date_type_snapshot'),
  'ALTER TABLE `chc_event_attendees` ADD COLUMN `employment_date_type_snapshot` VARCHAR(20) NULL AFTER `effective_start_date_snapshot`',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF(
  EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema=@schema_name AND table_name='chc_event_attendees')
  AND NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=@schema_name AND table_name='chc_event_attendees' AND column_name='seniority_group_snapshot'),
  'ALTER TABLE `chc_event_attendees` ADD COLUMN `seniority_group_snapshot` VARCHAR(24) NULL AFTER `employment_date_type_snapshot`',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF(
  EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema=@schema_name AND table_name='chc_event_attendees')
  AND NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=@schema_name AND table_name='chc_event_attendees' AND column_name='seniority_text_snapshot'),
  'ALTER TABLE `chc_event_attendees` ADD COLUMN `seniority_text_snapshot` VARCHAR(80) NULL AFTER `seniority_group_snapshot`',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Permitimos el nuevo rol sin suponer cuáles valores previos tenía un posible ENUM.
-- VARCHAR conserva los usuarios actuales y permite event_operator.
SET @sql = IF(
  EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=@schema_name AND table_name='chc_admin_users' AND column_name='role' AND data_type='enum'),
  'ALTER TABLE `chc_admin_users` MODIFY COLUMN `role` VARCHAR(40) NOT NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SELECT 'Migración v1.0.54 aplicada correctamente' AS resultado;
