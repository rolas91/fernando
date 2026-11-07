const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const source = fs.readFileSync(
  path.join(__dirname, '../src/lib/bulkShiftWorkerConflicts.ts'),
  'utf8',
);
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2020,
  },
}).outputText;
const loaded = { exports: {} };
new Function('exports', 'module', compiled)(loaded.exports, loaded);
const { findBulkShiftWorkerConflicts: find } = loaded.exports;
const shift = (
  id,
  date = '2026-09-16',
  startTime = '08:00',
  endTime = '16:00',
  workerId = 'worker-1',
) => ({
  id,
  date,
  startTime,
  endTime,
  roles: [{ assignedWorkers: [workerId] }],
});

assert.equal(find([shift('new')], [shift('existing')]).length, 1);
assert.equal(
  find([shift('new', undefined, '12:00', '20:00')], [shift('existing')]).length,
  1,
);
assert.equal(
  find([shift('new', undefined, '16:00', '23:00')], [shift('existing')]).length,
  0,
);
assert.equal(
  find(
    [shift('new', undefined, undefined, undefined, 'worker-2')],
    [shift('existing')],
  ).length,
  0,
);
assert.equal(
  find([shift('new')], [{ ...shift('existing'), cancelled: true }]).length,
  0,
);
assert.equal(
  find([shift('new')], [{ ...shift('existing'), status: 'shift_cancelled' }])
    .length,
  0,
);
assert.deepEqual(
  find(
    [shift('new-1'), shift('new-2', '2026-09-17')],
    [shift('existing', '2026-09-17')],
  ).map((c) => c.date),
  ['2026-09-17'],
);
assert.equal(
  find(
    [shift('new', '2026-09-17', '02:00', '10:00')],
    [shift('night', '2026-09-16', '22:00', '06:00')],
  ).length,
  1,
);
assert.equal(
  find(
    [shift('new')],
    [
      {
        ...shift('existing', undefined, '00:00', '04:00'),
        roles: [{ startTime: '12:00', assignedWorkers: ['worker-1'] }],
      },
    ],
  ).length,
  1,
);
assert.equal(find([shift('new')], []).length, 0);
console.log('10 bulk shift worker conflict checks passed.');
