"use strict";
const assert = require("assert");
const { getEffectiveStartDate, calculateSeniority, getSeniorityGroup } = require("../utils/employment-date-v1054.js");
function iso(d) { return d && d.toISOString().slice(0, 10); }
assert.strictEqual(iso(getEffectiveStartDate({ start_date: "2007-03-05", fecha_reingreso: null })), "2007-03-05");
assert.strictEqual(iso(getEffectiveStartDate({ start_date: "2007-03-05", fecha_reingreso: "2024-07-16" })), "2024-07-16");
let s = calculateSeniority("2021-10-10", "2026-10-09");
assert.strictEqual(s.years, 4); assert.strictEqual(getSeniorityGroup(s.years), "lt5");
s = calculateSeniority("2021-10-10", "2026-10-10");
assert.strictEqual(s.years, 5); assert.strictEqual(getSeniorityGroup(s.years), "5_9");
s = calculateSeniority("2016-10-10", "2026-10-10");
assert.strictEqual(s.years, 10); assert.strictEqual(getSeniorityGroup(s.years), "10_14");
console.log("v1.0.54 employment-date tests passed");
