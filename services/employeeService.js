const crypto = require('crypto');
const { pool } = require('../config/db');

const ACTIVE_DEPARTMENT_SQL = "UPPER(TRIM(COALESCE(p.department_name, ''))) <> 'BAJA'";
let accessResultMetadataPromise = null;
let accessLogWarningShown = false;

function normalizeEmployeeNumber(value) {
  const employeeNumber = String(value || '').trim();
  if (!/^[A-Za-z0-9._-]{1,50}$/.test(employeeNumber)) {
    return null;
  }
  return employeeNumber;
}

function normalizeToken(value) {
  // Conserva mayusculas/minusculas porque qr_token puede usar una collation binaria.
  // Se admiten tokens hexadecimales actuales y formatos URL-safe heredados.
  const token = String(value || '').trim();
  if (token.length < 24 || token.length > 128) {
    return null;
  }
  if (!/^[A-Za-z0-9._~-]+$/.test(token)) {
    return null;
  }
  return token;
}

function normalizeDepartment(value) {
  return String(value || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleUpperCase('es-MX');
}

function isEmployeeActive(employee) {
  // En la base de incidencias de CHC, la baja vigente se identifica porque
  // department_name es exactamente "Baja". fecha_baja puede contener historial.
  return normalizeDepartment(employee?.department_name) !== 'BAJA';
}

function parseEnumValues(columnType) {
  const values = [];
  const regex = /'((?:''|[^'])*)'/g;
  let match;
  while ((match = regex.exec(String(columnType || ''))) !== null) {
    values.push(match[1].replace(/''/g, "'"));
  }
  return values;
}

async function getAccessResultMetadata() {
  if (!accessResultMetadataPromise) {
    accessResultMetadataPromise = pool.execute(
      `SELECT DATA_TYPE, COLUMN_TYPE, CHARACTER_MAXIMUM_LENGTH
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'employee_qr_access_logs'
         AND COLUMN_NAME = 'access_result'
       LIMIT 1`
    ).then(([rows]) => rows[0] || null).catch(() => null);
  }
  return accessResultMetadataPromise;
}

function findAllowedValue(allowedValues, candidates) {
  for (const candidate of candidates) {
    const match = allowedValues.find(
      (value) => value.toLocaleUpperCase('es-MX') === candidate.toLocaleUpperCase('es-MX')
    );
    if (match !== undefined) return match;
  }
  return null;
}

function getCompatibleAccessResult(result, metadata) {
  const desired = String(result || 'UNKNOWN');
  const maxLength = Number(metadata?.CHARACTER_MAXIMUM_LENGTH || 50);

  if (String(metadata?.DATA_TYPE || '').toLowerCase() !== 'enum') {
    return desired.slice(0, Number.isFinite(maxLength) && maxLength > 0 ? maxLength : 50);
  }

  const allowedValues = parseEnumValues(metadata.COLUMN_TYPE);
  if (!allowedValues.length) return desired.slice(0, 50);

  const exact = findAllowedValue(allowedValues, [desired]);
  if (exact !== null) return exact;

  let candidates;
  switch (desired) {
    case 'VALID':
      candidates = ['VALID', 'SUCCESS', 'OK', 'VIGENTE', 'ACTIVO', 'ALLOWED'];
      break;
    case 'TOKEN_NOT_FOUND':
    case 'EMPLOYEE_NOT_FOUND':
      candidates = [desired, 'NOT_FOUND', 'NO_ENCONTRADO', 'INVALID', 'ERROR'];
      break;
    case 'TOKEN_INACTIVE':
    case 'EMPLOYEE_INACTIVE':
      candidates = [desired, 'INACTIVE', 'INACTIVO', 'NO_VIGENTE', 'INVALID', 'ERROR'];
      break;
    case 'INVALID_TOKEN_FORMAT':
      candidates = [desired, 'INVALID', 'FORMATO_INVALIDO', 'ERROR'];
      break;
    default:
      candidates = [desired, 'UNKNOWN', 'ERROR', 'INVALID'];
      break;
  }

  return findAllowedValue(allowedValues, candidates) ?? allowedValues[0];
}

async function resolvePublicToken(rawToken) {
  const token = normalizeToken(rawToken);
  if (!token) {
    return {
      status: 'INVALID_TOKEN_FORMAT',
      token: String(rawToken || '').slice(0, 128),
      employee: null
    };
  }

  const baseQuery = `SELECT
       t.qr_token,
       t.is_active,
       t.employee_number AS token_employee_number,
       p.employee_number AS employee_number,
       p.full_name,
       p.nss,
       p.puesto,
       p.department_name,
       p.start_date,
       p.fecha_baja,
       p.fecha_reingreso,
       EXISTS(
         SELECT 1 FROM employee_photos ep
         WHERE ep.employee_number = t.employee_number
       ) AS has_photo
     FROM employee_qr_tokens t
     LEFT JOIN personal p
       ON p.employee_number = t.employee_number`;

  const [rows] = await pool.execute(
    `${baseQuery}
     WHERE t.qr_token = ?
     LIMIT 1`,
    [token]
  );

  let resolvedRows = rows;

  // Compatibilidad con tokens hexadecimales heredados guardados con mayusculas.
  if (!resolvedRows.length && /^[A-Fa-f0-9]{32,128}$/.test(token)) {
    const [legacyRows] = await pool.execute(
      `${baseQuery}
       WHERE BINARY LOWER(t.qr_token) = BINARY LOWER(?)
       LIMIT 1`,
      [token]
    );
    resolvedRows = legacyRows;
  }

  if (!resolvedRows.length) {
    return { status: 'TOKEN_NOT_FOUND', token, employee: null };
  }

  const row = resolvedRows[0];
  if (!Number(row.is_active)) {
    return { status: 'TOKEN_INACTIVE', token, employee: row };
  }

  const employeeNumber = String(row.employee_number ?? '').trim();
  if (!employeeNumber) {
    return { status: 'EMPLOYEE_NOT_FOUND', token, employee: row };
  }

  if (!isEmployeeActive(row)) {
    return { status: 'EMPLOYEE_INACTIVE', token, employee: row };
  }

  return { status: 'VALID', token, employee: row };
}

async function logQrAccess({ token, employeeNumber, result, ipAddress, userAgent }) {
  try {
    const metadata = await getAccessResultMetadata();
    const compatibleResult = getCompatibleAccessResult(result, metadata);

    await pool.execute(
      `INSERT INTO employee_qr_access_logs
        (qr_token, employee_number, access_result, ip_address, user_agent, accessed_at)
       VALUES (?, ?, ?, ?, ?, NOW())`,
      [
        String(token || '').slice(0, 128),
        employeeNumber ? String(employeeNumber).slice(0, 50) : null,
        compatibleResult,
        String(ipAddress || '').slice(0, 45) || null,
        String(userAgent || '').slice(0, 500) || null
      ]
    );
  } catch (error) {
    // La bitacora nunca debe impedir mostrar una credencial valida.
    // Evita llenar la consola con el mismo aviso en cada consulta.
    if (!accessLogWarningShown) {
      accessLogWarningShown = true;
      console.error(
        'No fue posible registrar accesos QR. Ejecuta database/update_v1.0.6_active_department.sql:',
        error.message
      );
    }
  }
}

async function getPhotoByEmployeeNumber(rawEmployeeNumber) {
  const employeeNumber = normalizeEmployeeNumber(rawEmployeeNumber);
  if (!employeeNumber) return null;

  const [rows] = await pool.execute(
    `SELECT photo_blob, mime_type, width, height
     FROM employee_photos
     WHERE employee_number = ?
     LIMIT 1`,
    [employeeNumber]
  );
  return rows[0] || null;
}

async function listActiveEmployees(search = '') {
  const q = String(search || '').trim().slice(0, 100);
  const params = [];
  let whereSearch = '';

  if (q) {
    whereSearch = `
      AND (
        p.employee_number LIKE ?
        OR COALESCE(p.full_name, '') LIKE ?
        OR COALESCE(p.puesto, '') LIKE ?
        OR COALESCE(p.department_name, '') LIKE ?
      )`;
    const searchValue = `%${q}%`;
    params.push(searchValue, searchValue, searchValue, searchValue);
  }

  const [rows] = await pool.execute(
    `SELECT
       p.employee_number AS employee_number,
       p.full_name,
       p.puesto,
       p.department_name,
       p.start_date,
       EXISTS(
         SELECT 1 FROM employee_qr_tokens t
         WHERE t.employee_number = p.employee_number
           AND t.is_active = 1
       ) AS has_qr,
       EXISTS(
         SELECT 1 FROM employee_photos ep
         WHERE ep.employee_number = p.employee_number
       ) AS has_photo
     FROM personal p
     WHERE ${ACTIVE_DEPARTMENT_SQL}
       AND p.employee_number IS NOT NULL
       AND CHAR_LENGTH(TRIM(p.employee_number)) > 0
       ${whereSearch}
     ORDER BY COALESCE(p.full_name, ''), p.employee_number
     LIMIT 1000`,
    params
  );

  return rows;
}

async function listActiveEmployeesWithQr() {
  const [rows] = await pool.query(
    `SELECT DISTINCT
       p.employee_number AS employee_number,
       t.id AS qr_id,
       t.qr_token
     FROM personal p
     INNER JOIN employee_qr_tokens t
       ON t.employee_number = p.employee_number
      AND t.is_active = 1
      AND t.id = (
        SELECT t2.id
        FROM employee_qr_tokens t2
        WHERE t2.employee_number = p.employee_number
          AND t2.is_active = 1
        ORDER BY t2.created_at DESC, t2.id DESC
        LIMIT 1
      )
     WHERE ${ACTIVE_DEPARTMENT_SQL}
       AND p.employee_number IS NOT NULL
       AND CHAR_LENGTH(TRIM(p.employee_number)) > 0
     ORDER BY p.employee_number`
  );

  return rows;
}

async function getEmployeeByNumber(rawEmployeeNumber) {
  const employeeNumber = normalizeEmployeeNumber(rawEmployeeNumber);
  if (!employeeNumber) return null;

  const [rows] = await pool.execute(
    `SELECT
       p.employee_number AS employee_number,
       p.full_name,
       p.nss,
       p.puesto,
       p.department_name,
       p.start_date,
       p.fecha_baja,
       p.fecha_reingreso,
       EXISTS(
         SELECT 1 FROM employee_photos ep
         WHERE ep.employee_number = p.employee_number
       ) AS has_photo
     FROM personal p
     WHERE p.employee_number = ?
     LIMIT 1`,
    [employeeNumber]
  );

  return rows[0] || null;
}

async function getActiveQrByEmployee(rawEmployeeNumber) {
  const employeeNumber = normalizeEmployeeNumber(rawEmployeeNumber);
  if (!employeeNumber) return null;

  const [rows] = await pool.execute(
    `SELECT id, employee_number, qr_token, is_active, created_at
     FROM employee_qr_tokens
     WHERE employee_number = ? AND is_active = 1
     ORDER BY created_at DESC, id DESC
     LIMIT 1`,
    [employeeNumber]
  );

  return rows[0] || null;
}

async function generateQrForEmployee(rawEmployeeNumber) {
  const employeeNumber = normalizeEmployeeNumber(rawEmployeeNumber);
  if (!employeeNumber) {
    const error = new Error('Número de empleado no válido.');
    error.code = 'INVALID_EMPLOYEE_NUMBER';
    throw error;
  }

  const employee = await getEmployeeByNumber(employeeNumber);
  if (!employee) {
    const error = new Error('El empleado no existe.');
    error.code = 'EMPLOYEE_NOT_FOUND';
    throw error;
  }
  if (!isEmployeeActive(employee)) {
    const error = new Error('No se puede generar un QR para un empleado ubicado en el departamento Baja.');
    error.code = 'EMPLOYEE_INACTIVE';
    throw error;
  }

  const existing = await getActiveQrByEmployee(employeeNumber);
  if (existing) return { token: existing.qr_token, created: false };

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const token = crypto.randomBytes(32).toString('hex');
    try {
      await pool.execute(
        `INSERT INTO employee_qr_tokens
          (employee_number, qr_token, is_active, created_at)
         VALUES (?, ?, 1, NOW())`,
        [employeeNumber, token]
      );
      return { token, created: true };
    } catch (error) {
      if (error.code !== 'ER_DUP_ENTRY') throw error;
    }
  }

  throw new Error('No fue posible generar un token único.');
}

async function generateMissingTokens() {
  const [resultSets] = await pool.query('CALL sp_generate_missing_employee_qr_tokens()');
  const firstResult = Array.isArray(resultSets) ? resultSets[0] : null;
  return Number(firstResult?.[0]?.generated_count || 0);
}

async function deactivateQrForInactiveEmployees() {
  const [resultSets] = await pool.query('CALL sp_deactivate_qr_for_inactive_employees()');
  const firstResult = Array.isArray(resultSets) ? resultSets[0] : null;
  return Number(firstResult?.[0]?.deactivated_count || 0);
}

async function getDashboardStats() {
  const [rows] = await pool.query(`
    SELECT
      (
        SELECT COUNT(*)
        FROM personal p
        WHERE ${ACTIVE_DEPARTMENT_SQL}
      ) AS active_employees,
      (SELECT COUNT(DISTINCT employee_number) FROM employee_qr_tokens WHERE is_active = 1) AS employees_with_qr,
      (SELECT COUNT(*) FROM employee_photos) AS employees_with_photo,
      (
        SELECT COUNT(*)
        FROM employee_qr_tokens t
        LEFT JOIN personal p ON p.employee_number = t.employee_number
        WHERE t.is_active = 1
          AND (
            p.employee_number IS NULL
            OR UPPER(TRIM(COALESCE(p.department_name, ''))) = 'BAJA'
          )
      ) AS qr_pending_deactivation
  `);
  return rows[0];
}

async function listEmployeesForPhotoImport() {
  const [rows] = await pool.query(
    `SELECT
       p.employee_number AS employee_number,
       p.full_name,
       p.department_name,
       EXISTS(
         SELECT 1
         FROM employee_photos ep
         WHERE ep.employee_number = p.employee_number
       ) AS has_photo
     FROM personal p
     WHERE p.employee_number IS NOT NULL
       AND CHAR_LENGTH(TRIM(p.employee_number)) > 0
     ORDER BY p.employee_number`
  );

  return rows;
}

module.exports = {
  normalizeEmployeeNumber,
  normalizeToken,
  normalizeDepartment,
  isEmployeeActive,
  resolvePublicToken,
  logQrAccess,
  getPhotoByEmployeeNumber,
  listActiveEmployees,
  listActiveEmployeesWithQr,
  listEmployeesForPhotoImport,
  getEmployeeByNumber,
  getActiveQrByEmployee,
  generateQrForEmployee,
  generateMissingTokens,
  deactivateQrForInactiveEmployees,
  getDashboardStats
};
