USE sistema_gestion;

-- Actualización v1.0.2
-- Corrige comparaciones entre employee_number con collations diferentes.
-- No altera la tabla personal ni elimina datos de las tablas QR.
-- Las comparaciones se realizan como valores binarios para que funcionen
-- aunque personal use utf8mb4_general_ci y las tablas QR usen utf8mb4_unicode_ci.

CREATE OR REPLACE VIEW vw_qr_employees_active AS
SELECT
  CAST(p.employee_number AS CHAR) AS employee_number,
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
  ON CAST(t.employee_number AS BINARY) = CAST(p.employee_number AS BINARY)
 AND t.is_active = 1
LEFT JOIN employee_photos ep
  ON CAST(ep.employee_number AS BINARY) = CAST(p.employee_number AS BINARY)
WHERE p.fecha_baja IS NULL;

CREATE OR REPLACE VIEW vw_qr_public_card AS
SELECT
  t.qr_token,
  CAST(p.employee_number AS CHAR) AS employee_number,
  p.full_name,
  p.nss,
  p.puesto,
  p.department_name,
  p.start_date,
  'ACTIVO' AS employee_status,
  CASE WHEN ep.id IS NULL THEN 0 ELSE 1 END AS has_photo
FROM employee_qr_tokens t
INNER JOIN personal p
  ON CAST(p.employee_number AS BINARY) = CAST(t.employee_number AS BINARY)
LEFT JOIN employee_photos ep
  ON CAST(ep.employee_number AS BINARY) = CAST(t.employee_number AS BINARY)
WHERE t.is_active = 1
  AND p.fecha_baja IS NULL;

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
    SELECT DISTINCT CAST(employee_number AS CHAR) AS employee_number
    FROM personal
    WHERE fecha_baja IS NULL
      AND employee_number IS NOT NULL
      AND TRIM(CAST(employee_number AS CHAR)) <> ''
  ) AS active_employees
  WHERE NOT EXISTS (
    SELECT 1
    FROM employee_qr_tokens t
    WHERE CAST(t.employee_number AS BINARY) = CAST(active_employees.employee_number AS BINARY)
      AND t.is_active = 1
  );

  SELECT ROW_COUNT() AS generated_count;
END$$
DELIMITER ;

DROP PROCEDURE IF EXISTS sp_deactivate_qr_for_inactive_employees;
DELIMITER $$
CREATE PROCEDURE sp_deactivate_qr_for_inactive_employees()
BEGIN
  UPDATE employee_qr_tokens t
  LEFT JOIN personal p
    ON CAST(p.employee_number AS BINARY) = CAST(t.employee_number AS BINARY)
  SET
    t.is_active = 0,
    t.revoked_at = NOW(),
    t.revoked_reason = CASE
      WHEN p.employee_number IS NULL THEN 'Empleado no encontrado en personal'
      ELSE 'Empleado dado de baja'
    END
  WHERE t.is_active = 1
    AND (p.employee_number IS NULL OR p.fecha_baja IS NOT NULL);

  SELECT ROW_COUNT() AS deactivated_count;
END$$
DELIMITER ;
