const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const { QueryClient, QueryObserver } = require('@tanstack/react-query');
const { EventEmitter } = require('node:events');

function loadTs(relative, mocks) {
  const source = fs.readFileSync(path.join(__dirname, '../src', relative), 'utf8')
    .replaceAll('import.meta.env', '({})');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', code)((name) => name in mocks ? mocks[name] : require(name), module, module.exports);
  return module.exports;
}

const sockets = [];
let expired = 0;
const db = loadTs('lib/db.ts', {
  './googlePlaceAddress': { DEFAULT_ASSIGNMENT_COUNTRY: 'USA' },
  './authErrors': { AUTH_MESSAGES: { network: 'network', server: 'server', sessionExpired: 'expired', tooManyAttempts: 'rate' }, announceSessionExpired: () => expired++ },
  'socket.io-client': { io: () => {
    const socket = new EventEmitter();
    socket.connected = false;
    socket.hasListeners = (event) => socket.listenerCount(event) > 0;
    socket.disconnect = () => { socket.disconnected = true; };
    sockets.push(socket);
    return socket;
  } },
});
const cache = loadTs('lib/appDataQueries.ts', { './db': db });
const pages = loadTs('lib/appDataPages.ts', {});
const paged = loadTs('lib/pagedCatalog.ts', { './db': db, './appDataQueries': cache });
const projectViews = loadTs('lib/projectViews.ts', { './db': db, './appDataQueries': cache });
const summaries = loadTs('lib/summaryReads.ts', { './db': db, './appDataQueries': cache });
const assignmentPaging=loadTs('lib/assignmentPaging.ts',{'./db':db,'./appDataQueries':cache});
const documents=loadTs('lib/assignmentDocumentReads.ts',{'./db':db,'./appDataQueries':cache});
const shiftsReads=loadTs('lib/shiftsReads.ts',{'./db':db,'./appDataQueries':cache});
global.localStorage = { getItem: () => 'token' };
const quiet = console.error;
const clients = [];
function client() { const value = new QueryClient(); clients.push(value); return value; }
function options(user, name) { return cache.appResourceOptions(user, cache.APP_RESOURCES.find((item) => item.key === name)); }
function response(data, status = 200) { return { ok: status < 400, status, json: async () => data }; }
const tests = [];
function test(name, fn) { tests.push([name, fn]); }

test('concurrent consumers share a request and fresh data is reused', async () => {
  const c = client(); let calls = 0;
  global.fetch = async () => { calls++; return response([{ id: 'worker' }]); };
  const query = options('alice', 'workers');
  const [a, b] = await Promise.all([c.fetchQuery(query), c.fetchQuery(query)]);
  assert.deepEqual(a, b);
  await c.fetchQuery(query);
  assert.equal(calls, 1);
});

test('assignment refreshes preserve the computed-status reload signal', async () => {
  const c = client();
  global.fetch = async () => response([{ id: 'unchanged', shifts: [] }]);
  const orderQuery = { ...options('alice', 'workOrders'), staleTime: 0 };
  const original = await c.fetchQuery(orderQuery);
  await c.fetchQuery(orderQuery);
  const refreshed = c.getQueryData(cache.appDataKey('alice', 'workOrders'));
  assert.deepEqual(original, refreshed);
  assert.notEqual(original, refreshed, 'Schedule effects must rerun for server-derived status changes');
  const workerQuery = { ...options('alice', 'workers'), staleTime: 0 };
  const workers = await c.fetchQuery(workerQuery);
  await c.fetchQuery(workerQuery);
  assert.equal(workers, c.getQueryData(cache.appDataKey('alice', 'workers')), 'Other resources retain structural sharing');
});

test('a forbidden ancillary query does not discard assignments or retry', async () => {
  const c = client(); let invoices = 0;
  global.fetch = async (url) => {
    if (url.includes('/invoices')) { invoices++; return response({ message: 'forbidden' }, 403); }
    return response([{ id: 'assignment', shifts: [] }]);
  };
  const settled = await Promise.allSettled([c.fetchQuery(options('alice', 'workOrders')), c.fetchQuery(options('alice', 'commercialInvoices'))]);
  assert.equal(settled[0].status, 'fulfilled');
  assert.equal(settled[1].status, 'rejected');
  assert.equal(invoices, 1);
  assert.equal(c.getQueryData(cache.appDataKey('alice', 'workOrders'))[0].id, 'assignment');
});

test('user keys are isolated and removing one session leaves another untouched', async () => {
  const c = client();
  c.setQueryData(cache.appDataKey('alice', 'workers'), [{ id: 'alice-worker' }]);
  c.setQueryData(cache.appDataKey('bob', 'workers'), [{ id: 'bob-worker' }]);
  await c.cancelQueries({ queryKey: cache.appDataKey('alice') });
  c.removeQueries({ queryKey: cache.appDataKey('alice') });
  assert.equal(c.getQueryData(cache.appDataKey('alice', 'workers')), undefined);
  assert.equal(c.getQueryData(cache.appDataKey('bob', 'workers'))[0].id, 'bob-worker');
});

test('successful mutations cancel stale reads and functional setters compose', async () => {
  const c = client(); const key = cache.appDataKey('alice', 'workOrders');
  c.setQueryData(key, [{ id: 'original', shifts: [] }]);
  let resolveRead, signal;
  global.fetch = (_url, init) => { signal = init.signal; return new Promise((resolve) => { resolveRead = resolve; }); };
  const reading = c.fetchQuery({ ...options('alice', 'workOrders'), staleTime: 0 }).catch(() => {});
  cache.updateAppResource(c, 'alice', 'workOrders', (prev) => [...prev, { id: 'saved', shifts: [] }], []);
  assert.equal(signal.aborted, true);
  resolveRead(response([{ id: 'stale' }]));
  await reading;
  cache.updateAppResource(c, 'alice', 'workOrders', (prev) => prev.filter((item) => item.id !== 'original'), []);
  assert.deepEqual(c.getQueryData(key).map((item) => item.id), ['saved']);
});

test('a failed background refresh retains the last good data', async () => {
  const c = client(); const key = cache.appDataKey('alice', 'workers');
  c.setQueryData(key, [{ id: 'last-good' }]);
  global.fetch = async () => response({ message: 'forbidden' }, 403);
  await assert.rejects(c.fetchQuery({ ...options('alice', 'workers'), staleTime: 0 }));
  assert.equal(c.getQueryData(key)[0].id, 'last-good');
});

test('invalidation refetches only the affected active resource', async () => {
  const c = client(); const calls = [];
  global.fetch = async (url) => { calls.push(url); return response([]); };
  const workers = new QueryObserver(c, options('alice', 'workers'));
  const orders = new QueryObserver(c, options('alice', 'workOrders'));
  const offWorker = workers.subscribe(() => {}), offOrder = orders.subscribe(() => {});
  await Promise.all([workers.refetch(), orders.refetch()]);
  calls.length = 0;
  await c.invalidateQueries({ queryKey: cache.appDataKey('alice', 'workOrders'), exact: true });
  assert.deepEqual(calls, ['/api/work-orders']);
  offWorker(); offOrder();
});

test('session cancellation aborts pending HTTP reads without expiring another session', async () => {
  const c = client(); let signal;
  global.fetch = (_url, init) => { signal = init.signal; return new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))); };
  const reading = c.fetchQuery(options('alice', 'workers')).catch(() => {});
  await c.cancelQueries({ queryKey: cache.appDataKey('alice') });
  c.removeQueries({ queryKey: cache.appDataKey('alice') });
  await reading;
  assert.equal(signal.aborted, true);
  assert.equal(expired, 0);
});

test('settings and availability retain their existing normalization', async () => {
  global.fetch = async (url) => response(url.includes('company-settings') ? [{ companyName: 'Example', minimumRestHours: '10' }] : [{ id: 'a', workerId: 'w', date: '2026-11-13', type: 'unavailable', status: 'pending' }]);
  const settings = await options('alice', 'settings').queryFn({ signal: new AbortController().signal });
  const rows = await options('alice', 'availabilityRequests').queryFn({ signal: new AbortController().signal });
  assert.equal(settings.minimumRestHours, 10);
  assert.equal(rows[0].startTime, '00:00');
  assert.equal(rows[0].endTime, '23:59');
  assert.equal(rows[0].reason, '');
});

test('Dashboard shell no longer enables historical collections', async () => {
  const c = client(); const calls = [];
  global.fetch = async (url) => { calls.push(url); return response([]); };
  const active = pages.resourcesForPage('dashboard');
  const range = pages.rangeForPage('dashboard', '2026-11-13');
  const observers = cache.APP_RESOURCES.map((resource) => new QueryObserver(c, { ...cache.appResourceOptions('alice', resource, range), enabled: active.has(resource.key) }));
  const unsubscribe = observers.map((observer) => observer.subscribe(() => {}));
  await c.refetchQueries({ type: 'active' });
  assert.equal(calls.length, 3);
  assert(!calls.some(url => /work-orders|workers|equipment|incidents|activity-feed/.test(url)));
  assert(!calls.some((url) => /invoices|form-submissions|form-templates|materials|commercial/.test(url)));
  unsubscribe.forEach((off) => off());
});

test('Schedule uses a separate complete collection and never inherits the dashboard subset', async () => {
  const c = client(); const calls = [];
  global.fetch = async (url) => { calls.push(url); return response(url.includes('?') ? [{ id: 'today-only' }] : [{ id: 'all-projects' }]); };
  const resource = cache.APP_RESOURCES.find((item) => item.key === 'workOrders');
  const range = pages.rangeForPage('dashboard', '2026-11-13');
  const todayQuery = cache.appResourceOptions('alice', resource, range);
  await c.fetchQuery(todayQuery);
  const scheduleQuery = cache.appResourceOptions('alice', resource, pages.rangeForPage('scheduler', '2026-11-13'));
  assert.equal(c.getQueryData(scheduleQuery.queryKey), undefined);
  assert.equal((await c.fetchQuery(scheduleQuery))[0].id, 'all-projects');
  assert.deepEqual(calls, ['/api/work-orders?from=2026-11-13&to=2026-11-13', '/api/work-orders']);
  assert.equal(c.getQueryData(todayQuery.queryKey)[0].id, 'today-only');
  assert.equal(pages.resourcesForPage('scheduler').has('availabilityRequests'), true);
  assert.equal(pages.resourcesForPage('scheduler').has('commercialInvoices'), false);
});

test('inactive modules are marked stale by events without being downloaded', async () => {
  const c = client(); let calls = 0;
  global.fetch = async () => { calls++; return response([]); };
  const query = options('alice', 'commercialInvoices');
  const observer = new QueryObserver(c, { ...query, enabled: false });
  const off = observer.subscribe(() => {});
  await c.invalidateQueries({ queryKey: cache.appDataKey('alice', 'commercialInvoices') });
  assert.equal(calls, 0);
  observer.setOptions({ ...query, enabled: true });
  await c.fetchQuery(query);
  assert.equal(calls, 1);
  off();
});

test('successful full-assignment mutations invalidate ranged views without mixing snapshots', () => {
  const c = client(); const range = { from: '2026-11-13', to: '2026-11-13' };
  const full = cache.appDataKey('alice', 'workOrders');
  const scoped = cache.appDataKey('alice', 'workOrders', range);
  const other = cache.appDataKey('bob', 'workOrders', range);
  c.setQueryData(full, [{ id: 'original' }]);
  c.setQueryData(scoped, [{ id: 'original-today' }]);
  c.setQueryData(other, [{ id: 'bob' }]);
  cache.updateAppResource(c, 'alice', 'workOrders', [{ id: 'saved-complete' }], []);
  assert.equal(c.getQueryData(full)[0].id, 'saved-complete');
  assert.equal(c.getQueryData(scoped)[0].id, 'original-today');
  assert.equal(c.getQueryState(scoped).isInvalidated, true);
  assert.equal(c.getQueryState(full).isInvalidated, false);
  assert.equal(c.getQueryState(other).isInvalidated, false);
});

test('different dates get different caches and page policies preserve complete editable views', () => {
  const first = cache.appDataKey('alice', 'workOrders', pages.rangeForPage('dashboard', '2026-11-13'));
  const next = cache.appDataKey('alice', 'workOrders', pages.rangeForPage('dashboard', '2026-11-14'));
  assert.notDeepEqual(first, next);
  for (const page of ['scheduler', 'shifts', 'workorders', 'projects', 'forms', 'timesheets', 'reports']) assert.equal(pages.rangeForPage(page, '2026-11-13'), undefined);
  assert.equal(pages.resourcesForPage('profile').size, 3);
  assert(!pages.resourcesForPage('profile').has('timesheets'));
  assert(pages.resourcesForPage('profile').has('timesheetSummary'));
});

test('paged catalog searches and page keys are server-scoped and cached independently', async () => {
  const c = client(); const calls = [];
  global.fetch = async (url, init) => { calls.push({ url, signal: init.signal }); return response({ data: [{ id: String(calls.length) }], meta: { page: 1, limit: 25, total: 200, totalPages: 8 } }); };
  const filters = { search: 'sign_% &', status: 'available', type: 'Cone' };
  const first = paged.catalogReadOptions('alice', 'materials', 1, filters);
  const second = paged.catalogReadOptions('alice', 'materials', 2, filters);
  await c.fetchQuery(first); await c.fetchQuery(second); await c.fetchQuery(first);
  assert.equal(calls.length, 2);
  const url = new URL(calls[0].url, 'http://test');
  assert.equal(url.searchParams.get('search'), filters.search);
  assert.equal(url.searchParams.get('limit'), '25');
  assert.equal(url.searchParams.get('status'), 'available');
  assert(calls[0].signal instanceof AbortSignal);
  assert.notDeepEqual(first.queryKey, second.queryKey);
  assert.notDeepEqual(first.queryKey, paged.catalogReadOptions('bob', 'materials', 1, filters).queryKey);
});

test('paged catalog screens do not enable complete collections or project downloads', () => {
  for (const resource of ['clients', 'equipment', 'materials']) assert(!pages.resourcesForPage(resource).has(resource));
  assert(!pages.resourcesForPage('clients').has('projects'));
  assert(!pages.resourcesForPage('clients').has('timesheets'));
  assert(pages.resourcesForPage('scheduler').has('materials'));
  assert(pages.resourcesForPage('scheduler').has('clients'));
});

test('catalog writes keep existing payloads and refresh caches without inserting partial collections', async () => {
  const c = client(); const writes = [];
  const root = cache.appDataKey('alice', 'clients');
  const pageKey = paged.catalogReadOptions('alice', 'clients', 1, {}).queryKey;
  const complete = [{ id: 'first' }, { id: 'off-page' }];
  c.setQueryData(root, complete); c.setQueryData(pageKey, { data: [{ id: 'first' }], meta: { total: 2 } });
  global.fetch = async (url, init) => { writes.push({ url, method: init.method, body: JSON.parse(init.body) }); return response({ id: 'first' }); };
  let refreshes = 0;
  const actions = paged.catalogActions('clients', [{ id: 'first' }], async () => { refreshes++; await c.invalidateQueries({ queryKey: root }); });
  await actions.updateClient('first', { name: 'Renamed', status: 'archived' });
  assert.deepEqual(writes, [{ url: '/api/clients/first', method: 'PATCH', body: { name: 'Renamed', status: 'archived' } }]);
  assert.equal(refreshes, 1);
  assert.deepEqual(c.getQueryData(root), complete);
  assert.equal(c.getQueryState(pageKey).isInvalidated, true);
});

test('failed writes do not refresh or discard the current page, and bulk delete preserves IDs/count', async () => {
  let refreshes = 0;
  const actions = paged.catalogActions('materials', [{ id: 'm' }], async () => { refreshes++; });
  global.fetch = async () => response({ message: 'error' }, 500);
  await assert.rejects(actions.updateMaterial('m', { name: 'Changed' }));
  assert.equal(refreshes, 0);
  global.fetch = async (_url, init) => { assert.deepEqual(JSON.parse(init.body), { ids: ['a', 'b'] }); return response({ deletedCount: 2 }); };
  assert.equal(await actions.deleteMaterials(['a', 'b']), 2);
  assert.equal(refreshes, 1);
});

test('catalog export sends all active filters without a page limit', async () => {
  const all = Array.from({ length: 75 }, (_, index) => ({ id: String(index) }));
  global.fetch = async (url) => { const query = new URL(url, 'http://test'); assert.equal(query.pathname, '/api/paged/materials/export'); assert.equal(query.searchParams.get('search'), 'sign'); assert(!query.searchParams.has('page')); assert(!query.searchParams.has('limit')); return response(all); };
  assert.equal((await db.fetchCatalogExport('materials', { search: 'sign', status: 'available' })).length, 75);
});

test('timesheet badge uses a count response instead of downloading rows', async () => {
  global.fetch = async (url) => { assert.equal(url, '/api/paged/timesheets/summary'); return response({ pending: 12345 }); };
  const result = await options('alice', 'timesheetSummary').queryFn({ signal: new AbortController().signal });
  assert.equal(result.pending, 12345);
});

test('worker and project lists stay bounded and project sort is part of the server query', async () => {
  assert(!pages.resourcesForPage('workers').has('workers'));
  for (const key of ['projects', 'clients', 'workOrders', 'workers', 'equipment']) assert(!pages.resourcesForPage('projects').has(key));
  assert.deepEqual(pages.ON_DEMAND_PAGE_RESOURCES.projects, ['clients']);
  global.fetch = async (url) => {
    const query = new URL(url, 'http://test');
    assert.equal(query.searchParams.get('sort'), 'status');
    assert.equal(query.searchParams.get('direction'), 'desc');
    assert.equal(query.searchParams.get('limit'), '25');
    return response({ data: [], meta: { total: 1000, totalPages: 40, page: 1, limit: 25 } });
  };
  await client().fetchQuery(paged.catalogReadOptions('alice', 'projects', 1, { sort: 'status', direction: 'desc' }));
});

test('worker and project mutations preserve existing API payloads and refresh only after success', async () => {
  const writes = []; let refreshes = 0;
  global.fetch = async (url, init) => { writes.push({ url, body: JSON.parse(init.body) }); return response({ id: 'saved' }); };
  const workerActions = paged.catalogActions('workers', [], async () => { refreshes++; });
  await workerActions.updateWorker('w', { firstName: 'Edited', workerRoleIds: ['role'], certificationAssignments: [{ certificationId: 'cert', expirationDate: '2027-01-01' }], createAppUser: true, appUserPassword: 'fixture-password', appUserRole: 'viewer' });
  assert.equal(writes[0].url, '/api/workers/w');
  assert.deepEqual(writes[0].body.certificationAssignments, [{ certificationId: 'cert', expirationDate: '2027-01-01' }]);
  assert.deepEqual(writes[0].body.workerRoleIds, ['role']);
  assert.equal(writes[0].body.createAppUser, true);
  assert.equal(writes[0].body.appUserRole, 'viewer');
  const projectActions = paged.catalogActions('projects', [], async () => { refreshes++; });
  await projectActions.updateProject('p', { status: 'completed' });
  assert.deepEqual(writes[1], { url: '/api/projects/p', body: { status: 'completed' } });
  assert.equal(refreshes, 2);
});

test('forms, incidents and payroll do not enable complete histories on entry', async () => {
  for (const page of ['forms', 'incidents', 'timesheets']) for (const key of ['timesheets', 'workOrders', 'workers', 'projects', 'formSubmissions', 'incidents']) assert(!pages.resourcesForPage(page).has(key), page + ' must not eagerly load ' + key);
  const requests = []; global.fetch = async (url) => { requests.push(new URL(url, 'http://test')); return response({ data: [], meta: { page: 2, limit: 25, total: 3000, totalPages: 120 } }); };
  await client().fetchQuery(paged.catalogReadOptions('alice', 'formSubmissions', 2, { search: 'Safety' }));
  assert.equal(requests[0].pathname, '/api/paged/form-submissions'); assert.equal(requests[0].searchParams.get('page'), '2'); assert.equal(requests[0].searchParams.get('search'), 'Safety');
  await db.fetchSubmissionCount(); await db.fetchSubmissionDetail('id with space');
  assert.equal(requests[1].pathname, '/api/form-submissions/reports/count'); assert.equal(requests[2].pathname, '/api/form-submissions/id%20with%20space');
  const filters = { today: '2026-11-05', rangeMode: 'custom', start: '2026-10-01', end: '2026-10-31', workerId: 'w', projectId: 'p' };
  await db.fetchPayrollReport({ ...filters, page: '3' }); await db.fetchPayrollExport(filters);
  assert.equal(requests[3].pathname, '/api/timesheets/reports/payroll'); assert.equal(requests[3].searchParams.get('page'), '3');
  assert.equal(requests[4].pathname, '/api/timesheets/reports/payroll/export'); assert(!requests[4].searchParams.has('page'));
  for (const [key,value] of Object.entries(filters)) assert.equal(requests[4].searchParams.get(key), value);
});

test('incident actions and submission deletion preserve payloads and refresh only after successful writes', async () => {
  const writes = []; let refreshes = 0;
  global.fetch = async (url, init) => { writes.push({ url, method: init.method, body: init.body && JSON.parse(init.body) }); return response({ id: 'saved' }); };
  const incident = paged.catalogActions('incidents', [], async () => { refreshes++; });
  await incident.updateIncident('inc', { status: 'resolved' });
  const payload = { id: 'form', templateId: 'incident-template', workOrderId: 'wo', shiftId: 'shift', data: { evidence: 'kept' }, status: 'submitted' };
  await incident.addFormSubmission(payload);
  const submissions = paged.catalogActions('formSubmissions', [], async () => { refreshes++; });
  await submissions.deleteFormSubmission('form');
  assert.deepEqual(writes[0], { url: '/api/incidents/inc', method: 'PATCH', body: { status: 'resolved' } });
  assert.deepEqual(writes[1].body, payload); assert.equal(writes[1].url, '/api/form-submissions');
  assert.equal(writes[2].url, '/api/form-submissions/form'); assert.equal(writes[2].method, 'DELETE'); assert.equal(refreshes, 3);
  global.fetch = async () => response({ message: 'locked' }, 409);
  await assert.rejects(incident.updateIncident('inc', { status: 'open' })); assert.equal(refreshes, 3);
});

test('project calendars and details have scoped keys, deduplicate reads and preserve full Schedule collections', async () => {
  const c = client(), fullKey = cache.appDataKey('alice', 'workOrders'); const full = [{ id: 'complete-assignment', shifts: [{ id: 'outside-range' }] }]; c.setQueryData(fullKey, full);
  const requests = []; global.fetch = async url => { requests.push(new URL(url,'http://test')); return response({ projects: [], clients: [], days: [] }); };
  const calendar = projectViews.projectCalendarOptions('alice','2026-11-01','2026-11-07',{ search:'50%_', status:'confirmed', sort:'name', direction:'desc' });
  await Promise.all([c.fetchQuery(calendar),c.fetchQuery(calendar)]); assert.equal(requests.length,1);
  assert.equal(requests[0].pathname,'/api/projects/views/calendar'); assert.equal(requests[0].searchParams.get('from'),'2026-11-01'); assert.equal(requests[0].searchParams.get('search'),'50%_');
  assert.notDeepEqual(calendar.queryKey, projectViews.projectCalendarOptions('alice','2026-11-08','2026-11-14',{}).queryKey);
  assert.notDeepEqual(calendar.queryKey, projectViews.projectCalendarOptions('bob','2026-11-01','2026-11-07',{}).queryKey);
  await c.fetchQuery(projectViews.projectDetailOptions('alice','project with space',2)); assert.equal(requests[1].pathname,'/api/projects/project%20with%20space/views/detail'); assert.equal(requests[1].searchParams.get('page'),'2');
  await c.fetchQuery(projectViews.projectRecordOptions('alice','edit-project')); assert.equal(requests[2].pathname,'/api/projects/edit-project');
  assert.notDeepEqual(projectViews.projectDetailOptions('alice','p',1).queryKey,projectViews.projectDetailOptions('alice','p',2).queryKey);
  await c.invalidateQueries({ queryKey: cache.appDataKey('alice','projects') }); assert.equal(c.getQueryState(calendar.queryKey).isInvalidated,true); assert.deepEqual(c.getQueryData(fullKey),full); assert.equal(c.getQueryData(cache.appDataKey('alice','projects')),undefined);
});

test('project editor chooses the freshest complete scoped record without confusing project IDs', () => {
  const old = { id:'p', name:'Old record' }, recent = { id:'p', name:'Fresh page' };
  assert.equal(projectViews.latestProjectSnapshot('p',[{projects:[old],updatedAt:10},{projects:[recent],updatedAt:20}]),recent);
  assert.equal(projectViews.latestProjectSnapshot('p',[{projects:[recent],updatedAt:20},{projects:[old],updatedAt:10}]),recent);
  assert.equal(projectViews.latestProjectSnapshot('missing',[{projects:[recent],updatedAt:20}]),undefined);
  assert.equal(projectViews.latestProjectSnapshot(null,[{projects:[recent],updatedAt:20}]),undefined);
});

test('Dashboard and Reports use scoped cached reads without replacing complete operational collections', async () => {
  const c=client(),requests=[]; const fullKey=cache.appDataKey('alice','workOrders');c.setQueryData(fullKey,[{id:'all-shifts',shifts:[{id:'outside-today'}]}]);
  for(const page of ['dashboard','reports'])for(const key of ['workers','workOrders','timesheets','incidents','formSubmissions','projects','equipment','activityFeed'])assert(!pages.resourcesForPage(page).has(key),page+' eagerly loaded '+key);
  global.fetch=async url=>{requests.push(new URL(url,'http://test'));return response({activeJobs:1,workerHours:[],projectSummary:[]});};
  const day=summaries.dashboardDay(new Date(2026,10,6,12));assert.equal(day.date,'2026-11-06');assert.equal(day.activityFrom,new Date(2026,10,6).toISOString());assert.equal(day.activityTo,new Date(2026,10,7).toISOString());
  const query=summaries.dashboardReadOptions('alice',day,2);await Promise.all([c.fetchQuery(query),c.fetchQuery(query)]);assert.equal(requests.length,1);assert.equal(requests[0].pathname,'/api/work-orders/views/dashboard');assert.equal(requests[0].searchParams.get('activityPage'),'2');assert.equal(requests[0].searchParams.get('date'),'2026-11-06');
  const range={start:'2026-11-01',end:'2026-11-06'};await c.fetchQuery(summaries.operationsReadOptions('alice',range,'worker_hours',2));assert.equal(requests[1].pathname,'/api/timesheets/reports/operations');assert.equal(requests[1].searchParams.get('page'),'2');assert.equal(requests[1].searchParams.get('from'),range.start);
  const exported=await c.fetchQuery(summaries.operationsExportOptions('alice',range,'worker_hours'));assert.equal(requests[2].pathname,'/api/timesheets/reports/operations/export');assert(!requests[2].searchParams.has('page'));assert.deepEqual(exported.workerHours,[]);
  assert.notDeepEqual(query.queryKey,summaries.dashboardReadOptions('bob',day,2).queryKey);assert.notDeepEqual(query.queryKey,summaries.dashboardReadOptions('alice',summaries.dashboardDay(new Date(2026,10,7)),2).queryKey);
  assert.notDeepEqual(summaries.operationsReadOptions('alice',range,'overview',1).queryKey,summaries.operationsReadOptions('alice',range,'project_summary',1).queryKey);
  assert.equal(c.getQueryData(fullKey)[0].shifts[0].id,'outside-today');assert.equal(c.getQueryData(cache.appDataKey('alice','timesheets')),undefined);
});

test('Shifts starts with a page and global metrics, opens a complete selected record and never seeds writable root collections',async()=>{
 const c=client(),requests=[];for(const key of ['workOrders','formSubmissions','workers','equipment','materials','projects','clients'])assert(!pages.resourcesForPage('shifts').has(key));assert.deepEqual(pages.ON_DEMAND_PAGE_RESOURCES.shifts,['workers','equipment','materials']);
 global.fetch=async url=>{requests.push(new URL(url,'http://test'));return response({rows:[],meta:{page:2,limit:25,total:120,totalPages:5}});};
 const filters={search:'50%_',status:'Dispatch Pending',projectNumber:'p',projectName:'p',from:'2026-11-01',to:'2026-11-07'},query=shiftsReads.shiftsPageOptions('alice',filters,2);
 await Promise.all([c.fetchQuery(query),c.fetchQuery(query)]);assert.equal(requests.length,1);assert.equal(requests[0].pathname,'/api/work-orders/views/shifts');assert.equal(requests[0].searchParams.get('search'),'50%_');assert.equal(requests[0].searchParams.get('page'),'2');assert.equal(requests[0].searchParams.get('from'),'2026-11-01');
 await c.fetchQuery(shiftsReads.shiftsMetricsOptions('alice','2026-11-06'));assert.equal(requests[1].pathname,'/api/work-orders/views/shifts/metrics');assert(!requests[1].searchParams.has('page'));
 await c.fetchQuery(shiftsReads.shiftReadDetailOptions('alice','wo with space','shift'));assert.equal(requests[2].pathname,'/api/work-orders/views/shifts/wo%20with%20space/shift/detail');assert.equal(c.getQueryData(cache.appDataKey('alice','workOrders')),undefined);
 assert.notDeepEqual(query.queryKey,shiftsReads.shiftsPageOptions('bob',filters,2).queryKey);assert.notDeepEqual(query.queryKey,shiftsReads.shiftsPageOptions('alice',filters,1).queryKey);
});

test('retry policy excludes authorization, validation and cancellation errors', () => {
  const policy = options('alice', 'workers');
  for (const status of [400, 401, 403, 404, 429]) assert.equal(policy.retry(0, new db.ApiRequestError('error', status)), false);
  for (const status of [0, 500, 503]) assert.equal(policy.retry(0, new db.ApiRequestError('error', status)), true);
  assert.equal(policy.retry(2, new db.ApiRequestError('error', 500)), false);
  assert.equal(policy.retry(0, new DOMException('Aborted', 'AbortError')), false);
});

test('socket events support settings, reconnect state and complete cleanup', () => {
  const events = [];
  const unsubscribe = db.subscribeToChanges({ onSettings: () => events.push('settings'), onWorkOrders: () => events.push('orders'), onConnect: () => events.push('connect'), onDisconnect: () => events.push('disconnect') });
  const socket = sockets.at(-1);
  socket.emit('connect'); socket.emit('table-updated', { table: 'company_settings' });
  socket.emit('table-updated', { table: 'work_orders' }); socket.emit('disconnect');
  assert.deepEqual(events, ['connect', 'settings', 'orders', 'disconnect']);
  unsubscribe();
  assert.equal(socket.listenerCount('table-updated'), 0);
  assert.equal(socket.listenerCount('connect'), 0);
  assert.equal(socket.listenerCount('disconnect'), 0);
  assert.equal(socket.disconnected, true);
});

test('Schedule completion and selected-assignment documents never populate full submission history', async () => {
  for (const page of ['scheduler', 'workorders']) assert(!pages.resourcesForPage(page).has('formSubmissions'));
  const c = client(); const urls = [];
  global.fetch = async (url) => { urls.push(url); return response([{ id: String(url) }]); };
  const index = documents.scheduleSubmissionIndexOptions('alice');
  await Promise.all([c.fetchQuery(index), c.fetchQuery(index)]);
  const selected = documents.assignmentDocumentsOptions('alice', 'wo/a');
  await Promise.all([c.fetchQuery(selected), c.fetchQuery(selected)]);
  await c.fetchQuery(documents.assignmentDocumentsOptions('alice', 'wo-b'));
  assert.equal(urls.length, 3);
  assert(urls[0].endsWith('/form-submissions/views/schedule-index'));
  assert(urls[1].endsWith('/form-submissions/views/assignment/wo%2Fa'));
  assert(urls[2].endsWith('/form-submissions/views/assignment/wo-b'));
  assert.equal(c.getQueryData(cache.appDataKey('alice', 'formSubmissions')), undefined);
  assert.equal(c.getQueryData(documents.assignmentDocumentsOptions('bob', 'wo/a').queryKey), undefined);
  await c.invalidateQueries({ queryKey: cache.appDataKey('alice', 'formSubmissions') });
  assert(c.getQueryState(index.queryKey).isInvalidated);
  assert(c.getQueryState(selected.queryKey).isInvalidated);
  const blocked = client(); let attempts = 0;
  global.fetch = async () => { attempts++; return response({ message: 'forbidden' },403); };
  await assert.rejects(blocked.fetchQuery(documents.scheduleSubmissionIndexOptions('blocked')));
  assert.equal(attempts,1);
  assert.equal(blocked.getQueryData(documents.scheduleSubmissionIndexOptions('blocked').queryKey), undefined);
});

test('Schedule weeks, complete page records and Assignments filters have independent cancellable caches', async () => {
 const c=client(),calls=[];
 global.fetch=async(url,init)=>{calls.push({url,signal:init.signal});return response({readOnly:true,data:[],meta:{total:0}});};
 for(const page of ['scheduler','workorders'])assert(!pages.resourcesForPage(page).has('workOrders'),'No full history at entry');
 const current=assignmentPaging.scheduleScopeOptions('alice','2026-11-09','2026-11-15');
 const previous=assignmentPaging.scheduleScopeOptions('alice','2026-11-02','2026-11-08');
 const older=assignmentPaging.scheduleScopeOptions('alice','2026-10-26','2026-11-01');
 await Promise.all([c.fetchQuery(current),c.fetchQuery(current)]);await c.fetchQuery(previous);await c.fetchQuery(older);await c.fetchQuery(current);
 assert.equal(calls.length,3);assert(calls[1].url.includes('from=2026-11-02&to=2026-11-08'));assert(calls[2].url.includes('from=2026-10-26&to=2026-11-01'));assert(calls.every(call=>call.signal instanceof AbortSignal));
 const filters={search:'Traffic %_',from:'2026-11-09',to:'2026-11-15',sortBy:'project',sortDir:'asc'};
 await c.fetchQuery(assignmentPaging.assignmentPageOptions('alice',filters,1));await c.fetchQuery(assignmentPaging.assignmentPageOptions('alice',filters,2));
 assert(calls.at(-1).url.includes('page=2'));assert(calls.at(-1).url.includes('search=Traffic+%25_'));
 assert.equal(c.getQueryData(cache.appDataKey('alice','workOrders')),undefined);
 assert.equal(c.getQueryData(assignmentPaging.scheduleScopeOptions('bob','2026-11-09','2026-11-15').queryKey),undefined);
 await c.invalidateQueries({queryKey:cache.appDataKey('alice','workOrders')});assert(c.getQueryState(current.queryKey).isInvalidated);assert.equal(calls.length,5,'Inactive weeks do not refetch');
});
test('editable snapshots exclude range/conflict projections and use the freshest complete siblings', async () => {
 const c=client(),scope=assignmentPaging.scheduleScopeOptions('alice','2026-11-09','2026-11-15'),index=assignmentPaging.conflictIndexOptions('alice');
 c.setQueryData(scope.queryKey,{readOnly:true,data:[{id:'wo',shifts:[{id:'visible-only'}]}]},{updatedAt:500});
 c.setQueryData(index.queryKey,{readOnly:true,data:[{id:'wo',shifts:[{id:'timing-only'}]}]},{updatedAt:600});
 assert.equal(assignmentPaging.completeAssignmentSnapshot(c,'alice','wo'),undefined);
 const complete={id:'wo',shifts:[{id:'visible'},{id:'approved-other-week',pmApprovedAt:'2026-12-10'}]};
 c.setQueryData(assignmentPaging.assignmentRecordsOptions('alice',['wo']).queryKey,[complete],{updatedAt:300});
 c.setQueryData(cache.appDataKey('alice','workOrders'),[{id:'wo',shifts:[{id:'stale'}]}],{updatedAt:200});
 assert.deepEqual(assignmentPaging.completeAssignmentSnapshot(c,'alice','wo'),complete);
 assert.equal(assignmentPaging.completeAssignmentSnapshot(c,'bob','wo'),undefined);
 cache.updateAppResource(c,'bob','workOrders',previous=>[...previous,complete],[]);
 assert.equal(c.getQueryData(cache.appDataKey('bob','workOrders')),undefined,'Scoped writes never seed partial histories');
 const bobRecords=assignmentPaging.assignmentRecordsOptions('bob',['wo']);c.setQueryData(bobRecords.queryKey,[complete]);
 const addedShift={id:'second-write',notes:'keep on next action'};
 cache.updateAppResource(c,'bob','workOrders',previous=>previous.map(row=>({...row,shifts:[...row.shifts,addedShift]})),[]);
 assert.equal(c.getQueryData(cache.appDataKey('bob','workOrders')),undefined);
 assert.deepEqual(assignmentPaging.completeAssignmentSnapshot(c,'bob','wo').shifts.at(-1),addedShift,'Successful writes update complete pages immediately');
 const empty=client();assert.equal(assignmentPaging.hasAssignmentRead(empty,'alice'),false);
 empty.setQueryData(index.queryKey,{data:[]});assert.equal(assignmentPaging.hasAssignmentRead(empty,'alice'),false,'A conflict projection cannot enable edits');
});

(async () => {
  console.error = () => {};
  try {
    for (const [name, run] of tests) { await run(); console.log('PASS', name); }
    console.log(tests.length + ' cache and realtime checks passed.');
  } finally { console.error = quiet; clients.forEach((c) => c.clear()); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
