"use strict";

const DEFAULT_TIME_ZONE = process.env.EVENT_TIME_ZONE || "America/Mexico_City";

function toDateOnly(value) {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
  }
  const text = String(value).trim();
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    const result = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
    return Number.isNaN(result.getTime()) ? null : result;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate()));
}

function getMexicoToday(timeZone = DEFAULT_TIME_ZONE) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return toDateOnly(`${values.year}-${values.month}-${values.day}`);
}

function getEffectiveStartDate(employee = {}) {
  return toDateOnly(
    employee.effective_start_date_snapshot ||
    employee.effective_start_date ||
    employee.fecha_reingreso ||
    employee.reentry_date ||
    employee.start_date
  );
}

function getEmploymentDateType(employee = {}) {
  if (employee.employment_date_type_snapshot) return employee.employment_date_type_snapshot;
  return toDateOnly(employee.fecha_reingreso || employee.reentry_date) ? "Reingreso" : "Ingreso";
}

function calculateSeniority(startValue, referenceValue) {
  const start = toDateOnly(startValue);
  const reference = toDateOnly(referenceValue) || getMexicoToday();
  if (!start || !reference || reference < start) return { years: 0, months: 0, days: 0, totalMonths: 0 };
  let years = reference.getUTCFullYear() - start.getUTCFullYear();
  let months = reference.getUTCMonth() - start.getUTCMonth();
  let days = reference.getUTCDate() - start.getUTCDate();
  if (days < 0) {
    months -= 1;
    const priorMonthLastDay = new Date(Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth(), 0)).getUTCDate();
    days += priorMonthLastDay;
  }
  if (months < 0) { years -= 1; months += 12; }
  if (years < 0) return { years: 0, months: 0, days: 0, totalMonths: 0 };
  return { years, months, days, totalMonths: years * 12 + months };
}

function getSeniorityGroup(yearsValue) {
  const years = Number(yearsValue) || 0;
  if (years < 5) return "lt5";
  if (years < 10) return "5_9";
  if (years < 15) return "10_14";
  if (years < 20) return "15_19";
  if (years < 25) return "20_24";
  if (years < 30) return "25_29";
  return "30_plus";
}

function getSeniorityGroupLabel(group) {
  return ({ lt5: "Menos de 5 años", "5_9": "5 a 9 años", "10_14": "10 a 14 años", "15_19": "15 a 19 años", "20_24": "20 a 24 años", "25_29": "25 a 29 años", "30_plus": "30 años o más" })[group] || "Sin clasificar";
}

function formatSeniority(seniority) {
  const years = Number(seniority?.years) || 0;
  const months = Number(seniority?.months) || 0;
  const y = `${years} ${years === 1 ? "año" : "años"}`;
  const m = `${months} ${months === 1 ? "mes" : "meses"}`;
  return years ? `${y}, ${m}` : m;
}

function enrichEmployment(employee, referenceDate) {
  const effectiveStartDate = getEffectiveStartDate(employee);
  const seniority = calculateSeniority(effectiveStartDate, referenceDate || getMexicoToday());
  const group = employee.seniority_group_snapshot || getSeniorityGroup(seniority.years);
  return {
    ...employee,
    effective_start_date: effectiveStartDate,
    employment_date_type: getEmploymentDateType(employee),
    seniority,
    seniority_text: employee.seniority_text_snapshot || formatSeniority(seniority),
    seniority_group: group,
    seniority_group_label: getSeniorityGroupLabel(group)
  };
}

module.exports = { DEFAULT_TIME_ZONE, toDateOnly, getMexicoToday, getEffectiveStartDate, getEmploymentDateType, calculateSeniority, getSeniorityGroup, getSeniorityGroupLabel, formatSeniority, enrichEmployment };
