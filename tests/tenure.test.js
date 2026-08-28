const assert = require('node:assert/strict');
const tenureService = require('../services/tenureService');

function expectTenure(startDate, eventDate, expected) {
  const actual = tenureService.calculateTenureDetails(startDate, eventDate);
  assert.equal(actual.groupCode, expected.groupCode, `${startDate} al ${eventDate}: grupo`);
  assert.equal(actual.years, expected.years, `${startDate} al ${eventDate}: años`);
  assert.equal(actual.months, expected.months, `${startDate} al ${eventDate}: meses`);
}

// El día anterior al aniversario todavía conserva el rango anterior.
expectTenure('2021-10-10', '2026-10-09', {
  groupCode: 'LT5',
  years: 4,
  months: 11
});

// El mismo día del evento en que cumple 5 años ya pertenece al rango 5–9.
expectTenure('2021-10-10', '2026-10-10', {
  groupCode: 'Y5_9',
  years: 5,
  months: 0
});

// El mismo día del evento en que cumple 10 años ya pertenece al rango 10–14.
expectTenure('2016-10-10', '2026-10-10', {
  groupCode: 'Y10_14',
  years: 10,
  months: 0
});

// Un día antes de cumplir 10 todavía permanece en 5–9.
expectTenure('2016-10-11', '2026-10-10', {
  groupCode: 'Y5_9',
  years: 9,
  months: 11
});

expectTenure('2011-10-10', '2026-10-10', {
  groupCode: 'Y15_19',
  years: 15,
  months: 0
});
expectTenure('2006-10-10', '2026-10-10', {
  groupCode: 'Y20_24',
  years: 20,
  months: 0
});
expectTenure('2001-10-10', '2026-10-10', {
  groupCode: 'Y25_29',
  years: 25,
  months: 0
});
expectTenure('1996-10-10', '2026-10-10', {
  groupCode: 'Y30_PLUS',
  years: 30,
  months: 0
});

const unknown = tenureService.calculateTenureDetails(null, '2026-10-10');
assert.equal(unknown.groupCode, 'UNKNOWN');
assert.equal(unknown.label, 'No disponible');

assert.deepEqual(
  tenureService.normalizeTenureGroupSelection(undefined),
  tenureService.ALL_TENURE_GROUP_CODES
);
assert.deepEqual(
  tenureService.normalizeTenureGroupSelection('', { defaultAll: false }),
  []
);
assert.deepEqual(
  tenureService.normalizeTenureGroupSelection('Y10_14,Y10_14,INVALID,Y15_19'),
  ['Y10_14', 'Y15_19']
);

assert.equal(
  tenureService.attendeeMatchesTenureGroups(
    { start_date_snapshot: '2016-10-10' },
    '2026-10-10',
    ['Y10_14']
  ),
  true
);
assert.equal(
  tenureService.attendeeMatchesTenureGroups(
    { start_date_snapshot: '2016-10-10' },
    '2026-10-09',
    ['Y10_14']
  ),
  false
);

console.log('Pruebas de antigüedad v1.0.49: OK');
