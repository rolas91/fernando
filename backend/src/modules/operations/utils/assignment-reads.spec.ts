jest.mock('../../integrations/integrations.service', () => ({
  IntegrationsService: class {},
}));
import { join } from 'path';
import { DataSource, SelectQueryBuilder } from 'typeorm';
import { WorkOrder } from '../../../entities/work-order.entity';
import { WorkOrderShift } from '../../../entities/work-order-shift.entity';
import { AssignmentReadsController } from '../controllers/assignment-reads.controller';

describe('assignment page and weekly read contracts', () => {
  let source: DataSource;
  const req = {} as never;
  beforeAll(async () => {
    source = new DataSource({
      type: 'postgres',
      entities: [join(__dirname, '../../../entities/*.entity.ts')],
    });
    await (
      source as unknown as { buildMetadatas(): Promise<void> }
    ).buildMetadatas();
  });
  afterEach(() => jest.restoreAllMocks());
  function setup(count = 60) {
    const keys = Array.from({ length: count }, (_, i) => ({
      id: 'wo-' + String(i).padStart(3, '0'),
      startDate: '2026-11-' + String((i % 28) + 1).padStart(2, '0'),
      projectName: 'Project ' + String(i).padStart(3, '0'),
    }));
    const parents = keys.map((key) =>
      Object.assign(new WorkOrder(), {
        id: key.id,
        title: key.projectName,
        projectId: 'project',
        startDate: '2026-01-01',
        endDate: '2027-12-31',
        status: 'active',
      }),
    );
    const shifts = {
      loadShiftsForWorkOrders: jest.fn(
        (ids: string[], range?: { from: string; to: string }) =>
          Promise.resolve(
            new Map(
              ids.map((id) => [
                id,
                range
                  ? [{ id: id + '-visible', date: range.from }]
                  : [
                      { id: id + '-visible', date: '2026-11-13' },
                      {
                        id: id + '-approved-sibling',
                        date: '2026-12-10',
                        pmApprovedAt: '2026-12-10T20:00:00Z',
                      },
                    ],
              ]),
            ),
          ),
      ),
    };
    const orders = {
      findOne: jest.fn((id: string) =>
        Promise.resolve({
          ...parents[0],
          id,
          shifts: [{ id: 'all-siblings' }],
        }),
      ),
    };
    const queries: ReturnType<
      ReturnType<DataSource['getRepository']>['createQueryBuilder']
    >[] = [];
    const repo = source.getRepository(WorkOrder),
      build = repo.createQueryBuilder.bind(repo) as (
        alias?: string,
      ) => SelectQueryBuilder<WorkOrder>;
    jest.spyOn(repo, 'createQueryBuilder').mockImplementation((alias) => {
      const query = build(alias);
      queries.push(query);
      jest.spyOn(query, 'getRawMany').mockResolvedValue(keys);
      jest.spyOn(query, 'getRawAndEntities').mockResolvedValue({
        entities: parents.slice(0, 2),
        raw: [
          { latestShiftTimestamp: '2027-01-01T08:00' },
          { latestShiftTimestamp: '2028-01-01T08:00' },
        ],
      });
      return query;
    });
    const find = jest.spyOn(repo, 'find').mockImplementation((options) => {
      const ids = (options?.where as { id: { value: string[] } }).id.value;
      return Promise.resolve(
        parents.filter((parent) => ids.includes(parent.id)),
      );
    });
    jest.spyOn(repo, 'count').mockResolvedValue(1248);
    const controller = new AssignmentReadsController(
      source,
      shifts as never,
      orders as never,
    );
    return { controller, queries, shifts, orders, keys, find };
  }
  it('returns 25 full parents with all approved siblings while global totals remain complete', async () => {
    const f = setup();
    const result = await f.controller.page(
      {
        page: '2',
        sortBy: 'project',
        sortDir: 'desc',
        search: '50%_ &',
        from: '2026-11-09',
        to: '2026-11-15',
      },
      req,
    );
    const expected = [...f.keys]
      .sort((a, b) => b.projectName.localeCompare(a.projectName))
      .slice(25, 50)
      .map((row) => row.id);
    expect(result.data.map((row) => row.id)).toEqual(expected);
    expect(result.meta).toMatchObject({
      page: 2,
      limit: 25,
      total: 60,
      totalPages: 3,
      totalItems: 1248,
    });
    expect(
      result.data.every(
        (row) => row.shifts.length === 2 && row.shifts[1].pmApprovedAt,
      ),
    ).toBe(true);
    expect(f.shifts.loadShiftsForWorkOrders.mock.calls[0]).toHaveLength(1);
    const sql = f.queries[0].getSql().replaceAll('"', '');
    expect(sql).toContain('wo.deleted_at IS NULL');
    expect(sql).toContain('EXISTS');
    expect(sql).toContain('POSITION(');
    expect(sql).not.toContain('wo.notes');
    expect(f.queries[0].getParameters()).toMatchObject({
      search: '50%_ &',
      from: '2026-11-09',
      to: '2026-11-15',
    });
  });
  it('retains date ordering, all-history reads, grid date bounds and empty pages', async () => {
    const f = setup(40);
    let result = await f.controller.page(
      {
        page: '1',
        sortBy: 'date',
        sortDir: 'asc',
        calendarFrom: '2026-10-25',
        calendarTo: '2026-12-05',
      },
      req,
    );
    expect(result.data.map((row) => row.id)).toEqual(
      [...f.keys]
        .sort((a, b) => a.startDate.localeCompare(b.startDate))
        .slice(0, 25)
        .map((row) => row.id),
    );
    expect(f.queries[0].getParameters()).toMatchObject({
      calendarFrom: '2026-10-25',
      calendarTo: '2026-12-05',
    });
    expect(f.queries[0].getSql()).toContain('grid_shift');
    f.shifts.loadShiftsForWorkOrders.mockClear();
    result = await f.controller.page({ page: '9' }, req);
    expect(result.data).toEqual([]);
    expect(result.meta.total).toBe(40);
    expect(f.shifts.loadShiftsForWorkOrders).not.toHaveBeenCalled();
  });
  it('bounds schedule shifts in SQL/serializer and keeps empty overlapping parents plus global ordering metadata', async () => {
    const f = setup();
    const result = await f.controller.scheduleScope(
      '2026-11-09',
      '2026-11-15',
      req,
    );
    expect(result.readOnly).toBe(true);
    expect(result.data).toHaveLength(2);
    expect(result.data[1].latestShiftTimestamp).toBe('2028-01-01T08:00');
    expect(f.shifts.loadShiftsForWorkOrders).toHaveBeenCalledWith(
      ['wo-000', 'wo-001'],
      { from: '2026-11-09', to: '2026-11-15' },
    );
    const sql = f.queries[0].getSql().replaceAll('"', '');
    expect(sql).toContain('wo.start_date <=');
    expect(sql).toContain('OR EXISTS');
    expect(sql).toContain('wo.deleted_at IS NULL');
    expect(sql).not.toContain('wo.file_uploads');
  });
  it('hydrates only requested page IDs, preserves request order and never trims sibling shifts', async () => {
    const f = setup();
    const result = await f.controller.records(
      JSON.stringify(['wo-030', 'wo-001', 'wo-030']),
      req,
    );
    expect(result.map((row) => row.id)).toEqual(['wo-030', 'wo-001']);
    expect(result[0].shifts[1]).toHaveProperty('pmApprovedAt');
    expect(f.shifts.loadShiftsForWorkOrders.mock.calls[0]).toHaveLength(1);
  });
  it('keeps cross-page and cross-week timing/confirmation data without editable payloads', async () => {
    const f = setup(),
      repo = source.getRepository(WorkOrderShift),
      build = repo.createQueryBuilder.bind(repo) as (
        alias?: string,
      ) => SelectQueryBuilder<WorkOrderShift>;
    let sql = '';
    jest.spyOn(repo, 'createQueryBuilder').mockImplementation((alias) => {
      const query = build(alias);
      jest.spyOn(query, 'getRawMany').mockImplementation(() => {
        sql = query.getSql().replaceAll('"', '');
        return Promise.resolve([
          {
            workOrderId: 'outside-page',
            projectId: 'p',
            title: 'Other assignment',
            assignmentStatus: 'cancelled',
            id: 's-previous',
            date: '2026-10-01',
            startTime: '22:00',
            endTime: '06:00',
            status: 'shift_cancelled',
            cancelled: true,
            roleId: 'r',
            roleStart: '23:00',
            workerId: 'w1',
            confirmationStatus: 'confirmed',
          },
          {
            workOrderId: 'outside-page',
            projectId: 'p',
            title: 'Other assignment',
            assignmentStatus: 'cancelled',
            id: 's-previous',
            date: '2026-10-01',
            startTime: '22:00',
            endTime: '06:00',
            status: 'shift_cancelled',
            cancelled: true,
            roleId: 'r',
            roleStart: '23:00',
            workerId: 'w2',
            confirmationStatus: 'declined',
          },
        ]);
      });
      return query;
    });
    const result = await f.controller.conflicts(req);
    expect(result.readOnly).toBe(true);
    expect(result.data[0].status).toBe('cancelled');
    const shift = result.data[0].shifts[0] as {
      roles: {
        assignedWorkers: string[];
        workerConfirmations: { status: string }[];
      }[];
    };
    expect(shift.roles[0].assignedWorkers).toEqual(['w1', 'w2']);
    expect(shift.roles[0].workerConfirmations.map((row) => row.status)).toEqual(
      ['confirmed', 'declined'],
    );
    expect(sql).toContain('wo.deleted_at IS NULL');
    expect(sql).not.toContain('BETWEEN');
    expect(sql).not.toContain('notes');
    expect(sql).not.toContain('planned_equipment');
  });
  it('preserves complete single-record and notification chat reads outside the current page', async () => {
    const f = setup();
    const repo = source.getRepository(WorkOrderShift);
    jest
      .spyOn(repo, 'findOne')
      .mockResolvedValue({ workOrderId: 'off-page' } as WorkOrderShift);
    await f.controller.record('off-page', req);
    expect(f.orders.findOne).toHaveBeenLastCalledWith('off-page');
    await f.controller.shiftRecord('old-shift', req);
    expect(f.orders.findOne).toHaveBeenLastCalledWith('off-page');
    jest.spyOn(repo, 'findOne').mockResolvedValue(null);
    await expect(f.controller.shiftRecord('missing', req)).rejects.toThrow(
      'Shift not found',
    );
  });
  it('retains assignment access when optional catalogs are forbidden without searching protected labels', async () => {
    const f = setup();
    const result = await f.controller.page(
      { search: 'Traffic', sortBy: 'project' },
      { user: { permissions: ['work-orders.read'] } } as never,
    );
    expect(result.data).toHaveLength(25);
    const sql = f.queries[0].getSql().replaceAll('"', '');
    expect(sql).not.toContain('COALESCE(p.name');
    expect(sql).not.toContain('COALESCE(c.name');
    expect(sql).not.toContain('COALESCE(kind.name');
    expect(sql).toContain('COALESCE(wo.title');
  });
  it('rejects malformed ranges, excessive IDs, invalid sorting and missing source permissions before reads', async () => {
    const f = setup();
    await expect(
      f.controller.scheduleScope('2026-11-31', '2026-12-01', req),
    ).rejects.toThrow();
    await expect(
      f.controller.scheduleScope('2026-01-01', '2026-12-01', req),
    ).rejects.toThrow();
    await expect(f.controller.page({ sortBy: 'notes' }, req)).rejects.toThrow();
    expect(() =>
      f.controller.records(JSON.stringify(Array(33).fill('wo')), req),
    ).toThrow();
    expect(() => f.controller.records('[]broken', req)).toThrow();
    const denied = { user: { permissions: [] } } as never;
    await expect(f.controller.page({}, denied)).rejects.toThrow(
      'read permission',
    );
    expect(() =>
      f.controller.records('[]', { user: { permissions: [] } } as never),
    ).toThrow('read permission');
    expect(f.queries).toHaveLength(0);
  });
});
