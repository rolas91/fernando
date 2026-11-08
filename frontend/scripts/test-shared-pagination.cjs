const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { load, paginationHarness } = require('./pagination-harness.cjs');
const utils = load('lib/pagination.ts');
const Pager = load('components/shared/DataPagination.tsx', { '@/lib/pagination': utils }).default;
const render = paginationHarness();
let state = render('week1', 180);
state.setPage(4); state = render('week1', 180); assert.equal(state.page, 4);
state.setPageSize(50); state = render('week1', 180); assert.equal(state.page, 1); assert.equal(state.pageSize, 50);
state.setPage(3); state = render('week2', 180); assert.equal(state.page, 1); assert.equal(state.pageSize, 50);
state = render('week1', 180); assert.equal(state.page, 1);
state = render('week2', 180); assert.equal(state.page, 1);
state.setPage(4); state = render('week2', 51); assert.equal(state.page, 2);
state.setPageSize(10000); state = render('week2', 51); assert.equal(state.pageSize, 50);
state = render('empty', 0); assert.equal(state.page, 1);
for (const initial of [7, 30]) {
  const legacy = paginationHarness(); let value = legacy('scope', 100, initial);
  assert.equal(value.pageSize, initial); value.setPageSize(10); value = legacy('scope', 100, initial); assert.equal(value.pageSize, 10);
}
function nodes(element, type) {
  if (!element || typeof element !== 'object') return [];
  return [...(element.type === type ? [element] : []), ...React.Children.toArray(element.props?.children).flatMap(child => nodes(child, type))];
}
let selected, page;
const props = { page: 2, pageSize: 25, total: 86, onPage: value => page = value, onPageSize: value => selected = value };
const tree = Pager(props);
const select = nodes(tree, 'select')[0]; assert.deepEqual(nodes(select, 'option').map(node => node.props.value), [10, 25, 50]);
select.props.onChange({ target: { value: '50' } }); assert.equal(selected, 50);
nodes(tree, 'button').find(node => node.props.children === 'Next').props.onClick(); assert.equal(page, 3);
for (const [total, current, size, expected] of [[0, 1, 25, '0–0 of 0'], [86, 4, 25, '76–86 of 86'], [86, 2, 50, '51–86 of 86']]) {
  assert(renderToStaticMarkup(React.createElement(Pager, { ...props, total, page: current, pageSize: size })).includes(expected));
}
for (const size of [7, 30]) assert(nodes(Pager({ ...props, pageSize: size }), 'option').some(node => node.props.value === size));
assert(nodes(Pager({ ...props, busy: true }), 'button').every(node => node.props.disabled));
assert(nodes(Pager({ ...props, total: undefined }), 'button').every(node => node.props.disabled));
assert.deepEqual(utils.paginationNumbers(40, 100), [1, 39, 40, 41, 100]);
const mockDb = { fetchAssignmentPage: (...args) => args };
const options = load('lib/assignmentPaging.ts', { './db': mockDb, './appDataQueries': { appDataKey: id => ['app', id, 'workOrders'], shouldRetryAppRead: () => false } });
const signal = new AbortController().signal;
const small = options.assignmentPageOptions('user', { from: '2026-11-02' }, 1, 10), large = options.assignmentPageOptions('user', { from: '2026-11-02' }, 1, 50);
assert.notDeepEqual(small.queryKey, large.queryKey); assert.equal(large.queryFn({ signal })[3], 50);
const db = load('lib/db.ts', { './googlePlaceAddress': { DEFAULT_ASSIGNMENT_COUNTRY: 'USA' }, './authErrors': { AUTH_MESSAGES: {}, announceSessionExpired() {} }, 'socket.io-client': { io() {} } });
global.localStorage = { getItem: () => 'test-token' };
(async () => {
  const calls = [];
  global.fetch = async (url, init) => {
    const ids = JSON.parse(new URL(url, 'http://localhost').searchParams.get('ids')); calls.push({ ids, signal: init.signal });
    return { ok: true, status: 200, json: async () => ids.map(id => ({ id, shifts: [{ id: 'visible' }, { id: 'approved-sibling', pmApprovedAt: 'approved' }] })) };
  };
  const ids = Array.from({ length: 50 }, (_, i) => 'wo' + i);
  const full = await db.fetchCompleteAssignmentRecords(ids, signal);
  assert.deepEqual(calls.map(call => call.ids.length), [32, 18]); assert(calls.every(call => call.signal === signal));
  assert.deepEqual(full.map(row => row.id), ids); assert(full.every(row => row.shifts[1].pmApprovedAt));
  global.fetch = async () => { throw new Error('network failed'); };
  const previousError = console.error; console.error = () => {};
  try { await assert.rejects(db.fetchCompleteAssignmentRecords(ids, signal)); } finally { console.error = previousError; }
  const schedule = fs.readFileSync(path.join(__dirname, '../src/components/scheduler/SchedulerCalendarView.tsx'), 'utf8');
  const stats = schedule.slice(schedule.indexOf('const weekStats ='), schedule.indexOf('const headerDateLabel ='));
  assert(stats.includes('workOrdersWithEffectiveStatus.filter')); assert(stats.includes('dateStrsForFiltering')); assert(!stats.includes('pageSummaries')); assert(!stats.includes('visibleWOs'));
  console.log('Shared pagination: size changes, week reset, deletion clamp, legacy defaults, callbacks, cache isolation, complete 50-record batches and page-independent Schedule cards passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });
