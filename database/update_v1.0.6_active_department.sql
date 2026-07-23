USE sistema_gestion;

-- Credenciales Digitales QR CHC - Actualizacion v1.0.6
-- No modifica la tabla personal ni elimina QR, fotos o bitacoras.
-- Corrige la regla de vigencia para usar department_name = 'Baja'.
-- fecha_baja se conserva como dato historico, pero ya no determina la vigencia.

-- 1. Permite guardar todos los resultados de consulta sin errores de truncamiento.
ALTER TABLE employee_qr_access_logs
  MODIFY access_result VARCHAR(50)
  CHARACTER SET ascii
  COLLATE ascii_general_ci
  NOT NULL;

-- 2. Reactiva solamente los QR que las versiones anteriores desactivaron por
-- fecha_baja, siempre que el empleado actualmente NO este en el departamento Baja.
-- No reactiva QR revocados manualmente ni QR de empleados realmente dados de baja.
UPDATE employee_qr_tokens t
INNER JOIN personal p
  ON p.employee_number = t.employee_number
SET
  t.is_active = 1,
  t.revoked_at = NULL,
  t.revoked_reason = NULL
WHERE t.is_active = 0
  AND UPPER(TRIM(COALESCE(p.department_name, ''))) <> 'BAJA'
  AND COALESCE(t.revoked_reason, '') IN (
    'Empleado dado de baja',
    'Empleado inactivo',
    'Empleado inactivo segun fecha_baja'
  );

SELECT ROW_COUNT() AS qr_reactivados_por_correccion;

-- 3. Actualiza exclusivamente las vistas del modulo QR.
CREATE OR REPLACE VIEW vw_qr_employees_active AS
SELECT
  p.employee_number,
  p.full_name,
  p.nss,
  p.puesto,
  p.department_name,
  p.start_date,
  t.qr_token,
  t.created_at AS qr_created_at,
  CASE WHEN ep.id IS NULL THEN 0 ELSE 1 END AS has_photo
FROM personal p
LEFT JOIN employee_qr_tokens t
  ON t.employee_number = p.employee_number
 AND t.is_active = 1
LEFT JOIN employee_photos ep
  ON ep.employee_number = p.employee_number
WHERE UPPER(TRIM(COALESCE(p.department_name, ''))) <> 'BAJA';

CREATE OR REPLACE VIEW vw_qr_public_card AS
SELECT
  t.qr_token,
  p.employee_number,
  p.full_name,
  p.nss,
  p.puesto,
  p.department_name,
  p.start_date,
  'ACTIVO' AS employee_status,
  CASE WHEN ep.id IS NULL THEN 0 ELSE 1 END AS has_photo
FROM employee_qr_tokens t
INNER JOIN personal p
  ON p.employee_number = t.employee_number
LEFT JOIN employee_photos ep
  ON ep.employee_number = t.employee_number
WHERE t.is_active = 1
  AND UPPER(TRIM(COALESCE(p.department_name, ''))) <> 'BAJA';

-- 4. Reemplaza exclusivamente los dos procedimientos del modulo QR.
DROP PROCEDURE IF EXISTS sp_generate_missing_employee_qr_tokens;
DELIMITER $$
CREATE PROCEDURE sp_generate_missing_employee_qr_tokens()
BEGIN
  INSERT INTO employee_qr_tokens
    (employee_number, qr_token, is_active, created_at)
  SELECT
    active_employees.employee_number,
    LOWER(HEX(RANDOM_BYTES(32))),
    1,
    NOW()
  FROM (
    SELECT DISTINCT p.employee_number
    FROM personal p
    WHERE UPPER(TRIM(COALESCE(p.department_name, ''))) <> 'BAJA'
      AND p.employee_number IS NOT NULL
      AND CHAR_LENGTH(TRIM(p.employee_number)) > 0
  ) AS active_employees
  LEFT JOIN employee_qr_tokens t
    ON t.employee_number = active_employees.employee_number
   AND t.is_active = 1
  WHERE t.id IS NULL;

  SELECT ROW_COUNT() AS generated_count;
END$$
DELIMITER ;

DROP PROCEDURE IF EXISTS sp_deactivate_qr_for_inactive_employees;
DELIMITER $$
CREATE PROCEDURE sp_deactivate_qr_for_inactive_employees()
BEGIN
  UPDATE employee_qr_tokens t
  LEFT JOIN personal p
    ON p.employee_number = t.employee_number
  SET
    t.is_active = 0,
    t.revoked_at = NOW(),
    t.revoked_reason = CASE
      WHEN p.employee_number IS NULL THEN 'Empleado no encontrado en personal'
      ELSE 'Empleado ubicado en departamento Baja'
    END
  WHERE t.is_active = 1
    AND (
      p.employee_number IS NULL
      OR UPPER(TRIM(COALESCE(p.department_name, ''))) = 'BAJA'
    );

  SELECT ROW_COUNT() AS deactivated_count;
END$$
DELIMITER ;

-- 5. Verificacion final. Estos SELECT no modifican informacion.
SELECT
  COLUMN_TYPE,
  CHARACTER_SET_NAME,
  COLLATION_NAME
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'employee_qr_access_logs'
  AND COLUMN_NAME = 'access_result';

SELECT
  SUM(UPPER(TRIM(COALESCE(department_name, ''))) <> 'BAJA') AS empleados_activos,
  SUM(UPPER(TRIM(COALESCE(department_name, ''))) = 'BAJA') AS empleados_en_baja
FROM personal;

SELECT
  SUM(is_active = 1) AS qr_activos,
  SUM(is_active = 0) AS qr_inactivos
FROM employee_qr_tokens;
