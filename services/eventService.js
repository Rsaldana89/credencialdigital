const { pool } = require('../config/db');
const employeeService = require('./employeeService');

const ACTIVE_DEPARTMENT_SQL = "UPPER(TRIM(COALESCE(p.department_name, ''))) <> 'BAJA'";
const EVENT_TYPES = new Set(['GENERAL', 'FIESTA_PREMIOS']);
const INVITE_MODES = new Set(['ALL_ACTIVE', 'SELECTED']);
const EVENT_STATUSES = new Set(['OPEN', 'CLOSED']);
const AWARD_TYPES = new Set(['PREMIO', 'CONSOLACION']);

function makeUserError(message, code, status = 400) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  return error;
}

function parsePositiveId(value, label = 'ID') {
  const id = Number.parseInt(String(value || ''), 10);
  if (!Number.isSafeInteger(id) || id <= 0) {
    throw makeUserError(`${label} no válido.`, 'INVALID_ID');
  }
  return id;
}

function normalizeEventType(value) {
  const type = String(value || '').trim().toUpperCase();
  if (!EVENT_TYPES.has(type)) {
    throw makeUserError('Selecciona un tipo de evento válido.', 'INVALID_EVENT_TYPE');
  }
  return type;
}

function normalizeInviteMode(value) {
  const mode = String(value || '').trim().toUpperCase() || 'ALL_ACTIVE';
  if (!INVITE_MODES.has(mode)) {
    throw makeUserError('Selecciona un modo de invitación válido.', 'INVALID_INVITE_MODE');
  }
  return mode;
}

function normalizeEventDate(value) {
  const text = String(value || '').trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(text);
  if (!match) {
    throw makeUserError('Indica una fecha y hora válidas para el evento.', 'INVALID_EVENT_DATE');
  }
  const [, year, month, day, hour, minute, second = '00'] = match;
  return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
}

function normalizeSelectedNumbers(values, typedText = '') {
  const rawValues = [];
  if (Array.isArray(values)) rawValues.push(...values);
  else if (values !== undefined && values !== null && String(values).trim()) rawValues.push(values);

  String(typedText || '')
    .split(/[\s,;]+/)
    .filter(Boolean)
    .forEach((value) => rawValues.push(value));

  const keys = new Set();
  rawValues.forEach((value) => {
    const key = employeeService.employeeNumberLookupKey(value);
    if (key) keys.add(key);
  });
  return keys;
}

function getEmployeeLookupKey(employee) {
  return employeeService.employeeNumberLookupKey(employee?.employee_number);
}

async function listActiveEmployees(connection = pool) {
  const [rows] = await connection.query(
    `SELECT
       p.employee_number,
       COALESCE(p.full_name, '') AS full_name,
       COALESCE(p.puesto, '') AS puesto,
       COALESCE(p.department_name, '') AS department_name,
       p.start_date
     FROM personal p
     WHERE ${ACTIVE_DEPARTMENT_SQL}
       AND p.employee_number IS NOT NULL
       AND CHAR_LENGTH(TRIM(p.employee_number)) > 0
     ORDER BY COALESCE(p.full_name, ''), p.employee_number`
  );
  return rows;
}

async function createEvent({
  eventName,
  eventType,
  eventDate,
  description,
  inviteMode,
  selectedEmployeeNumbers,
  typedEmployeeNumbers,
  createdBy
}) {
  const name = String(eventName || '').trim().slice(0, 160);
  if (!name) throw makeUserError('Escribe un nombre para el evento.', 'EVENT_NAME_REQUIRED');

  const type = normalizeEventType(eventType);
  const date = normalizeEventDate(eventDate);
  const mode = normalizeInviteMode(inviteMode);
  const note = String(description || '').trim().slice(0, 500) || null;
  const actor = String(createdBy || 'admin').trim().slice(0, 100) || 'admin';
  const selectedKeys = normalizeSelectedNumbers(selectedEmployeeNumbers, typedEmployeeNumbers);

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const activeEmployees = await listActiveEmployees(connection);
    let invitedEmployees = activeEmployees;

    if (mode === 'SELECTED') {
      if (!selectedKeys.size) {
        throw makeUserError(
          'Selecciona al menos un empleado o captura números de empleado.',
          'NO_SELECTED_EMPLOYEES'
        );
      }
      invitedEmployees = activeEmployees.filter((employee) => selectedKeys.has(getEmployeeLookupKey(employee)));
      if (!invitedEmployees.length) {
        throw makeUserError(
          'Los empleados seleccionados no existen o no están activos.',
          'SELECTED_EMPLOYEES_NOT_FOUND'
        );
      }
    }

    if (!invitedEmployees.length) {
      throw makeUserError('No hay empleados activos disponibles para este evento.', 'NO_ACTIVE_EMPLOYEES');
    }

    const [eventResult] = await connection.execute(
      `INSERT INTO chc_events
        (event_type, event_name, event_date, description, invite_mode, status, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'OPEN', ?, NOW(), NOW())`,
      [type, name, date, note, mode, actor]
    );
    const eventId = Number(eventResult.insertId);

    const batchSize = 200;
    for (let index = 0; index < invitedEmployees.length; index += batchSize) {
      const batch = invitedEmployees.slice(index, index + batchSize);
      const placeholders = batch.map(() => '(?, ?, ?, ?, ?, ?, NOW())').join(',');
      const params = [];
      batch.forEach((employee) => {
        params.push(
          eventId,
          String(employee.employee_number).trim(),
          String(employee.full_name || '').trim() || `Empleado ${employee.employee_number}`,
          String(employee.puesto || '').trim() || null,
          String(employee.department_name || '').trim() || null,
          employee.start_date ? String(employee.start_date).slice(0, 10) : null
        );
      });
      await connection.execute(
        `INSERT INTO chc_event_attendees
          (event_id, employee_number, full_name_snapshot, puesto_snapshot,
           department_snapshot, start_date_snapshot, invited_at)
         VALUES ${placeholders}`,
        params
      );
    }

    await connection.commit();
    return { eventId, invitedCount: invitedEmployees.length };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function listEvents() {
  const [rows] = await pool.query(
    `SELECT
       e.*,
       COUNT(a.id) AS invited_count,
       SUM(CASE WHEN a.attended_at IS NOT NULL THEN 1 ELSE 0 END) AS attended_count,
       SUM(CASE WHEN a.award_type = 'PREMIO' THEN 1 ELSE 0 END) AS prize_count,
       SUM(CASE WHEN a.award_type = 'CONSOLACION' THEN 1 ELSE 0 END) AS consolation_count
     FROM chc_events e
     LEFT JOIN chc_event_attendees a ON a.event_id = e.id
     GROUP BY e.id
     ORDER BY e.event_date DESC, e.id DESC`
  );
  return rows;
}

async function getEvent(eventId, connection = pool) {
  const id = parsePositiveId(eventId, 'Evento');
  const [rows] = await connection.execute(
    `SELECT
       e.*,
       (SELECT COUNT(*) FROM chc_event_attendees a WHERE a.event_id = e.id) AS invited_count,
       (SELECT COUNT(*) FROM chc_event_attendees a WHERE a.event_id = e.id AND a.attended_at IS NOT NULL) AS attended_count,
       (SELECT COUNT(*) FROM chc_event_attendees a WHERE a.event_id = e.id AND a.award_type = 'PREMIO') AS prize_count,
       (SELECT COUNT(*) FROM chc_event_attendees a WHERE a.event_id = e.id AND a.award_type = 'CONSOLACION') AS consolation_count
     FROM chc_events e
     WHERE e.id = ?
     LIMIT 1`,
    [id]
  );
  return rows[0] || null;
}

async function requireEvent(eventId, connection = pool) {
  const event = await getEvent(eventId, connection);
  if (!event) throw makeUserError('El evento no existe.', 'EVENT_NOT_FOUND', 404);
  return event;
}

async function listEventAttendees(eventId) {
  const id = parsePositiveId(eventId, 'Evento');
  const [rows] = await pool.execute(
    `SELECT *
     FROM chc_event_attendees
     WHERE event_id = ?
     ORDER BY full_name_snapshot, employee_number`,
    [id]
  );
  return rows;
}

async function searchEventAttendees(eventId, search = '') {
  const id = parsePositiveId(eventId, 'Evento');
  const q = String(search || '').trim().slice(0, 100);
  if (!q) return [];
  const like = `%${q}%`;
  const key = employeeService.employeeNumberLookupKey(q);
  const [rows] = await pool.execute(
    `SELECT *
     FROM chc_event_attendees
     WHERE event_id = ?
       AND (
         employee_number LIKE ?
         OR full_name_snapshot LIKE ?
         OR puesto_snapshot LIKE ?
       )
     ORDER BY
       CASE WHEN employee_number = ? THEN 0 ELSE 1 END,
       full_name_snapshot,
       employee_number
     LIMIT 40`,
    [id, like, like, like, key || q]
  );

  if (key && !rows.some((row) => employeeService.employeeNumberLookupKey(row.employee_number) === key)) {
    const attendees = await listEventAttendees(id);
    const normalizedMatch = attendees.find(
      (row) => employeeService.employeeNumberLookupKey(row.employee_number) === key
    );
    if (normalizedMatch) rows.unshift(normalizedMatch);
  }
  return rows.slice(0, 40);
}

async function getAttendeeById(eventId, attendeeId, connection = pool) {
  const eId = parsePositiveId(eventId, 'Evento');
  const aId = parsePositiveId(attendeeId, 'Asistente');
  const [rows] = await connection.execute(
    `SELECT * FROM chc_event_attendees WHERE id = ? AND event_id = ? LIMIT 1`,
    [aId, eId]
  );
  return rows[0] || null;
}

async function getAttendeeByEmployeeNumber(eventId, employeeNumber, connection = pool) {
  const eId = parsePositiveId(eventId, 'Evento');
  const normalized = employeeService.normalizeEmployeeNumber(employeeNumber);
  if (!normalized) return null;

  const [rows] = await connection.execute(
    `SELECT * FROM chc_event_attendees WHERE event_id = ? AND employee_number = ? LIMIT 1`,
    [eId, normalized]
  );
  if (rows[0]) return rows[0];

  const lookupKey = employeeService.employeeNumberLookupKey(normalized);
  if (!lookupKey) return null;
  const [allRows] = await connection.execute(
    `SELECT * FROM chc_event_attendees WHERE event_id = ?`,
    [eId]
  );
  return allRows.find(
    (row) => employeeService.employeeNumberLookupKey(row.employee_number) === lookupKey
  ) || null;
}

async function logAction(connection, {
  eventId,
  attendeeId = null,
  employeeNumber = null,
  actionType,
  actionSource,
  actor
}) {
  await connection.execute(
    `INSERT INTO chc_event_action_logs
      (event_id, attendee_id, employee_number, action_type, action_source, actor, created_at)
     VALUES (?, ?, ?, ?, ?, ?, NOW())`,
    [
      parsePositiveId(eventId, 'Evento'),
      attendeeId ? parsePositiveId(attendeeId, 'Asistente') : null,
      employeeNumber ? String(employeeNumber).slice(0, 50) : null,
      actionType,
      actionSource,
      String(actor || 'admin').slice(0, 100)
    ]
  );
}

async function logScanFailure({ eventId, employeeNumber = null, actionType, actor }) {
  const id = parsePositiveId(eventId, 'Evento');
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await requireEvent(id, connection);
    await logAction(connection, {
      eventId: id,
      employeeNumber,
      actionType,
      actionSource: 'SCAN',
      actor
    });
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function checkInByEmployeeNumber(eventId, employeeNumber, actor, method = 'QR') {
  const id = parsePositiveId(eventId, 'Evento');
  const source = method === 'MANUAL' ? 'MANUAL' : 'QR';
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const event = await requireEvent(id, connection);
    if (event.status !== 'OPEN') {
      throw makeUserError('El evento está cerrado.', 'EVENT_CLOSED', 409);
    }

    const attendee = await getAttendeeByEmployeeNumber(id, employeeNumber, connection);
    if (!attendee) {
      await logAction(connection, {
        eventId: id,
        employeeNumber,
        actionType: 'SCAN_NOT_INVITED',
        actionSource: source === 'QR' ? 'SCAN' : 'MANUAL',
        actor
      });
      await connection.commit();
      return { event, attendee: null, status: 'NOT_INVITED', newlyCheckedIn: false };
    }

    let newlyCheckedIn = false;
    if (!attendee.attended_at) {
      const [result] = await connection.execute(
        `UPDATE chc_event_attendees
         SET attended_at = NOW(), attended_by = ?, attendance_method = ?
         WHERE id = ? AND event_id = ? AND attended_at IS NULL`,
        [String(actor || 'admin').slice(0, 100), source, attendee.id, id]
      );
      newlyCheckedIn = result.affectedRows === 1;
    }

    await logAction(connection, {
      eventId: id,
      attendeeId: attendee.id,
      employeeNumber: attendee.employee_number,
      actionType: newlyCheckedIn ? 'CHECK_IN' : 'RE_SCAN',
      actionSource: source === 'QR' ? 'SCAN' : 'MANUAL',
      actor
    });

    const updated = await getAttendeeById(id, attendee.id, connection);
    await connection.commit();
    return {
      event,
      attendee: updated,
      status: newlyCheckedIn ? 'CHECKED_IN' : 'ALREADY_ATTENDED',
      newlyCheckedIn
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function checkInByAttendeeId(eventId, attendeeId, actor) {
  const id = parsePositiveId(eventId, 'Evento');
  const attendee = await getAttendeeById(id, attendeeId);
  if (!attendee) throw makeUserError('El empleado no forma parte de este evento.', 'ATTENDEE_NOT_FOUND', 404);
  return checkInByEmployeeNumber(id, attendee.employee_number, actor, 'MANUAL');
}

async function deliverAward(eventId, attendeeId, awardType, actor, source = 'LIST') {
  const id = parsePositiveId(eventId, 'Evento');
  const aId = parsePositiveId(attendeeId, 'Asistente');
  const award = String(awardType || '').trim().toUpperCase();
  if (!AWARD_TYPES.has(award)) {
    throw makeUserError('Tipo de premio no válido.', 'INVALID_AWARD_TYPE');
  }
  const awardSource = ['SCAN', 'SEARCH', 'LIST'].includes(source) ? source : 'LIST';

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const event = await requireEvent(id, connection);
    if (event.status !== 'OPEN') throw makeUserError('El evento está cerrado.', 'EVENT_CLOSED', 409);
    if (event.event_type !== 'FIESTA_PREMIOS') {
      throw makeUserError('Este evento no maneja premios.', 'AWARDS_NOT_ALLOWED', 409);
    }

    const attendee = await getAttendeeById(id, aId, connection);
    if (!attendee) throw makeUserError('El empleado no forma parte de este evento.', 'ATTENDEE_NOT_FOUND', 404);
    if (!attendee.attended_at) {
      throw makeUserError('Primero registra la asistencia del empleado.', 'ATTENDANCE_REQUIRED', 409);
    }
    if (attendee.award_type) {
      throw makeUserError(
        attendee.award_type === 'PREMIO'
          ? 'Este empleado ya recibió Premio.'
          : 'Este empleado ya recibió Premio de consolación.',
        'AWARD_ALREADY_DELIVERED',
        409
      );
    }

    const [result] = await connection.execute(
      `UPDATE chc_event_attendees
       SET award_type = ?, award_delivered_at = NOW(), award_delivered_by = ?, award_source = ?
       WHERE id = ? AND event_id = ? AND attended_at IS NOT NULL AND award_type IS NULL`,
      [award, String(actor || 'admin').slice(0, 100), awardSource, aId, id]
    );

    if (result.affectedRows !== 1) {
      throw makeUserError(
        'El premio ya fue registrado desde otra sesión. Actualiza la información.',
        'AWARD_CONFLICT',
        409
      );
    }

    await logAction(connection, {
      eventId: id,
      attendeeId: aId,
      employeeNumber: attendee.employee_number,
      actionType: award === 'PREMIO' ? 'AWARD_PREMIO' : 'AWARD_CONSOLACION',
      actionSource: awardSource,
      actor
    });

    const updated = await getAttendeeById(id, aId, connection);
    await connection.commit();
    return { event, attendee: updated };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function enableAwardsForEvent(eventId, actor) {
  const id = parsePositiveId(eventId, 'Evento');
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const event = await requireEvent(id, connection);
    if (event.status !== 'OPEN') {
      throw makeUserError('El evento está cerrado. Reábrelo antes de habilitar premios.', 'EVENT_CLOSED', 409);
    }

    if (event.event_type !== 'FIESTA_PREMIOS') {
      await connection.execute(
        `UPDATE chc_events
         SET event_type = 'FIESTA_PREMIOS', updated_at = NOW()
         WHERE id = ?`,
        [id]
      );
    }

    const updated = await requireEvent(id, connection);
    await connection.commit();
    return updated;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function setEventStatus(eventId, status, actor) {
  const id = parsePositiveId(eventId, 'Evento');
  const nextStatus = String(status || '').trim().toUpperCase();
  if (!EVENT_STATUSES.has(nextStatus)) {
    throw makeUserError('Estado de evento no válido.', 'INVALID_EVENT_STATUS');
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const event = await requireEvent(id, connection);
    if (event.status === nextStatus) {
      await connection.commit();
      return event;
    }

    if (nextStatus === 'CLOSED') {
      await connection.execute(
        `UPDATE chc_events
         SET status = 'CLOSED', closed_at = NOW(), closed_by = ?, updated_at = NOW()
         WHERE id = ?`,
        [String(actor || 'admin').slice(0, 100), id]
      );
    } else {
      await connection.execute(
        `UPDATE chc_events
         SET status = 'OPEN', closed_at = NULL, closed_by = NULL, updated_at = NOW()
         WHERE id = ?`,
        [id]
      );
    }

    await logAction(connection, {
      eventId: id,
      actionType: nextStatus === 'CLOSED' ? 'EVENT_CLOSED' : 'EVENT_REOPENED',
      actionSource: 'SYSTEM',
      actor
    });
    const updated = await requireEvent(id, connection);
    await connection.commit();
    return updated;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

function formatEmployeeNumber(value) {
  return employeeService.formatEmployeeNumber(value);
}

function calculateTenure(startDate, referenceDate = new Date()) {
  if (!startDate) return 'No disponible';
  const startText = String(startDate).slice(0, 10);
  const startMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(startText);
  if (!startMatch) return 'No disponible';

  const refText = referenceDate instanceof Date
    ? `${referenceDate.getFullYear()}-${String(referenceDate.getMonth() + 1).padStart(2, '0')}-${String(referenceDate.getDate()).padStart(2, '0')}`
    : String(referenceDate || '').slice(0, 10);
  const refMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(refText);
  if (!refMatch) return 'No disponible';

  const start = { y: Number(startMatch[1]), m: Number(startMatch[2]), d: Number(startMatch[3]) };
  const ref = { y: Number(refMatch[1]), m: Number(refMatch[2]), d: Number(refMatch[3]) };
  let months = (ref.y - start.y) * 12 + (ref.m - start.m);
  if (ref.d < start.d) months -= 1;
  if (months < 0) return '0 meses';
  const years = Math.floor(months / 12);
  const remainingMonths = months % 12;
  if (!years) return `${remainingMonths} ${remainingMonths === 1 ? 'mes' : 'meses'}`;
  if (!remainingMonths) return `${years} ${years === 1 ? 'año' : 'años'}`;
  return `${years} ${years === 1 ? 'año' : 'años'}, ${remainingMonths} ${remainingMonths === 1 ? 'mes' : 'meses'}`;
}

module.exports = {
  EVENT_TYPES,
  listActiveEmployees,
  createEvent,
  listEvents,
  getEvent,
  requireEvent,
  listEventAttendees,
  searchEventAttendees,
  getAttendeeById,
  checkInByEmployeeNumber,
  checkInByAttendeeId,
  deliverAward,
  enableAwardsForEvent,
  setEventStatus,
  logScanFailure,
  formatEmployeeNumber,
  calculateTenure,
  makeUserError
};
