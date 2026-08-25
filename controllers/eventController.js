const employeeService = require('../services/employeeService');
const eventService = require('../services/eventService');
const eventExportService = require('../services/eventExportService');
const { formatUtcDateTimeInEventZone } = require('../utils/timeZone');

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

function tenureGroupsFromRequest(req, { source = 'body', defaultAll = true } = {}) {
  const container = source === 'query' ? (req.query || {}) : (req.body || {});
  const rawValue = source === 'query' ? container.antiguedad : container.tenure_groups;
  return eventService.normalizeTenureGroupSelection(rawValue, { defaultAll });
}

function exportFilterFromRequest(req) {
  const filtered = String(req.query?.scope || '').toLowerCase() === 'filtered';
  if (!filtered) return { filtered: false, groups: null, label: 'Lista completa' };
  const groups = tenureGroupsFromRequest(req, { source: 'query', defaultAll: false });
  return {
    filtered: true,
    groups,
    label: eventService.describeTenureGroupSelection(groups)
  };
}

function serializeAttendee(event, attendee) {
  if (!attendee) return null;
  const attended = Boolean(attendee.attended_at);
  const hasAward = Boolean(attendee.award_type);
  const fiesta = event.event_type === 'FIESTA_PREMIOS';
  const isOpen = event.status === 'OPEN';
  const tenure = eventService.getTenureDetails(
    attendee.start_date_snapshot,
    String(event.event_date || '').slice(0, 10)
  );
  return {
    id: Number(attendee.id),
    employeeNumber: eventService.formatEmployeeNumber(attendee.employee_number),
    employeeNumberRaw: attendee.employee_number,
    fullName: attendee.full_name_snapshot || '',
    puesto: attendee.puesto_snapshot || '',
    department: attendee.department_snapshot || '',
    startDate: formatDate(attendee.start_date_snapshot),
    tenure: tenure.label,
    tenureYears: tenure.years,
    tenureMonths: tenure.months,
    tenureGroup: tenure.groupCode,
    tenureGroupLabel: tenure.groupLabel,
    tenureGroupShortLabel: tenure.groupShortLabel,
    tenureGroupBadgeLabel: tenure.groupBadgeLabel,
    tenureGroupCssClass: tenure.groupCssClass,
    attended,
    attendedAt: attendee.attended_at ? formatUtcDateTimeInEventZone(attendee.attended_at) : null,
    attendanceMethod: attendee.attendance_method || null,
    awardType: attendee.award_type || null,
    awardDeliveredAt: attendee.award_delivered_at ? formatUtcDateTimeInEventZone(attendee.award_delivered_at) : null,
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
      pageStyles: '/css/events.css?v=1.0.48'
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
      pageStyles: '/css/events.css?v=1.0.48'
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
          pageStyles: '/css/events.css?v=1.0.48'
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
    const latestLogId = await eventService.getLatestEventLogId(event.id);
    const attendees = await eventService.listEventAttendees(event.id);
    const referenceDate = String(event.event_date || '').slice(0, 10);
    const groupCounts = new Map(eventService.TENURE_GROUPS.map((group) => [group.code, 0]));
    attendees.forEach((attendee) => {
      const details = eventService.getTenureDetails(attendee.start_date_snapshot, referenceDate);
      groupCounts.set(details.groupCode, Number(groupCounts.get(details.groupCode) || 0) + 1);
    });
    const tenureGroups = eventService.TENURE_GROUPS
      .filter((group) => group.code !== 'UNKNOWN' || Number(groupCounts.get('UNKNOWN') || 0) > 0)
      .map((group) => ({ ...group, count: Number(groupCounts.get(group.code) || 0) }));

    return res.render('admin/events/show', {
      title: event.event_name,
      event,
      attendees,
      tenureGroups,
      latestLogId,
      formatDate,
      formatDateTime,
      formatRecordedDateTime: formatUtcDateTimeInEventZone,
      formatEmployeeNumber: eventService.formatEmployeeNumber,
      calculateTenure: eventService.calculateTenure,
      getTenureDetails: eventService.getTenureDetails,
      pageStyles: '/css/events.css?v=1.0.48'
    });
  } catch (error) {
    return next(error);
  }
}

async function search(req, res, next) {
  try {
    const event = await eventService.requireEvent(req.params.eventId);
    const tenureGroups = tenureGroupsFromRequest(req, { source: 'query', defaultAll: true });
    const attendees = await eventService.searchEventAttendees(event.id, req.query.q, tenureGroups, event);
    return res.json({
      ok: true,
      event: { id: Number(event.id), type: event.event_type, status: event.status },
      attendees: attendees.map((attendee) => serializeAttendee(event, attendee))
    });
  } catch (error) {
    return next(error);
  }
}

async function liveState(req, res, next) {
  try {
    const result = await eventService.getEventLiveChanges(req.params.eventId, req.query.desde);
    return res.json({
      ok: true,
      latestLogId: result.latestLogId,
      hasMore: result.hasMore,
      event: {
        id: Number(result.event.id),
        type: result.event.event_type,
        status: result.event.status,
        invitedCount: Number(result.event.invited_count || 0),
        attendedCount: Number(result.event.attended_count || 0),
        prizeCount: Number(result.event.prize_count || 0),
        consolationCount: Number(result.event.consolation_count || 0)
      },
      attendees: result.attendees.map((attendee) => serializeAttendee(result.event, attendee))
    });
  } catch (error) {
    if (error.status && error.status < 500) {
      return res.status(error.status).json({ ok: false, code: error.code, message: error.message });
    }
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

    const tenureGroups = tenureGroupsFromRequest(req, { source: 'body', defaultAll: true });
    const result = await eventService.checkInByEmployeeNumber(
      event.id,
      resolution.employee.employee_number,
      currentActor(req),
      'QR',
      tenureGroups
    );

    if (!result.attendee) {
      if (result.outsideTenureFilter) {
        return res.status(404).json({
          ok: false,
          code: 'OUTSIDE_TENURE_FILTER',
          message: 'No se encontró a este empleado en la lista filtrada de antigüedad.'
        });
      }
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
    const tenureGroups = tenureGroupsFromRequest(req, { source: 'body', defaultAll: true });
    const result = await eventService.checkInByAttendeeId(
      req.params.eventId,
      req.params.attendeeId,
      currentActor(req),
      tenureGroups
    );
    if (!result.attendee && result.outsideTenureFilter) {
      if (wantsJson(req)) {
        return res.status(404).json({
          ok: false,
          code: 'OUTSIDE_TENURE_FILTER',
          message: 'El empleado ya no se encuentra en el filtro de antigüedad seleccionado.'
        });
      }
      setFlash(req, 'danger', 'El empleado ya no se encuentra en el filtro de antigüedad seleccionado.');
      return res.redirect(`/admin/eventos/${result.event.id}`);
    }
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
      req.body.source,
      tenureGroupsFromRequest(req, { source: 'body', defaultAll: true })
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
      return res.status(error.status).json({
        ok: false,
        code: error.code,
        message: error.message,
        attendee: error.attendee && error.event ? serializeAttendee(error.event, error.attendee) : undefined
      });
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
    const filter = exportFilterFromRequest(req);
    const snapshot = await eventService.getEventSnapshot(req.params.eventId, filter.groups);
    const { event, attendees } = snapshot;
    const buffer = await eventExportService.buildXlsxBuffer(event, attendees, {
      filtered: filter.filtered,
      filterLabel: filter.label
    });
    const suffix = filter.filtered ? '_FILTRADO' : '';
    const filename = `EVENTO_${event.id}_${cleanFilename(event.event_name)}${suffix}.xlsx`;
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
    const filter = exportFilterFromRequest(req);
    const snapshot = await eventService.getEventSnapshot(req.params.eventId, filter.groups);
    const { event, attendees } = snapshot;
    const buffer = await eventExportService.buildPdfBuffer(event, attendees, {
      filtered: filter.filtered,
      filterLabel: filter.label
    });
    const suffix = filter.filtered ? '_FILTRADO' : '';
    const filename = `EVENTO_${event.id}_${cleanFilename(event.event_name)}${suffix}.pdf`;
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
  liveState,
  scan,
  checkIn,
  award,
  setStatus,
  exportXlsx,
  exportPdf,
  extractTokenFromQrValue,
  serializeAttendee
};
