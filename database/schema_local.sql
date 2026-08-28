USE sistema_gestion;

-- Credenciales Digitales QR CHC v1.0.6
-- Ejecutar dentro de la base de datos que contiene la tabla personal.
-- Este script NO modifica la tabla personal.
-- Regla de vigencia CHC: el empleado es activo cuando department_name no es "Baja".

CREATE TABLE IF NOT EXISTS employee_qr_tokens (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  employee_number VARCHAR(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL,
  qr_token CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  revoked_at DATETIME NULL,
  revoked_reason VARCHAR(255) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_employee_qr_tokens_token (qr_token),
  KEY idx_employee_qr_tokens_employee_active (employee_number, is_active),
  KEY idx_employee_qr_tokens_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS employee_photos (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  employee_number VARCHAR(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL,
  photo_blob MEDIUMBLOB NOT NULL,
  mime_type VARCHAR(100) NOT NULL DEFAULT 'image/jpeg',
  original_filename VARCHAR(255) NULL,
  width SMALLINT UNSIGNED NOT NULL DEFAULT 300,
  height SMALLINT UNSIGNED NOT NULL DEFAULT 400,
  uploaded_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  uploaded_by VARCHAR(100) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_employee_photos_employee (employee_number),
  KEY idx_employee_photos_uploaded_at (uploaded_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS employee_qr_access_logs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  qr_token VARCHAR(128) NOT NULL,
  employee_number VARCHAR(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NULL,
  access_result VARCHAR(50) CHARACTER SET ascii COLLATE ascii_general_ci NOT NULL,
  ip_address VARCHAR(45) NULL,
  user_agent VARCHAR(500) NULL,
  accessed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_qr_access_logs_token_date (qr_token, accessed_at),
  KEY idx_qr_access_logs_employee_date (employee_number, accessed_at),
  KEY idx_qr_access_logs_result_date (access_result, accessed_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

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

-- La generacion inicial se realiza desde el boton "Generar QR faltantes" del panel.

SELECT
  TABLE_NAME,
  COLUMN_NAME,
  CHARACTER_SET_NAME,
  COLLATION_NAME
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND COLUMN_NAME = 'employee_number'
  AND TABLE_NAME IN (
    'personal',
    'employee_qr_tokens',
    'employee_photos',
    'employee_qr_access_logs'
  )
ORDER BY TABLE_NAME;

-- v1.0.51: usuarios administrativos de la aplicacion
CREATE TABLE IF NOT EXISTS chc_admin_users (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  username VARCHAR(80) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL,
  display_name VARCHAR(120) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NULL,
  password_hash VARCHAR(255) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  role ENUM('admin', 'capital_humano') NOT NULL DEFAULT 'capital_humano',
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  last_login_at DATETIME NULL,
  created_by VARCHAR(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_chc_admin_users_username (username),
  KEY idx_chc_admin_users_role_active (role, is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

