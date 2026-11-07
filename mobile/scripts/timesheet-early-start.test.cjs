const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

// Exercise the screen's pure functions without loading the native UI runtime.
const source = fs.readFileSync(path.join(__dirname, '../app/work-orders/form.tsx'), 'utf8');
const ast = ts.createSourceFile('form.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const names = [
  'asTimesheetRows', 'mergeTimesheetRows', 'applySelectedShiftSchedule',
  'timeToMinutes', 'timesheetTimeline', 'startIsBeforeScheduled',
  'timesheetDurationIsPlausible', 'timesheetTimeError', 'calculateTimesheetHours',
  'noLunchCreditTargetForDate', 'timesheetWeekday', 'roundHours',
];
const functions = ast.statements.filter((node) => ts.isFunctionDeclaration(node) && names.includes(node.name?.text));
assert.equal(functions.length, names.length);
const code = ts.transpileModule(functions.map((node) => node.getText(ast)).join('\n'), {
  compilerOptions: { target: ts.ScriptTarget.ES2020 },
}).outputText;
const context = vm.createContext({});
vm.runInContext(code, context);
const settings = { overtimeRules: {
  allowEarlyStart: true, yesLunchDeductionEnabled: true,
  yesLunchDeductionMinimumHours: 7, yesLunchDeductionHours: 0.5,
} };
const row = {
  workerId: 'worker-1', startTime: '02:00 PM', endTime: '08:00 AM',
  scheduledStartTime: '16:00', scheduledEndTime: '08:00',
  shiftDate: '2026-10-15', lunchTaken: true,
};

test('mobile permits early starts only when enabled and recalculates hours', () => {
  assert.match(context.timesheetTimeError(row), /cannot be earlier/);
  assert.equal(context.timesheetTimeError(row, settings), '');
  const hours = context.calculateTimesheetHours(row, settings);
  assert.deepEqual(JSON.parse(JSON.stringify(hours)), { st: 8, ot: 4, dt: 5.5, total: 17.5 });
  assert.match(context.timesheetTimeError({ ...row, startTime: 'invalid' }, settings), /format/);
});

test('reopening and applying the shift schedule preserve an 18-hour saved timesheet', () => {
  const suggested = { ...row, startTime: '16:00' };
  const merged = context.mergeTimesheetRows([suggested], [row], settings);
  const reopened = context.applySelectedShiftSchedule(merged, '16:00', '08:00', settings);
  assert.equal(reopened[0].startTime, '02:00 PM');
  assert.equal(reopened[0].endTime, '08:00 AM');
});
