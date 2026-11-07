const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const { randomUUID } = require('node:crypto');
const source = fs.readFileSync(require('node:path').join(__dirname, '../src/components/scheduler/SchedulerView.tsx'), 'utf8');
const ast = ts.createSourceFile('screen.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const declarations = {};
function visit(node) {
  if (ts.isVariableDeclaration(node) && ['startOfWeek', 'handleCopyWeek'].includes(node.name.getText(ast))) declarations[node.name.getText(ast)] = node.initializer.getText(ast);
  ts.forEachChild(node, visit);
}
visit(ast);
const code = ts.transpileModule(`const startOfWeek = ${declarations.startOfWeek}; const handleCopyWeek = ${declarations.handleCopyWeek};`, { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText;
async function run({ target = '2026-10-26', inRange = true, conflict = false, fail = false } = {}) {
  const saved = [], notices = [];
  const sourceShift = { id: 'original', date: '2026-10-19', shiftName: 'Day', status: 'ready_to_notify', pmApprovedAt: '2026-10-19', roles: [{ id: 'r', assignedWorkers: ['w'], workerConfirmations: [{ workerId: 'w', status: 'confirmed' }] }] };
  const order = { id: 'assignment', title: 'Assignment', shifts: [sourceShift, { ...sourceShift, id: 'sunday', date: '2026-10-25' }, { ...sourceShift, id: 'outside', date: '2026-11-02' }] };
  const original = JSON.stringify(order);
  const deps = {
    copyingWeek: null, isCancelledAssignment: () => false, viewMode: 'week', dayViewDate: new Date('2026-10-19T12:00:00'), weekStart: new Date('2026-10-19T12:00:00'),
    window: { prompt: () => target, confirm: () => true }, toast: (notice) => notices.push(notice), crypto: { randomUUID },
    isShiftDateWithinAssignmentRange: () => inRange, assignmentDateRangeLabel: () => 'allowed range', prepareShiftDuplicate: (_source, copy) => copy,
    findBulkShiftWorkerConflicts: () => conflict ? [{}] : [], workOrders: [order], setCopyingWeek: () => {}, handleModifiedShifts: () => {},
    updateWorkOrder: async (_id, value) => { if (fail) throw new Error('Save failed'); saved.push(value); },
  };
  const fn = new Function(...Object.keys(deps), `${code}; return handleCopyWeek;`)(...Object.values(deps));
  await fn(order);
  assert.equal(JSON.stringify(order), original, 'original shifts must remain unchanged');
  return { saved, notices };
}
(async () => {
  const { saved } = await run();
  assert.equal(saved[0].shifts.length, 5);
  const copies = saved[0].shifts.slice(3);
  assert.deepEqual(copies.map(s => s.date), ['2026-10-26', '2026-11-01']);
  for (const copy of copies) {
    assert.equal(copy.pmApprovedAt, undefined);
    assert.equal(copy.status, 'dispatch_pending');
    assert.equal(copy.roles[0].workerConfirmations[0].status, 'pending');
  }
  for (const options of [{ inRange: false }, { conflict: true }, { target: '2026-10-19' }, { target: '2026-02-30' }, { target: null }]) assert.equal((await run(options)).saved.length, 0);
  assert.equal((await run({ fail: true })).notices.at(-1).title, 'Could not copy week');
  console.log('Copy week: dates, existing shifts, resets, conflicts, cancellation and failure checks passed.');
})().catch(e => { console.error(e); process.exitCode = 1; });
