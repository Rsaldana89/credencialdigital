-- Credenciales Digitales QR CHC v1.0.39
-- Modulo aislado de Asistencia a Eventos.
-- IMPORTANTE:
--   * NO modifica las tablas personal, employee_qr_tokens, employee_photos ni employee_qr_access_logs.
--   * Solo crea tablas nuevas con prefijo chc_event_.
--   * Las credenciales QR productivas existentes se usan unicamente en modo lectura.

CREATE TABLE IF NOT EXISTS chc_events (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  event_type ENUM('GENERAL', 'FIESTA_PREMIOS') NOT NULL,
  event_name VARCHAR(160) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL,
  event_date DATETIME NOT NULL,
  description VARCHAR(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NULL,
  invite_mode ENUM('ALL_ACTIVE', 'SELECTED') NOT NULL DEFAULT 'ALL_ACTIVE',
  status ENUM('OPEN', 'CLOSED') NOT NULL DEFAULT 'OPEN',
  created_by VARCHAR(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  closed_at DATETIME NULL,
  closed_by VARCHAR(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NULL,
  PRIMARY KEY (id),
  KEY idx_chc_events_date (event_date),
  KEY idx_chc_events_status_date (status, event_date),
  KEY idx_chc_events_type_date (event_type, event_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS chc_event_attendees (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  event_id BIGINT UNSIGNED NOT NULL,
  employee_number VARCHAR(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL,
  full_name_snapshot VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL,
  puesto_snapshot VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NULL,
  department_snapshot VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NULL,
  start_date_snapshot DATE NULL,
  invited_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  attended_at DATETIME NULL,
  attended_by VARCHAR(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NULL,
  attendance_method ENUM('QR', 'MANUAL') NULL,
  award_type ENUM('PREMIO', 'CONSOLACION') NULL,
  award_delivered_at DATETIME NULL,
  award_delivered_by VARCHAR(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NULL,
  award_source ENUM('SCAN', 'SEARCH', 'LIST') NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_chc_event_attendee_employee (event_id, employee_number),
  KEY idx_chc_event_attendees_event_attended (event_id, attended_at),
  KEY idx_chc_event_attendees_event_award (event_id, award_type),
  KEY idx_chc_event_attendees_employee (employee_number),
  KEY idx_chc_event_attendees_name (full_name_snapshot(100)),
  CONSTRAINT fk_chc_event_attendees_event
    FOREIGN KEY (event_id) REFERENCES chc_events(id)
    ON UPDATE RESTRICT ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS chc_event_action_logs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  event_id BIGINT UNSIGNED NOT NULL,
  attendee_id BIGINT UNSIGNED NULL,
  employee_number VARCHAR(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NULL,
  action_type ENUM(
    'CHECK_IN',
    'RE_SCAN',
    'AWARD_PREMIO',
    'AWARD_CONSOLACION',
    'SCAN_NOT_INVITED',
    'SCAN_INVALID',
    'EVENT_CLOSED',
    'EVENT_REOPENED'
  ) NOT NULL,
  action_source ENUM('QR', 'MANUAL', 'SCAN', 'SEARCH', 'LIST', 'SYSTEM') NOT NULL DEFAULT 'SYSTEM',
  actor VARCHAR(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_chc_event_logs_event_date (event_id, created_at),
  KEY idx_chc_event_logs_attendee_date (attendee_id, created_at),
  KEY idx_chc_event_logs_employee_date (employee_number, created_at),
  CONSTRAINT fk_chc_event_logs_event
    FOREIGN KEY (event_id) REFERENCES chc_events(id)
    ON UPDATE RESTRICT ON DELETE CASCADE,
  CONSTRAINT fk_chc_event_logs_attendee
    FOREIGN KEY (attendee_id) REFERENCES chc_event_attendees(id)
    ON UPDATE RESTRICT ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Verificacion: este SELECT solo muestra las tablas nuevas del modulo.
SELECT TABLE_NAME
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME IN ('chc_events', 'chc_event_attendees', 'chc_event_action_logs')
ORDER BY TABLE_NAME;
