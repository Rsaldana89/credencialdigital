const employeeService = require('../services/employeeService');
const eventService = require('../services/eventService');
const eventExportService = require('../services/eventExportService');

function formatDate(value) {
  if (!value) return 'No disponible';
  const text = String(value).slice(0, 10);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : text;
}

function formatDateTime(value) {
  if (!value) return 'No registrado';
  const text = String(value).replace('T', ' ').slice(0, 19);
  const match = /^(\d{4})-(\d{2})-(\d{2})[ ](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(text);
  if (!match) return text;
  return `${match[3]}/${match[2]}/${match[1]} ${match[4]}:${match[5]}`;
}

function setFlash(req, type, message) {
  req.session.flash = { type, message };
}

function currentActor(req) {
  return String(req.session?.adminUser || 'admin').slice(0, 100);
}

function wantsJson(req) {
  return String(req.get('accept') || '').includes('application/json');
}

function cleanFilename(value, fallback = 'evento') {
  const text = String(value || fallback)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9._-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 90);
  return text || fallback;
}

function serializeAttendee(event, attendee) {
  if (!attendee) return null;
  const attended = Boolean(attendee.attended_at);
  const hasAward = Boolean(attendee.award_type);
  const fiesta = event.event_type === 'FIESTA_PREMIOS';
  const isOpen = event.status === 'OPEN';
  return {
    id: Number(attendee.id),
    employeeNumber: eventService.formatEmployeeNumber(attendee.employee_number),
    employeeNumberRaw: attendee.employee_number,
    fullName: attendee.full_name_snapshot || '',
    puesto: attendee.puesto_snapshot || '',
    department: attendee.department_snapshot || '',
    startDate: formatDate(attendee.start_date_snapshot),
    tenure: eventService.calculateTenure(attendee.start_date_snapshot, String(event.event_date || '').slice(0, 10)),
    attended,
    attendedAt: attendee.attended_at ? formatDateTime(attendee.attended_at) : null,
    attendanceMethod: attendee.attendance_method || null,
    awardType: attendee.award_type || null,
    awardDeliveredAt: attendee.award_delivered_at ? formatDateTime(attendee.award_delivered_at) : null,
    canCheckIn: isOpen && !attended,
    canAward: isOpen && fiesta && attended && !hasAward,
    canPrize: isOpen && fiesta && attended && !hasAward,
    canConsolation: isOpen && fiesta && attended && !hasAward
  };
}

function extractTokenFromQrValue(rawValue) {
  const raw = String(rawValue || '').trim();
  if (!raw) return null;

  const direct = employeeService.normalizeToken(raw);
  if (direct) return direct;

  try {
    const url = new URL(raw, 'https://credenciales.local');
    const match = /^\/e\/([^/?#]+)\/?$/.exec(url.pathname);
    if (!match) return null;
    let token = match[1];
    try {
      token = decodeURIComponent(token);
    } catch (_) {
      // Si no se puede decodificar, se valida el texto tal como llegó.
    }
    return employeeService.normalizeToken(token);
  } catch (_) {
    return null;
  }
}

async function index(req, res, next) {
  try {
    const events = await eventService.listEvents();
    return res.render('admin/events/index', {
      title: 'Asistencia a eventos',
      events,
      formatDateTime,
      pageStyles: '/css/events.css'
    });
  } catch (error) {
    return next(error);
  }
}

async function newForm(req, res, next) {
  try {
    const employees = await eventService.listActiveEmployees();
    return res.render('admin/events/new', {
      title: 'Nuevo evento',
      employees,
      formError: null,
      formValues: {},
      formatEmployeeNumber: eventService.formatEmployeeNumber,
      formatDate,
      pageStyles: '/css/events.css'
    });
  } catch (error) {
    return next(error);
  }
}

async function create(req, res, next) {
  try {
    const result = await eventService.createEvent({
      eventName: req.body.event_name,
      eventType: req.body.event_type,
      eventDate: req.body.event_date,
      description: req.body.description,
      inviteMode: req.body.invite_mode,
      selectedEmployeeNumbers: req.body.selected_employees,
      typedEmployeeNumbers: req.body.employee_numbers,
      createdBy: currentActor(req)
    });
    setFlash(req, 'success', `Evento creado con ${result.invitedCount} empleados invitados.`);
    return res.redirect(`/admin/eventos/${result.eventId}`);
  } catch (error) {
    if (error.status && error.status < 500) {
      try {
        const employees = await eventService.listActiveEmployees();
        return res.status(error.status).render('admin/events/new', {
          title: 'Nuevo evento',
          employees,
          formError: error.message,
          formValues: req.body || {},
          formatEmployeeNumber: eventService.formatEmployeeNumber,
          formatDate,
          pageStyles: '/css/events.css'
        });
      } catch (renderError) {
        return next(renderError);
      }
    }
    return next(error);
  }
}

async function show(req, res, next) {
  try {
    const event = await eventService.getEvent(req.params.eventId);
    if (!event) {
      return res.status(404).render('invalid', {
        title: 'Evento no encontrado',
        heading: 'Evento no encontrado',
        message: 'No existe el evento solicitado.'
      });
    }
    const attendees = await eventService.listEventAttendees(event.id);
    return res.render('admin/events/show', {
      title: event.event_name,
      event,
      attendees,
      formatDate,
      formatDateTime,
      formatEmployeeNumber: eventService.formatEmployeeNumber,
      calculateTenure: eventService.calculateTenure,
      pageStyles: '/css/events.css'
    });
  } catch (error) {
    return next(error);
  }
}

async function search(req, res, next) {
  try {
    const event = await eventService.requireEvent(req.params.eventId);
    const attendees = await eventService.searchEventAttendees(event.id, req.query.q);
    return res.json({
      ok: true,
      event: { id: Number(event.id), type: event.event_type, status: event.status },
      attendees: attendees.map((attendee) => serializeAttendee(event, attendee))
    });
  } catch (error) {
    return next(error);
  }
}

async function scan(req, res, next) {
  try {
    const event = await eventService.requireEvent(req.params.eventId);
    if (event.status !== 'OPEN') {
      return res.status(409).json({ ok: false, code: 'EVENT_CLOSED', message: 'El evento está cerrado.' });
    }

    const token = extractTokenFromQrValue(req.body.qr_value);
    if (!token) {
      await eventService.logScanFailure({
        eventId: event.id,
        actionType: 'SCAN_INVALID',
        actor: currentActor(req)
      });
      return res.status(422).json({
        ok: false,
        code: 'INVALID_QR',
        message: 'El código escaneado no corresponde a una credencial digital CHC válida.'
      });
    }

    const resolution = await employeeService.resolvePublicToken(token);
    if (resolution.status !== 'VALID') {
      await eventService.logScanFailure({
        eventId: event.id,
        employeeNumber: resolution.employee?.employee_number || resolution.employee?.token_employee_number || null,
        actionType: 'SCAN_INVALID',
        actor: currentActor(req)
      });
      return res.status(422).json({
        ok: false,
        code: resolution.status,
        message: 'La credencial no está vigente o no existe en Credenciales Digitales.'
      });
    }

    const result = await eventService.checkInByEmployeeNumber(
      event.id,
      resolution.employee.employee_number,
      currentActor(req),
      'QR'
    );

    if (!result.attendee) {
      return res.status(404).json({
        ok: false,
        code: 'NOT_INVITED',
        message: `QR válido. El empleado ${eventService.formatEmployeeNumber(resolution.employee.employee_number)} no está invitado a este evento.`
      });
    }

    return res.json({
      ok: true,
      code: result.status,
      message: result.newlyCheckedIn ? 'Asistencia registrada.' : 'Este empleado ya tenía asistencia registrada.',
      attendee: serializeAttendee(result.event, result.attendee)
    });
  } catch (error) {
    if (error.status && error.status < 500) {
      return res.status(error.status).json({ ok: false, code: error.code, message: error.message });
    }
    return next(error);
  }
}

async function checkIn(req, res, next) {
  try {
    const result = await eventService.checkInByAttendeeId(
      req.params.eventId,
      req.params.attendeeId,
      currentActor(req)
    );
    if (wantsJson(req)) {
      return res.json({
        ok: true,
        code: result.status,
        message: result.newlyCheckedIn ? 'Asistencia registrada.' : 'La asistencia ya estaba registrada.',
        attendee: serializeAttendee(result.event, result.attendee)
      });
    }
    setFlash(req, 'success', result.newlyCheckedIn ? 'Asistencia registrada.' : 'La asistencia ya estaba registrada.');
    return res.redirect(`/admin/eventos/${result.event.id}`);
  } catch (error) {
    if (wantsJson(req) && error.status && error.status < 500) {
      return res.status(error.status).json({ ok: false, code: error.code, message: error.message });
    }
    if (error.status && error.status < 500) {
      setFlash(req, 'danger', error.message);
      return res.redirect(`/admin/eventos/${encodeURIComponent(req.params.eventId)}`);
    }
    return next(error);
  }
}

async function award(req, res, next) {
  try {
    const result = await eventService.deliverAward(
      req.params.eventId,
      req.params.attendeeId,
      req.body.award_type,
      currentActor(req),
      req.body.source
    );
    const label = result.attendee.award_type === 'PREMIO' ? 'Premio' : 'Premio de consolación';
    if (wantsJson(req)) {
      return res.json({
        ok: true,
        code: 'AWARD_DELIVERED',
        message: `${label} registrado. La otra opción quedó deshabilitada.`,
        attendee: serializeAttendee(result.event, result.attendee)
      });
    }
    setFlash(req, 'success', `${label} registrado. La otra opción quedó deshabilitada.`);
    return res.redirect(`/admin/eventos/${result.event.id}`);
  } catch (error) {
    if (wantsJson(req) && error.status && error.status < 500) {
      return res.status(error.status).json({ ok: false, code: error.code, message: error.message });
    }
    if (error.status && error.status < 500) {
      setFlash(req, 'danger', error.message);
      return res.redirect(`/admin/eventos/${encodeURIComponent(req.params.eventId)}`);
    }
    return next(error);
  }
}

async function setStatus(req, res, next) {
  try {
    const event = await eventService.setEventStatus(
      req.params.eventId,
      req.body.status,
      currentActor(req)
    );
    setFlash(req, 'success', event.status === 'OPEN' ? 'Evento reabierto.' : 'Evento cerrado.');
    return res.redirect(`/admin/eventos/${event.id}`);
  } catch (error) {
    if (error.status && error.status < 500) {
      setFlash(req, 'danger', error.message);
      return res.redirect(`/admin/eventos/${encodeURIComponent(req.params.eventId)}`);
    }
    return next(error);
  }
}

async function exportXlsx(req, res, next) {
  try {
    const event = await eventService.requireEvent(req.params.eventId);
    const attendees = await eventService.listEventAttendees(event.id);
    const buffer = await eventExportService.buildXlsxBuffer(event, attendees);
    const filename = `EVENTO_${event.id}_${cleanFilename(event.event_name)}.xlsx`;
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store'
    });
    return res.send(buffer);
  } catch (error) {
    return next(error);
  }
}

async function exportPdf(req, res, next) {
  try {
    const event = await eventService.requireEvent(req.params.eventId);
    const attendees = await eventService.listEventAttendees(event.id);
    const buffer = await eventExportService.buildPdfBuffer(event, attendees);
    const filename = `EVENTO_${event.id}_${cleanFilename(event.event_name)}.pdf`;
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store'
    });
    return res.send(buffer);
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  index,
  newForm,
  create,
  show,
  search,
  scan,
  checkIn,
  award,
  setStatus,
  exportXlsx,
  exportPdf,
  extractTokenFromQrValue,
  serializeAttendee
};
