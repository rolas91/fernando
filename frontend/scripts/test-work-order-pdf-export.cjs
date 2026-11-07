const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const source = fs.readFileSync(path.join(__dirname, '../src/components/shifts/ShiftsView.tsx'), 'utf8');
const ast = ts.createSourceFile('ShiftsView.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const declarations = {};
function visit(node) {
  if (ts.isVariableDeclaration(node) && ['isoWeekRange', 'exportPdf'].includes(node.name.getText(ast))) {
    declarations[node.name.getText(ast)] = node.initializer.getText(ast);
  }
  ts.forEachChild(node, visit);
}
visit(ast);
assert.ok(declarations.exportPdf && declarations.isoWeekRange);
const code = ts.transpileModule(`const isoWeekRange = ${declarations.isoWeekRange}; const exportPdf = ${declarations.exportPdf};`, {
  compilerOptions: { target: ts.ScriptTarget.ES2020 },
}).outputText;

async function run(overrides = {}) {
  const calls = [], alerts = [], downloads = [], busy = [], closed = [];
  const deps = {
    exportPeriod: 'range', exportStatus: 'all', exportProjectId: 'project-0818', overviewLoaded: true,
    exportProjectOptions: [{ id: 'project-0818' }],
    exportDay: '2026-10-20', exportWeek: '2026-W43',
    exportRangeStart: '2026-10-20', exportRangeEnd: '2026-10-26',
    window: { alert: (message) => alerts.push(message) },
    setExportingPdf: (value) => busy.push(value), setExportPdfOpen: (value) => closed.push(value),
    exportWorkOrderPdfs: async (params) => { calls.push(params); return { blob: {}, fileName: 'Work Orders - 0818.pdf' }; },
    URL: { createObjectURL: () => 'blob:export', revokeObjectURL: () => {} },
    document: {
      createElement: () => { const anchor = { click() { downloads.push(this.download); }, remove() {} }; return anchor; },
      body: { appendChild() {} },
    },
    ...overrides,
  };
  await new Function(...Object.keys(deps), `${code}; return exportPdf;`)(...Object.values(deps))();
  return { calls, alerts, downloads, busy, closed };
}

(async () => {
  for (const status of ['all', 'completed', 'pm_approved']) {
    const result = await run({ exportStatus: status });
    assert.deepEqual(result.calls, [{ status, projectId: 'project-0818', from: '2026-10-20', to: '2026-10-26' }]);
    assert.deepEqual(result.busy, [true, false]);
    assert.deepEqual(result.closed, [false]);
    assert.equal(result.downloads.length, 1);
  }
  assert.deepEqual((await run({ exportPeriod: 'day' })).calls[0], {
    status: 'all', projectId: 'project-0818', from: '2026-10-20', to: '2026-10-20',
  });
  assert.deepEqual((await run({ exportPeriod: 'week' })).calls[0], {
    status: 'all', projectId: 'project-0818', from: '2026-10-19', to: '2026-10-25',
  });
  for (const invalid of [
    { exportProjectId: '' }, { exportProjectId: 'unknown-project' }, { overviewLoaded: false },
    { exportRangeStart: '' }, { exportRangeEnd: '' },
    { exportRangeEnd: '2026-10-19' }, { exportPeriod: 'week', exportWeek: '' },
  ]) {
    const result = await run(invalid);
    assert.equal(result.calls.length, 0);
    assert.equal(result.downloads.length, 0);
    assert.equal(result.alerts.length, 1);
  }
  const failed = await run({ exportWorkOrderPdfs: async () => { throw new Error('No matching PDFs'); } });
  assert.deepEqual(failed.alerts, ['No matching PDFs']);
  assert.deepEqual(failed.busy, [true, false]);
  assert.equal(failed.closed.length, 0);
  console.log('PDF export: project + date + status, day/week/range, invalid selections and errors passed.');
})().catch((error) => { console.error(error); process.exitCode = 1; });
