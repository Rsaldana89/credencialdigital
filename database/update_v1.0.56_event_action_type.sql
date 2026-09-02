-- Credenciales Digitales QR CHC v1.0.56
-- HOTFIX: permite registrar EVENT_RENAMED y futuras acciones del modulo de eventos.
-- Seguro para una base que ya tiene aplicada la migracion v1.0.54.
-- NO modifica personal, usuarios ni tablas del sistema de Incidencias.

SET @schema_name = DATABASE();

SET @sql = IF(
  EXISTS(
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = @schema_name
      AND table_name = 'chc_event_action_logs'
      AND column_name = 'action_type'
      AND data_type = 'enum'
  ),
  'ALTER TABLE `chc_event_action_logs` MODIFY COLUMN `action_type` VARCHAR(40) NOT NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SELECT COLUMN_TYPE AS action_type_actual
FROM information_schema.columns
WHERE table_schema = @schema_name
  AND table_name = 'chc_event_action_logs'
  AND column_name = 'action_type';

SELECT 'Migracion v1.0.56 aplicada correctamente' AS resultado;
