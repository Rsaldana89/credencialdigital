-- Credenciales Digitales QR CHC v1.0.51
-- Usuarios administrativos almacenados en MySQL.
-- NO modifica la tabla personal ni las tablas de credenciales/eventos existentes.
-- La aplicacion tambien ejecuta este CREATE TABLE IF NOT EXISTS al iniciar.

CREATE TABLE IF NOT EXISTS chc_admin_users (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  username VARCHAR(80) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL,
  display_name VARCHAR(120) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NULL,
  password_hash VARCHAR(255) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  role ENUM('admin', 'capital_humano', 'event_operator') NOT NULL DEFAULT 'capital_humano',
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  last_login_at DATETIME NULL,
  created_by VARCHAR(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_chc_admin_users_username (username),
  KEY idx_chc_admin_users_role_active (role, is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

SELECT id, username, display_name, role, is_active, last_login_at
FROM chc_admin_users
ORDER BY id;
