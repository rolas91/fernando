const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { load } = require('./pagination-harness.cjs');

const { getShiftPeriodLabel } = load('lib/shiftPeriod.ts');

// The dispatch message used to print the literal "day shift" for every shift.
// A 10:00 PM shift must say night shift.
assert.equal(getShiftPeriodLabel('22:00'), 'night shift');
assert.equal(getShiftPeriodLabel('10:00 PM'), 'night shift');
assert.equal(getShiftPeriodLabel('19:00'), 'night shift');

// Same 17:00-05:00 cutoff used by payroll and the shift views.
assert.equal(getShiftPeriodLabel('17:00'), 'night shift');
assert.equal(getShiftPeriodLabel('16:59'), 'day shift');
assert.equal(getShiftPeriodLabel('04:59'), 'night shift');
assert.equal(getShiftPeriodLabel('05:00'), 'day shift');
assert.equal(getShiftPeriodLabel('07:00'), 'day shift');

// Missing or unreadable times keep the previous "day shift" wording.
assert.equal(getShiftPeriodLabel(''), 'day shift');
assert.equal(getShiftPeriodLabel(undefined), 'day shift');
assert.equal(getShiftPeriodLabel('not a time'), 'day shift');
assert.equal(getShiftPeriodLabel('25:00'), 'day shift');

// The shift template name wins when it already says day or night.
assert.equal(getShiftPeriodLabel('07:00', 'Night Shift'), 'night shift');
assert.equal(getShiftPeriodLabel('22:00', 'Day Shift'), 'day shift');
assert.equal(
  getShiftPeriodLabel('06:00', 'Harrison St Night Shift'),
  'night shift',
);

// Names without a day/night word fall back to the start time. "Monday" must
// not be read as "day".
assert.equal(getShiftPeriodLabel('22:00', 'Monday Crew'), 'night shift');
assert.equal(getShiftPeriodLabel('22:00', 'Weekend Shift'), 'night shift');
assert.equal(getShiftPeriodLabel('08:00', 'Weekend Shift'), 'day shift');
assert.equal(getShiftPeriodLabel('08:00', 'Daytime Crew'), 'day shift');

// The dispatch template must use the shared label instead of a fixed word.
const source = fs.readFileSync(
  path.join(__dirname, '../src/components/scheduler/NotifyWorkerModal.tsx'),
  'utf8',
);
assert.ok(
  source.includes('getShiftPeriodLabel('),
  'the dispatch message must derive day/night from the shift',
);
assert.ok(
  !source.includes('day shift as ${r.roleName}'),
  'the dispatch message must not hardcode "day shift"',
);

console.log(
  'Shift period label: dispatch messages follow the shift day/night instead of a fixed word.',
);
