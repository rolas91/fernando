const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const base = path.resolve(__dirname, '../src/components/scheduler');
let context;
function compile(name) {
  const file = path.join(base, name + '.tsx');
  const loaded = new Module(file);
  loaded.filename = file;
  loaded.paths = Module._nodeModulePaths(path.dirname(file));
  const originalRequire = loaded.require.bind(loaded);
  loaded.require = (id) => {
    if (id === '@/contexts/AppContext') return { useAppContext: () => context };
    if (id === '@/components/ui/sheet')
      return Object.fromEntries(
        ['Sheet', 'SheetContent', 'SheetTitle'].map((key) => [
          key,
          (props) => React.createElement('div', null, props.children),
        ]),
      );
    if (id === '@/lib/utils') return { cn: (...args) => args.join(' ') };
    if (id === '@/lib/workerCertificationMatch')
      return { getRoleRequiredCertificationIds: () => [] };
    if (id === './shiftConfirmation')
      return {
        getWorkerConfirmationStatus: (role, workerId) =>
          role.workerConfirmations?.find((c) => c.workerId === workerId)
            ?.status || 'pending',
      };
    if (id === './WorkerConfirmationIcons') return indicators;
    return originalRequire(id);
  };
  loaded._compile(
    ts.transpileModule(fs.readFileSync(file, 'utf8'), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        jsx: ts.JsxEmit.ReactJSX,
        esModuleInterop: true,
      },
    }).outputText,
    file,
  );
  return loaded.exports;
}
const indicators = compile('WorkerConfirmationIcons');
const render = (props) =>
  renderToStaticMarkup(
    React.createElement(indicators.WorkerConfirmationIcons, props),
  );
const acceptance = 'aria-label="Worker accepted shift"';
const cancellation = 'aria-label="Worker acknowledged shift cancellation"';
const acknowledged = {
  workerId: 'w1',
  status: 'pending',
  cancellationAcknowledgedAt: '2026-10-21T08:00:00Z',
};
for (const detail of [false, true]) {
  const html = render({ confirmation: acknowledged, cancelled: true, detail });
  assert.ok(
    html.includes(cancellation),
    'cancellation without prior acceptance must show Ban',
  );
  assert.ok(
    !html.includes(acceptance),
    'must not invent assignment acceptance',
  );
}
const both = { ...acknowledged, status: 'confirmed' };
assert.ok(
  render({ confirmation: both, cancelled: true, detail: true }).includes(
    acceptance,
  ),
);
assert.ok(
  render({ confirmation: both, cancelled: true, detail: true }).includes(
    cancellation,
  ),
);
assert.ok(
  !render({ confirmation: both, cancelled: true }).includes(acceptance),
  'cancelled card must show only Ban',
);
assert.ok(
  render({ confirmation: both, cancelled: true }).includes(cancellation),
);
assert.ok(
  !render({ confirmation: both, cancelled: false }).includes(cancellation),
  'restored shift must not show old cancellation',
);
assert.ok(
  render({ confirmation: both, cancelled: false }).includes(acceptance),
);
assert.ok(
  !render({ confirmation: { status: 'pending' }, cancelled: true }).includes(
    cancellation,
  ),
);

const { ShiftDetailsSheet } = compile('ShiftDetailsSheet');
const originalShift = {
  id: 's1',
  date: '2026-10-21',
  startTime: '16:00',
  cancelled: true,
  roles: [
    {
      id: 'r1',
      roleName: 'Flagger',
      requiredCount: 1,
      assignedWorkers: ['w1'],
      workerConfirmations: [{ workerId: 'w1', status: 'pending' }],
    },
  ],
};
context = {
  workOrders: [{ id: 'wo1', shifts: [originalShift] }],
  getProjectById: () => undefined,
  getWorkerById: () => ({ id: 'w1', firstName: 'Test', lastName: 'Worker' }),
  certifications: [],
};
const sheet = () =>
  renderToStaticMarkup(
    React.createElement(ShiftDetailsSheet, {
      open: true,
      shift: originalShift,
      woId: 'wo1',
      onOpenChange() {},
      onEditShift() {},
      onSendReminders() {},
    }),
  );
assert.ok(!sheet().includes(cancellation));
context.workOrders[0].shifts = [
  {
    ...originalShift,
    roles: [{ ...originalShift.roles[0], workerConfirmations: [acknowledged] }],
  },
];
assert.ok(
  sheet().includes(cancellation),
  'open modal must read refreshed context instead of selected snapshot',
);
assert.ok(sheet().includes('Cancellation confirmed'));
context.workOrders[0].shifts[0].roles[0].workerConfirmations = [both];
assert.ok(sheet().includes(acceptance) && sheet().includes(cancellation));
console.log(
  'Cancellation indicators: cards, modal, independent confirmations and live refresh passed.',
);
