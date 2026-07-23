-- Credenciales Digitales QR CHC - actualización v1.0.8
-- Muestra el NSS de la tabla personal en las vistas del módulo QR.
-- No modifica la tabla personal ni elimina QR, fotografías o bitácoras.

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

SELECT 'Actualización v1.0.8 aplicada: NSS agregado a las vistas QR.' AS result;
