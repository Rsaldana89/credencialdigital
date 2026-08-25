const TENURE_GROUPS = Object.freeze([
  Object.freeze({
    code: 'LT5',
    label: 'Menos de 5 años',
    shortLabel: '< 5 años',
    badgeLabel: '< 5 AÑOS',
    minYears: 0,
    maxYears: 4,
    cssClass: 'lt5'
  }),
  Object.freeze({
    code: 'Y5_9',
    label: '5 a 9 años',
    shortLabel: '5–9 años',
    badgeLabel: '5–9 AÑOS',
    minYears: 5,
    maxYears: 9,
    cssClass: '5-9'
  }),
  Object.freeze({
    code: 'Y10_14',
    label: '10 a 14 años',
    shortLabel: '10–14 años',
    badgeLabel: '10–14 AÑOS',
    minYears: 10,
    maxYears: 14,
    cssClass: '10-14'
  }),
  Object.freeze({
    code: 'Y15_19',
    label: '15 a 19 años',
    shortLabel: '15–19 años',
    badgeLabel: '15–19 AÑOS',
    minYears: 15,
    maxYears: 19,
    cssClass: '15-19'
  }),
  Object.freeze({
    code: 'Y20_24',
    label: '20 a 24 años',
    shortLabel: '20–24 años',
    badgeLabel: '20–24 AÑOS',
    minYears: 20,
    maxYears: 24,
    cssClass: '20-24'
  }),
  Object.freeze({
    code: 'Y25_29',
    label: '25 a 29 años',
    shortLabel: '25–29 años',
    badgeLabel: '25–29 AÑOS',
    minYears: 25,
    maxYears: 29,
    cssClass: '25-29'
  }),
  Object.freeze({
    code: 'Y30_PLUS',
    label: '30 años o más',
    shortLabel: '30+ años',
    badgeLabel: '30+ AÑOS',
    minYears: 30,
    maxYears: null,
    cssClass: '30-plus'
  }),
  Object.freeze({
    code: 'UNKNOWN',
    label: 'Sin fecha de ingreso',
    shortLabel: 'Sin fecha',
    badgeLabel: 'SIN FECHA',
    minYears: null,
    maxYears: null,
    cssClass: 'unknown'
  })
]);

const TENURE_GROUP_BY_CODE = new Map(TENURE_GROUPS.map((group) => [group.code, group]));
const ALL_TENURE_GROUP_CODES = Object.freeze(TENURE_GROUPS.map((group) => group.code));

function parseDateParts(value) {
  if (!value) return null;
  const text = value instanceof Date
    ? `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`
    : String(value).trim().slice(0, 10);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!match) return null;

  const parts = {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
    text
  };
  const validationDate = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  if (
    validationDate.getUTCFullYear() !== parts.year ||
    validationDate.getUTCMonth() + 1 !== parts.month ||
    validationDate.getUTCDate() !== parts.day
  ) {
    return null;
  }
  return parts;
}

function compareDateParts(left, right) {
  if (left.year !== right.year) return left.year - right.year;
  if (left.month !== right.month) return left.month - right.month;
  return left.day - right.day;
}

function completedMonthsBetween(startDate, referenceDate) {
  const start = parseDateParts(startDate);
  const reference = parseDateParts(referenceDate);
  if (!start || !reference || compareDateParts(reference, start) < 0) return null;

  let months = (reference.year - start.year) * 12 + (reference.month - start.month);
  if (reference.day < start.day) months -= 1;
  return Math.max(0, months);
}

function groupForCompletedYears(years) {
  if (!Number.isInteger(years) || years < 0) return TENURE_GROUP_BY_CODE.get('UNKNOWN');
  return TENURE_GROUPS.find((group) => (
    group.code !== 'UNKNOWN' &&
    years >= group.minYears &&
    (group.maxYears === null || years <= group.maxYears)
  )) || TENURE_GROUP_BY_CODE.get('UNKNOWN');
}

function formatTenureFromMonths(totalMonths) {
  if (!Number.isInteger(totalMonths) || totalMonths < 0) return 'No disponible';
  const years = Math.floor(totalMonths / 12);
  const months = totalMonths % 12;
  if (!years) return `${months} ${months === 1 ? 'mes' : 'meses'}`;
  if (!months) return `${years} ${years === 1 ? 'año' : 'años'}`;
  return `${years} ${years === 1 ? 'año' : 'años'}, ${months} ${months === 1 ? 'mes' : 'meses'}`;
}

function calculateTenureDetails(startDate, referenceDate) {
  const totalMonths = completedMonthsBetween(startDate, referenceDate);
  if (totalMonths === null) {
    const group = TENURE_GROUP_BY_CODE.get('UNKNOWN');
    return {
      totalMonths: null,
      years: null,
      months: null,
      label: 'No disponible',
      groupCode: group.code,
      groupLabel: group.label,
      groupShortLabel: group.shortLabel,
      groupBadgeLabel: group.badgeLabel,
      groupCssClass: group.cssClass
    };
  }

  const years = Math.floor(totalMonths / 12);
  const months = totalMonths % 12;
  const group = groupForCompletedYears(years);
  return {
    totalMonths,
    years,
    months,
    label: formatTenureFromMonths(totalMonths),
    groupCode: group.code,
    groupLabel: group.label,
    groupShortLabel: group.shortLabel,
    groupBadgeLabel: group.badgeLabel,
    groupCssClass: group.cssClass
  };
}

function normalizeRawGroupValues(rawValue) {
  if (Array.isArray(rawValue)) {
    return rawValue.flatMap((value) => String(value ?? '').split(','));
  }
  if (rawValue === undefined || rawValue === null) return null;
  return String(rawValue).split(',');
}

function normalizeTenureGroupSelection(rawValue, { defaultAll = true } = {}) {
  const rawValues = normalizeRawGroupValues(rawValue);
  if (rawValues === null) return defaultAll ? [...ALL_TENURE_GROUP_CODES] : [];

  const selected = [];
  const seen = new Set();
  rawValues.forEach((value) => {
    const code = String(value || '').trim().toUpperCase();
    if (!TENURE_GROUP_BY_CODE.has(code) || seen.has(code)) return;
    seen.add(code);
    selected.push(code);
  });
  return selected;
}

function attendeeMatchesTenureGroups(attendee, referenceDate, selectedGroups) {
  const groups = Array.isArray(selectedGroups)
    ? selectedGroups
    : normalizeTenureGroupSelection(selectedGroups);
  if (!groups.length) return false;
  const details = calculateTenureDetails(attendee?.start_date_snapshot, referenceDate);
  return groups.includes(details.groupCode);
}

function describeTenureGroupSelection(selectedGroups, { includeUnknown = true } = {}) {
  const normalized = normalizeTenureGroupSelection(selectedGroups, { defaultAll: false });
  const available = includeUnknown
    ? TENURE_GROUPS
    : TENURE_GROUPS.filter((group) => group.code !== 'UNKNOWN');
  const availableCodes = available.map((group) => group.code);
  const selectedAvailable = normalized.filter((code) => availableCodes.includes(code));

  if (!selectedAvailable.length) return 'Ningún rango';
  if (selectedAvailable.length === availableCodes.length) return 'Todos los rangos';
  return selectedAvailable
    .map((code) => TENURE_GROUP_BY_CODE.get(code)?.shortLabel)
    .filter(Boolean)
    .join(', ');
}

function getTenureGroup(code) {
  return TENURE_GROUP_BY_CODE.get(String(code || '').trim().toUpperCase()) || null;
}

module.exports = {
  TENURE_GROUPS,
  ALL_TENURE_GROUP_CODES,
  parseDateParts,
  completedMonthsBetween,
  calculateTenureDetails,
  normalizeTenureGroupSelection,
  attendeeMatchesTenureGroups,
  describeTenureGroupSelection,
  getTenureGroup,
  formatTenureFromMonths
};
