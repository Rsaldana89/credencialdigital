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

function employeeNumberLookupKey(value) {
  const employeeNumber = normalizeEmployeeNumber(value);
  if (!employeeNumber) return null;

  // Para numeros puramente numericos, 04886 y 4886 representan al mismo empleado.
  // Los identificadores alfanumericos se conservan exactamente como estan.
  if (/^\d+$/.test(employeeNumber)) {
    return employeeNumber.replace(/^0+(?=\d)/, '');
  }

  return employeeNumber;
}

function formatEmployeeNumber(value, minimumDigits = 5) {
  const employeeNumber = normalizeEmployeeNumber(value);
  if (!employeeNumber) return 'No disponible';

  if (/^\d+$/.test(employeeNumber) && employeeNumber.length < minimumDigits) {
    return employeeNumber.padStart(minimumDigits, '0');
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
       p.start_date AS original_start_date, p.fecha_reingreso AS fecha_reingreso, COALESCE(p.fecha_reingreso, p.start_date) AS start_date, COALESCE(p.fecha_reingreso, p.start_date) AS effective_start_date, CASE WHEN p.fecha_reingreso IS NOT NULL THEN 'Reingreso' ELSE 'Ingreso' END AS employment_date_type,
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
    `SELECT p.start_date AS original_start_date, p.fecha_reingreso AS fecha_reingreso, COALESCE(p.fecha_reingreso, p.start_date) AS start_date, COALESCE(p.fecha_reingreso, p.start_date) AS effective_start_date, CASE WHEN p.fecha_reingreso IS NOT NULL THEN 'Reingreso' ELSE 'Ingreso' END AS employment_date_type,  DISTINCT
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

const QR_GENERATION_LOCK = 'chc_credenciales_qr_generation';

async function acquireQrGenerationLock(connection, timeoutSeconds = 5) {
  const [rows] = await connection.query('SELECT GET_LOCK(?, ?) AS acquired', [QR_GENERATION_LOCK, timeoutSeconds]);
  return Number(rows?.[0]?.acquired) === 1;
}

async function releaseQrGenerationLock(connection) {
  try {
    await connection.query('SELECT RELEASE_LOCK(?)', [QR_GENERATION_LOCK]);
  } catch (error) {
    console.error('No fue posible liberar el bloqueo de generación QR:', error.message);
  }
}

async function getLatestQrByEmployee(connection, employeeNumber) {
  const [rows] = await connection.execute(
    `SELECT id, employee_number, qr_token, is_active, created_at, revoked_at, revoked_reason
     FROM employee_qr_tokens
     WHERE employee_number = ?
     ORDER BY created_at DESC, id DESC
     LIMIT 1`,
    [employeeNumber]
  );
  return rows[0] || null;
}

async function ensureQrForActiveEmployee(connection, employeeNumber) {
  const [activeRows] = await connection.execute(
    `SELECT id, employee_number, qr_token, is_active, created_at
     FROM employee_qr_tokens
     WHERE employee_number = ? AND is_active = 1
     ORDER BY created_at DESC, id DESC
     LIMIT 1`,
    [employeeNumber]
  );

  if (activeRows[0]) {
    return { token: activeRows[0].qr_token, created: false, reactivated: false };
  }

  // Si un empleado vuelve a estar activo, conserva su mismo QR histórico.
  const latest = await getLatestQrByEmployee(connection, employeeNumber);
  if (latest) {
    const [updateResult] = await connection.execute(
      `UPDATE employee_qr_tokens
       SET is_active = 1, revoked_at = NULL, revoked_reason = NULL
       WHERE id = ? AND is_active = 0`,
      [latest.id]
    );

    if (Number(updateResult.affectedRows) > 0) {
      return { token: latest.qr_token, created: false, reactivated: true };
    }

    const refreshed = await getLatestQrByEmployee(connection, employeeNumber);
    if (refreshed?.is_active) {
      return { token: refreshed.qr_token, created: false, reactivated: false };
    }
  }

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const token = crypto.randomBytes(32).toString('hex');
    try {
      await connection.execute(
        `INSERT INTO employee_qr_tokens
          (employee_number, qr_token, is_active, created_at)
         VALUES (?, ?, 1, NOW())`,
        [employeeNumber, token]
      );
      return { token, created: true, reactivated: false };
    } catch (error) {
      if (error.code !== 'ER_DUP_ENTRY') throw error;
    }
  }

  throw new Error('No fue posible generar un token único.');
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

  const connection = await pool.getConnection();
  let lockAcquired = false;
  try {
    lockAcquired = await acquireQrGenerationLock(connection);
    if (!lockAcquired) {
      throw new Error('La generación de QR está ocupada. Intenta nuevamente en unos segundos.');
    }
    return await ensureQrForActiveEmployee(connection, employeeNumber);
  } finally {
    if (lockAcquired) await releaseQrGenerationLock(connection);
    connection.release();
  }
}

async function generateMissingTokens() {
  const connection = await pool.getConnection();
  let lockAcquired = false;

  try {
    // Serializa la revisión para que dos administradores no creen QR duplicados.
    lockAcquired = await acquireQrGenerationLock(connection);
    if (!lockAcquired) {
      return { generatedCount: 0, reactivatedCount: 0, busy: true };
    }

    await connection.beginTransaction();

    // Primero reactiva el QR histórico más reciente cuando el empleado volvió a estar activo.
    const [reactivated] = await connection.query(
      `UPDATE employee_qr_tokens t
       INNER JOIN (
         SELECT employee_number, MAX(id) AS latest_id
         FROM employee_qr_tokens
         GROUP BY employee_number
       ) latest
         ON latest.latest_id = t.id
       INNER JOIN personal p
         ON p.employee_number = t.employee_number
       LEFT JOIN employee_qr_tokens active_qr
         ON active_qr.employee_number = t.employee_number
        AND active_qr.is_active = 1
       SET
         t.is_active = 1,
         t.revoked_at = NULL,
         t.revoked_reason = NULL
       WHERE t.is_active = 0
         AND active_qr.id IS NULL
         AND ${ACTIVE_DEPARTMENT_SQL}`
    );

    // Después crea QR únicamente para empleados activos que nunca han tenido token.
    const [generated] = await connection.query(
      `INSERT INTO employee_qr_tokens
        (employee_number, qr_token, is_active, created_at)
       SELECT p.start_date AS original_start_date, p.fecha_reingreso AS fecha_reingreso, COALESCE(p.fecha_reingreso, p.start_date) AS start_date, COALESCE(p.fecha_reingreso, p.start_date) AS effective_start_date, CASE WHEN p.fecha_reingreso IS NOT NULL THEN 'Reingreso' ELSE 'Ingreso' END AS employment_date_type, 
         active_employees.employee_number,
         LOWER(HEX(RANDOM_BYTES(32))),
         1,
         NOW()
       FROM (
         SELECT DISTINCT p.employee_number
         FROM personal p
         WHERE ${ACTIVE_DEPARTMENT_SQL}
           AND p.employee_number IS NOT NULL
           AND CHAR_LENGTH(TRIM(p.employee_number)) > 0
       ) active_employees
       WHERE NOT EXISTS (
         SELECT 1
         FROM employee_qr_tokens existing_qr
         WHERE existing_qr.employee_number = active_employees.employee_number
       )`
    );

    await connection.commit();

    return {
      generatedCount: Number(generated.affectedRows || 0),
      reactivatedCount: Number(reactivated.affectedRows || 0),
      busy: false
    };
  } catch (error) {
    try {
      await connection.rollback();
    } catch (rollbackError) {
      console.error('No fue posible revertir la generación automática de QR:', rollbackError.message);
    }
    throw error;
  } finally {
    if (lockAcquired) await releaseQrGenerationLock(connection);
    connection.release();
  }
}

async function deactivateQrForInactiveEmployees() {
  const [resultSets] = await pool.query('CALL sp_deactivate_qr_for_inactive_employees()');
  const firstResult = Array.isArray(resultSets) ? resultSets[0] : null;
  return Number(firstResult?.[0]?.deactivated_count || 0);
}

async function getDashboardStats() {
  const [rows] = await pool.query(`
    SELECT p.start_date AS original_start_date, p.fecha_reingreso AS fecha_reingreso, COALESCE(p.fecha_reingreso, p.start_date) AS start_date, COALESCE(p.fecha_reingreso, p.start_date) AS effective_start_date, CASE WHEN p.fecha_reingreso IS NOT NULL THEN 'Reingreso' ELSE 'Ingreso' END AS employment_date_type, 
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
    `SELECT p.start_date AS original_start_date, p.fecha_reingreso AS fecha_reingreso, COALESCE(p.fecha_reingreso, p.start_date) AS start_date, COALESCE(p.fecha_reingreso, p.start_date) AS effective_start_date, CASE WHEN p.fecha_reingreso IS NOT NULL THEN 'Reingreso' ELSE 'Ingreso' END AS employment_date_type, 
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
  employeeNumberLookupKey,
  formatEmployeeNumber,
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
