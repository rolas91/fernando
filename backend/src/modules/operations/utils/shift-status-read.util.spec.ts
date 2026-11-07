jest.mock('../../integrations/integrations.service', () => ({
  IntegrationsService: class IntegrationsService {},
}));
import { join } from 'path';
import { DataSource } from 'typeorm';
import { WorkOrderShift } from '../../../entities/work-order-shift.entity';
import { WorkOrderShiftRole } from '../../../entities/work-order-shift-role.entity';
import { WorkOrderShiftRoleWorker } from '../../../entities/work-order-shift-role-worker.entity';
import { FormSubmission } from '../../../entities/form-submission.entity';
import { WorkOrder } from '../../../entities/work-order.entity';
import { Project } from '../../../entities/project.entity';
import { Client } from '../../../entities/client.entity';
import { loadShiftStatusIndex } from './shift-status-read.util';
import {
  aggregateShiftStatuses,
  computeShiftStatus,
} from './shift-status.util';
import { businessDate } from './shift-date.util';
import { ShiftStatusService } from '../services/shift-status.service';
import { ShiftsReadController } from '../controllers/shifts-read.controller';

describe('compact shift reads and pagination', () => {
  let source: DataSource;
  const originalZone = process.env.BUSINESS_TIME_ZONE;
  beforeAll(async () => {
    source = new DataSource({
      type: 'postgres',
      entities: [join(__dirname, '../../../entities/*.entity.ts')],
    });
    await (
      source as unknown as { buildMetadatas(): Promise<void> }
    ).buildMetadatas();
  });
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(Date.parse('2026-11-06T20:00:00Z'));
    process.env.BUSINESS_TIME_ZONE = 'America/Los_Angeles';
  });
  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
    if (originalZone === undefined) delete process.env.BUSINESS_TIME_ZONE;
    else process.env.BUSINESS_TIME_ZONE = originalZone;
  });
  function setup(count = 8) {
    const rows = Array.from({ length: count }, (_, i) => ({
      id: 's' + String(i).padStart(2, '0'),
      workOrderId: 'wo',
      date: '2026-11-06',
      status: 'ready_to_notify',
      cancelled: i === 3,
      pmApprovedAt: i === 4 ? new Date('2026-11-06T18:00:00Z') : null,
      shiftName: 'Crew 50%_',
      startTime: '08:00',
      projectId: 'p',
      projectNumber: '0593',
      projectName: 'Traffic',
      clientName: 'Client',
      title: 'Assignment',
      orderNumber: '42',
      assignmentStart: '2026-01-01',
      latestShift: null,
      creatorFirst: 'Ana',
      creatorLast: 'Creator',
    }));
    if (count === 8) {
      rows[0].status = 'customer_pending';
      rows[1].status = 'dispatch_pending';
      rows[5].date = '2099-11-06';
      rows[5].pmApprovedAt = new Date('2026-11-06T18:00:00Z');
      rows[7].status = 'unknown';
    }
    const roles = rows.map((row) => ({
      id: 'r' + row.id,
      shiftId: row.id,
      requiredCount: 2,
    }));
    const workers = rows
      .filter((_, i) => i !== 1)
      .map((row, i) => ({
        roleId: 'r' + row.id,
        workerId: 'w' + i,
        confirmationStatus: i % 2 ? 'pending' : 'confirmed',
        requestedAt: i % 2 ? new Date('2026-11-06T10:00:00Z') : null,
        notificationChannel: i % 2 ? 'sms' : null,
      }));
    const submissions = [{ workOrderId: 'wo', shiftId: 's06' }];
    const queries: Array<
      ReturnType<ReturnType<DataSource['getRepository']>['createQueryBuilder']>
    > = [];
    for (const entity of [
      WorkOrderShift,
      WorkOrderShiftRole,
      WorkOrderShiftRoleWorker,
      FormSubmission,
    ]) {
      const repo = source.getRepository(entity as typeof WorkOrderShift);
      const build = repo.createQueryBuilder.bind(repo);
      jest.spyOn(repo, 'createQueryBuilder').mockImplementation((alias) => {
        const query = build(alias);
        queries.push(query);
        const data =
          entity === WorkOrderShift
            ? alias === 'all_shift'
              ? [{ workOrderId: 'wo', latestShift: '2099-11-06T08:00' }]
              : rows
            : entity === WorkOrderShiftRole
              ? roles
              : entity === WorkOrderShiftRoleWorker
                ? workers
                : submissions;
        jest.spyOn(query, 'getRawMany').mockResolvedValue(data);
        return query;
      });
    }
    return { rows, roles, workers, submissions, queries };
  }
  it('maps minimal inputs to the exact existing classifier and counters in four bounded queries', async () => {
    const fixture = setup();
    const result = await loadShiftStatusIndex(source.manager, {
      from: '2026-11-01',
      to: '2026-11-07',
    });
    const completion = {
      isShiftCompleted: (wo: string, id: string) =>
        fixture.submissions.some(
          (row) => row.workOrderId === wo && row.shiftId === id,
        ),
    };
    const legacy = fixture.rows.map((row) => ({
      ...row,
      pmApprovedAt: row.pmApprovedAt?.toISOString(),
      roles: fixture.roles
        .filter((role) => role.shiftId === row.id)
        .map((role) => ({
          ...role,
          assignedWorkers: fixture.workers
            .filter((worker) => worker.roleId === role.id)
            .map((worker) => worker.workerId),
          workerConfirmations: fixture.workers
            .filter((worker) => worker.roleId === role.id)
            .map((worker) => ({
              workerId: worker.workerId,
              status: worker.confirmationStatus,
              requestedAt: worker.requestedAt?.toISOString(),
              notificationChannel: worker.notificationChannel || undefined,
            })),
        })),
    }));
    expect(result.shifts.map((row) => row.effectiveStatus)).toEqual(
      legacy.map(
        (shift) =>
          computeShiftStatus({ workOrderId: 'wo', shift, completion }).status,
      ),
    );
    expect(result.counters).toEqual(
      aggregateShiftStatuses({ workOrderId: 'wo', shifts: legacy, completion }),
    );
    expect(result.shifts[3].effectiveStatus).toBe('shift_cancelled');
    expect(result.shifts[4].effectiveStatus).toBe('pm_approved');
    expect(result.shifts[5].effectiveStatus).not.toBe('pm_approved');
    expect(result.shifts[6].effectiveStatus).toBe('shift_completed');
    expect(fixture.queries).toHaveLength(4);
    for (const query of fixture.queries) {
      const sql = query.getSql();
      expect(sql.replaceAll('"', '')).toContain('deleted_at IS NULL');
      expect(sql).toContain('"s"."date" >=');
      expect(sql).toContain('"s"."date" <=');
      expect(sql).not.toContain('planned_equipment');
      expect(sql).not.toContain('"submission"."data"');
      expect(query.getParameters()).toMatchObject({
        from: '2026-11-01',
        to: '2026-11-07',
      });
    }
  });
  it('serves Schedule stats without per-assignment hydration and preserves open-ended ranges', async () => {
    const fixture = setup();
    const service = Object.create(
      ShiftStatusService.prototype,
    ) as ShiftStatusService;
    const hydrate = jest.fn();
    Object.assign(service, {
      workOrdersRepo: { manager: source.manager },
      shiftsQuery: { loadShiftsForWorkOrder: hydrate },
    });
    const stats = await service.computeStats({ from: '2026-11-01' });
    expect(stats.counters.totalShifts).toBe(8);
    expect(stats.from).toBe('2026-11-01');
    expect(stats.to).toBeNull();
    expect(hydrate).not.toHaveBeenCalled();
    expect(fixture.queries).toHaveLength(4);
    expect(
      fixture.queries.every(
        (query) => !Object.hasOwn(query.getParameters(), 'to'),
      ),
    ).toBe(true);
  });
  it('paginates only hydrated shift records and keeps literal search, independent project filters and global export options', async () => {
    const fixture = setup(40);
    const orders = source.getRepository(WorkOrder),
      projects = source.getRepository(Project),
      clients = source.getRepository(Client);
    jest
      .spyOn(orders, 'find')
      .mockResolvedValue([
        { id: 'wo', projectId: 'p', title: 'Assignment' },
      ] as WorkOrder[]);
    jest
      .spyOn(projects, 'find')
      .mockResolvedValue([
        { id: 'p', number: '0593', name: 'Traffic', clientId: 'c' },
      ] as Project[]);
    jest
      .spyOn(clients, 'find')
      .mockResolvedValue([{ id: 'c', name: 'Client' }] as Client[]);
    const hydrate = jest.fn(
      async (_ids: string[], _range: unknown, ids: string[]) =>
        new Map([
          [
            'wo',
            fixture.rows
              .filter((row) => ids.includes(row.id))
              .map((row) => ({ ...row, roles: [] })),
          ],
        ]),
    );
    const controller = new ShiftsReadController(
      source,
      { loadShiftsForWorkOrders: hydrate } as never,
      {} as never,
      {} as never,
      {} as never,
    );
    const req = {
      user: {
        permissions: ['work-orders.read', 'projects.read', 'clients.read'],
      },
    } as never;
    const page = await controller.list(
      { page: '2', search: '50%_', projectNumber: 'p', projectName: 'p' },
      req,
    );
    expect(page.rows).toHaveLength(15);
    expect(page.meta).toEqual({ page: 2, limit: 25, total: 40, totalPages: 2 });
    expect(hydrate.mock.calls[0][2]).toHaveLength(15);
    expect(page.rows[0].workOrder.shifts).toEqual([]);
    expect(fixture.queries).toHaveLength(5);
    const latest = fixture.queries.find(
      (query) => query.alias === 'all_shift',
    )!;
    expect(latest.getSql()).toContain('MAX(');
    expect(latest.getSql()).toContain('GROUP BY');
    const empty = await controller.list(
      { projectNumber: 'p', projectName: 'other' },
      req,
    );
    expect(empty.meta.total).toBe(0);
    expect(empty.rows).toEqual([]);
    const metrics = await controller.metrics(req);
    expect(metrics.statusCounts.All).toBe(40);
    expect(metrics.approvedProjectIds).toContain('p');
    expect(metrics.projects[0].id).toBe('p');
  });
  it('paginates each board column independently in one compact index read', async () => {
    const fixture = setup(120);
    jest
      .spyOn(source.getRepository(WorkOrder), 'find')
      .mockResolvedValue([{ id: 'wo', projectId: 'p' }] as WorkOrder[]);
    jest
      .spyOn(source.getRepository(Project), 'find')
      .mockResolvedValue([{ id: 'p', clientId: 'c' }] as Project[]);
    jest
      .spyOn(source.getRepository(Client), 'find')
      .mockResolvedValue([{ id: 'c' }] as Client[]);
    const hydrate = jest.fn(
      async (_ids: string[], _range: unknown, ids: string[]) =>
        new Map([
          [
            'wo',
            fixture.rows
              .filter((row) => ids.includes(row.id))
              .map((row) => ({ ...row, roles: [] })),
          ],
        ]),
    );
    const controller = new ShiftsReadController(
      source,
      { loadShiftsForWorkOrders: hydrate } as never,
      {} as never,
      {} as never,
      {} as never,
    );
    const result = await controller.list(
      { mode: 'board', pages: JSON.stringify({ 'Workers Confirmed': 2 }) },
      {
        user: {
          permissions: ['work-orders.read', 'projects.read', 'clients.read'],
        },
      } as never,
    );
    expect(result.columns['Workers Confirmed'].page).toBe(2);
    expect(result.columns['Workers Confirmed'].total).toBeGreaterThan(25);
    expect(result.columns['Awaiting Response'].page).toBe(1);
    expect(
      result.rows.filter(
        (row) => row.shift.effectiveStatus === 'workers_confirmed',
      ),
    ).toHaveLength(25);
    expect(result.rows.length).toBeLessThanOrEqual(8 * 25);
    expect(fixture.queries).toHaveLength(5);
  });
  it('opens a complete assignment with approved siblings, scoped form data and current effective status', async () => {
    const orders = {
      findOne: jest.fn(async () => ({
        id: 'wo',
        projectId: 'p',
        shifts: [
          { id: 'selected' },
          { id: 'approved-sibling', pmApprovedAt: '2026-11-01' },
        ],
      })),
    };
    const submissions = {
      findForShiftRead: jest.fn(async () => [{ id: 'form', shiftId: '' }]),
    };
    const status = {
      computeShiftForWorkOrder: jest.fn(async () => ({
        status: 'dispatch_pending',
      })),
    };
    jest
      .spyOn(source.getRepository(Project), 'findOne')
      .mockResolvedValue({ id: 'p', clientId: 'c' } as Project);
    jest
      .spyOn(source.getRepository(Client), 'findOne')
      .mockResolvedValue({ id: 'c' } as Client);
    const controller = new ShiftsReadController(
      source,
      {} as never,
      orders as never,
      submissions as never,
      status as never,
    );
    const actor = {
      permissions: [
        'work-orders.read',
        'projects.read',
        'clients.read',
        'form-submissions.read',
      ],
    };
    const result = await controller.detail('wo', 'selected', {
      user: actor,
    } as never);
    expect(result.workOrder.shifts).toHaveLength(2);
    expect(result.workOrder.shifts[1]).toMatchObject({
      id: 'approved-sibling',
      pmApprovedAt: '2026-11-01',
    });
    expect(result.workOrder.shifts[0].effectiveStatus).toBe('dispatch_pending');
    expect(submissions.findForShiftRead).toHaveBeenCalledWith(
      'wo',
      'selected',
      actor,
    );
    await expect(
      controller.detail('wo', 'missing', { user: actor } as never),
    ).rejects.toThrow('not found');
  });
  it('rejects invalid filters/ranges/permissions before any status read', async () => {
    const reads = jest.spyOn(source.manager, 'getRepository');
    const controller = new ShiftsReadController(
      source,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    const req = {
      user: {
        permissions: ['work-orders.read', 'projects.read', 'clients.read'],
      },
    } as never;
    for (const input of [
      { page: '0' },
      { mode: 'unknown' },
      { mode: 'board', pages: '[]' },
      { mode: 'board', pages: JSON.stringify({ 'Workers Confirmed': 0 }) },
      { mode: 'board', pages: JSON.stringify({ bogus: 1 }) },
      { status: 'bad' },
      { from: '2026-02-30', to: '2026-11-01' },
      { from: '2026-11-07', to: '2026-11-01' },
    ])
      await expect(controller.list(input, req)).rejects.toThrow();
    await expect(
      controller.list({}, { user: { permissions: [] } } as never),
    ).rejects.toThrow('permissions');
    expect(reads).not.toHaveBeenCalled();
  });
  it('caches only the timezone formatter, never the business date or the selected timezone', () => {
    expect(businessDate(new Date('2026-11-06T07:30:00Z'))).toBe('2026-11-05');
    expect(businessDate(new Date('2026-11-07T20:00:00Z'))).toBe('2026-11-07');
    process.env.BUSINESS_TIME_ZONE = 'UTC';
    expect(businessDate(new Date('2026-11-06T07:30:00Z'))).toBe('2026-11-06');
  });
});
