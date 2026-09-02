const DEFAULT_TIME_ZONE = 'America/Mexico_City';

function getEventTimeZone() {
  const configured = String(process.env.EVENT_TIME_ZONE || DEFAULT_TIME_ZONE).trim();
  try {
    // Valida el identificador IANA sin depender de tablas de zona horaria de MySQL.
    new Intl.DateTimeFormat('es-MX', { timeZone: configured }).format(new Date());
    return configured;
  } catch (_) {
    return DEFAULT_TIME_ZONE;
  }
}


function getCurrentDateInEventZone(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: getEventTimeZone(),
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function mysqlUtcDateTimeToDate(value) {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;

  const text = String(value).trim().replace('T', ' ').slice(0, 19);
  const match = /^(\d{4})-(\d{2})-(\d{2})[ ](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(text);
  if (!match) return null;

  const [, year, month, day, hour, minute, second = '00'] = match;
  const date = new Date(Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second)
  ));
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatUtcDateTimeInEventZone(value, emptyValue = 'No registrado') {
  if (!value) return emptyValue;
  const date = mysqlUtcDateTimeToDate(value);
  if (!date) return String(value).replace('T', ' ').slice(0, 19);

  const parts = new Intl.DateTimeFormat('es-MX', {
    timeZone: getEventTimeZone(),
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(date);

  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.day}/${values.month}/${values.year} ${values.hour}:${values.minute}`;
}

module.exports = {
  DEFAULT_TIME_ZONE,
  getEventTimeZone,
  getCurrentDateInEventZone,
  mysqlUtcDateTimeToDate,
  formatUtcDateTimeInEventZone
};
