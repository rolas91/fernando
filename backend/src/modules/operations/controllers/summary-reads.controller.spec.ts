import { join } from 'path';
import type { Request } from 'express';
import { DataSource } from 'typeorm';
import { Timesheet } from '../../../entities/timesheet.entity';
import { Worker } from '../../../entities/worker.entity';
import { Project } from '../../../entities/project.entity';
import { Client } from '../../../entities/client.entity';
import { WorkOrder } from '../../../entities/work-order.entity';
import { WorkOrderShift } from '../../../entities/work-order-shift.entity';
import { Equipment } from '../../../entities/equipment.entity';
import { Incident } from '../../../entities/incident.entity';
import { FormTemplate } from '../../../entities/form-template.entity';
import { ActivityFeedItem } from '../../../entities/activity-feed.entity';
import type { UserAccessContext } from '../../access/ports/access.port';
import { OperationsReportsController } from './operations-reports.controller';
import { DashboardReadController } from './dashboard-read.controller';
const actor = {
  permissions: [
    'timesheets',
    'workers',
    'work-orders',
    'projects',
    'equipment',
    'incidents',
    'form-submissions',
    'form-templates',
    'company-settings',
    'clients',
    'activity-feed',
  ].map((resource) => resource + '.read'),
} as UserAccessContext;
const req = { user: actor } as Request & { user: UserAccessContext };
describe('Dashboard and Reports scoped reads', () => {
  let source: DataSource;
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
  function reportSetup() {
    const entries = Array.from({ length: 80 }, (_, i) => ({
      id: 't' + i,
      workerId: 'w' + i,
      projectId: 'p' + i,
      workOrderId: 'wo' + i,
      shiftId: 's' + i,
      date: '2026-11-06',
      clockIn: '06:00',
      status: 'pending',
      regularHours: '8',
      overtimeHours: '0',
      doubleTimeHours: '0',
    }));
    const rows = new Map<unknown, unknown[]>([
      [Timesheet, entries],
      [
        Worker,
        entries.map((_, i) => ({
          id: 'w' + i,
          firstName: 'Worker ' + i,
          lastName: 'Test',
          type: 'Lead',
          status: 'active',
          hourlyRate: '20.00',
        })),
      ],
      [
        Project,
        entries.map((_, i) => ({
          id: 'p' + i,
          name: 'Project ' + i,
          number: String(i),
          city: 'LA',
          status: 'confirmed',
        })),
      ],
      [
        WorkOrder,
        entries.map((_, i) => ({
          id: 'wo' + i,
          projectId: 'p' + i,
          startDate: '2026-11-01',
          endDate: '2026-11-10',
        })),
      ],
      [
        WorkOrderShift,
        entries.map((_, i) => ({
          id: 's' + i,
          workOrderId: 'wo' + i,
          date: '2026-11-06',
          startTime: '06:00',
          shiftName: 'Day',
        })),
      ],
      [
        Equipment,
        [
          { status: 'available', count: '99' },
          { status: 'assigned', count: '10' },
        ],
      ],
      [
        Incident,
        [
          { status: 'open', count: '3' },
          { status: 'resolved', count: '5' },
        ],
      ],
    ]);
    const queries = new Map<
      unknown,
      ReturnType<ReturnType<DataSource['getRepository']>['createQueryBuilder']>
    >();
    for (const [entity, data] of rows) {
      const repository = source.getRepository(entity as typeof Timesheet),
        query = repository.createQueryBuilder('temp');
      jest
        .spyOn(repository, 'createQueryBuilder')
        .mockImplementation((alias) => {
          query.expressionMap.mainAlias!.name = String(alias);
          return query;
        });
      jest.spyOn(query, 'getMany').mockResolvedValue(data as never);
      jest.spyOn(query, 'getRawMany').mockResolvedValue(data);
      queries.set(entity, query);
    }
    jest
      .spyOn(source.getRepository(FormTemplate), 'find')
      .mockResolvedValue([
        { id: 'known', name: 'Safety', category: 'Incident' },
      ] as FormTemplate[]);
    const prepareForRead = jest.fn(async () => {}),
      summaryForRange = jest.fn(async () => [
        { templateId: 'known', count: 12 },
        { templateId: 'missing', count: 2 },
      ]);
    const controller = new OperationsReportsController(
      source,
      { prepareForRead } as never,
      { prepareForRead } as never,
      { summaryForRange } as never,
      { findAll: async () => [] } as never,
    );
    return { controller, queries, summaryForRange, prepareForRead };
  }
  it('paginates report rows after complete totals and keeps source SQL restricted to internal period inputs', async () => {
    const { controller, queries, summaryForRange } = reportSetup();
    const result = await controller.read(
      {
        from: '2026-11-01',
        to: '2026-11-06',
        section: 'worker_hours',
        page: '2',
      },
      req,
    );
    expect(result.workerHours).toHaveLength(25);
    expect(result.meta).toEqual({
      page: 2,
      limit: 25,
      total: 80,
      totalPages: 4,
    });
    expect(result.workerTotals).toEqual({
      regular: 640,
      ot: 0,
      total: 640,
      pay: 12800,
    });
    expect(result.totalHours).toBe(640);
    expect(result.timesheetCount).toBe(80);
    expect(result.activeJobs).toBe(80);
    expect(result.forms).toMatchObject({
      total: 14,
      summary: [{ template: { id: 'known' }, count: 12 }],
    });
    expect(result.incidentCounts).toEqual({ total: 8, open: 3 });
    expect(result.workerHours[0].worker).not.toHaveProperty('hourlyRate');
    const timeQuery = queries.get(Timesheet)!;
    const [sql, params] = timeQuery.getQueryAndParameters();
    expect(sql).toContain('"t"."variant" = \'internal\'');
    expect(sql).toContain('BETWEEN');
    expect(params).toEqual(['2026-11-01', '2026-11-06']);
    expect(sql).not.toContain('signature');
    expect(sql).not.toContain('pm_approved');
    expect(queries.get(WorkOrder)!.getSql()).toContain('COALESCE(');
    expect(queries.get(WorkOrder)!.getSql()).toContain('deleted_at');
    expect(queries.get(WorkOrderShift)!.getSql()).toContain('t.shift_id =');
    expect(queries.get(WorkOrderShift)!.getSql()).not.toContain(
      'planned_equipment',
    );
    expect(summaryForRange).toHaveBeenCalledWith(
      '2026-11-01',
      '2026-11-06',
      actor,
    );
  });
  it('keeps project metadata and assignment counts while paging project summaries', async () => {
    const { controller } = reportSetup();
    const result = await controller.read(
      {
        from: '2026-11-01',
        to: '2026-11-06',
        section: 'project_summary',
        page: '2',
      },
      req,
    );
    expect(result.projectSummary).toHaveLength(25);
    expect(result.projectSummary[0]).toMatchObject({
      orders: 1,
      hours: 8,
      cost: 160,
      project: { city: 'LA' },
    });
    expect(result.meta.total).toBe(80);
  });
  it('returns only eight utilization rows on overview and all filtered rows for exports', async () => {
    const { controller } = reportSetup();
    const overview = await controller.read(
      { from: '2026-11-01', to: '2026-11-06' },
      req,
    );
    expect(overview.workerHours).toHaveLength(8);
    expect(overview.projectSummary).toEqual([]);
    const workers = await controller.export(
      {
        from: '2026-11-01',
        to: '2026-11-06',
        section: 'worker_hours',
        page: '2',
      },
      req,
    );
    expect(workers.workerHours).toHaveLength(80);
    expect(workers.projectSummary).toEqual([]);
    const projects = await controller.export(
      { from: '2026-11-01', to: '2026-11-06', section: 'project_summary' },
      req,
    );
    expect(projects.projectSummary).toHaveLength(80);
  });
  it('rejects missing permissions, invalid ranges, report kinds and pagination before reads', async () => {
    const reads = jest.spyOn(source, 'getRepository'),
      prepareForRead = jest.fn();
    const controller = new OperationsReportsController(
      source,
      { prepareForRead } as never,
      {} as never,
      {} as never,
      {} as never,
    );
    for (const query of [
      {},
      { from: '2026-02-30', to: '2026-11-06' },
      { from: '2026-11-06', to: '2026-11-01' },
      { from: '2026-11-01', to: '2026-11-06', section: 'bad' },
      { from: '2026-11-01', to: '2026-11-06', page: '-1' },
    ])
      await expect(controller.read(query, req)).rejects.toThrow();
    await expect(
      controller.read({ from: '2026-11-01', to: '2026-11-06' }, {
        user: { permissions: ['timesheets.read'] },
      } as never),
    ).rejects.toThrow('source datasets');
    expect(reads).not.toHaveBeenCalled();
    expect(prepareForRead).not.toHaveBeenCalled();
  });
  it('returns daily scoped assignments and complete counters with paginated local-day activity', async () => {
    const orders = source.getRepository(WorkOrder),
      query = orders.createQueryBuilder('wo');
    jest.spyOn(orders, 'createQueryBuilder').mockReturnValue(query);
    jest
      .spyOn(query, 'getMany')
      .mockResolvedValue([
        { id: 'wo', projectId: 'p', status: 'confirmed' },
      ] as WorkOrder[]);
    const activity = source.getRepository(ActivityFeedItem),
      activityQuery = activity.createQueryBuilder('activity');
    jest.spyOn(activity, 'createQueryBuilder').mockReturnValue(activityQuery);
    jest.spyOn(activityQuery, 'clone').mockReturnValue(activityQuery);
    jest.spyOn(activityQuery, 'getCount').mockResolvedValue(101);
    jest
      .spyOn(activityQuery, 'getMany')
      .mockResolvedValue([{ id: 'a' }] as ActivityFeedItem[]);
    const workers = source.getRepository(Worker);
    jest.spyOn(workers, 'count').mockResolvedValue(50);
    jest
      .spyOn(workers, 'find')
      .mockResolvedValue([
        { id: 'active', firstName: 'Ana', lastName: 'Test', type: 'Lead' },
      ] as Worker[]);
    jest.spyOn(source.getRepository(Equipment), 'count').mockResolvedValue(100);
    jest.spyOn(source.getRepository(Timesheet), 'count').mockResolvedValue(3);
    jest.spyOn(source.getRepository(Incident), 'count').mockResolvedValue(4);
    jest
      .spyOn(source.getRepository(Project), 'find')
      .mockResolvedValue([{ id: 'p', clientId: 'c' }] as Project[]);
    jest
      .spyOn(source.getRepository(Client), 'find')
      .mockResolvedValue([{ id: 'c' }] as Client[]);
    const loadShiftsForWorkOrders = jest.fn(
      async () =>
        new Map([
          [
            'wo',
            [
              {
                date: '2026-11-06',
                roles: [
                  { assignedWorkers: ['active', 'inactive', 'unknown'] },
                  { assignedWorkers: ['active'] },
                ],
                plannedEquipment: [{ type: 'Truck', estimatedQuantity: 2 }],
              },
              { date: '2025-01-01', roles: [] },
              { date: '2026-11-06', cancelled: true, roles: [] },
            ],
          ],
        ]),
    );
    const controller = new DashboardReadController(
      source,
      { loadShiftsForWorkOrders } as never,
      { prepareForRead: async () => {} } as never,
      { prepareForRead: async () => {} } as never,
    );
    const result = await controller.read(
      {
        date: '2026-11-06',
        activityFrom: '2026-11-06T06:00:00.000Z',
        activityTo: '2026-11-07T06:00:00.000Z',
        activityPage: '2',
      },
      req,
    );
    expect(result.workOrders[0].shifts).toHaveLength(1);
    expect(result.assignedWorkerCount).toBe(3);
    expect(result.assignedWorkers).toHaveLength(1);
    expect(result.activeWorkerCount).toBe(50);
    expect(result.equipmentCount).toBe(100);
    expect(result.pendingTimesheets).toBe(3);
    expect(result.openIncidents).toBe(4);
    expect(result.plannedEquipmentCount).toBe(2);
    expect(result.activity.meta).toEqual({
      page: 2,
      limit: 25,
      total: 101,
      totalPages: 5,
    });
    expect(loadShiftsForWorkOrders).toHaveBeenCalledWith(['wo'], {
      from: '2026-11-06',
      to: '2026-11-06',
    });
    expect(query.getSql()).toContain('s.cancelled = false');
    expect(query.getSql()).toContain('deleted_at');
    expect(query.getParameters()).toEqual({ date: '2026-11-06' });
    expect(activityQuery.getSql()).toContain('LIMIT 25 OFFSET 25');
    expect(activityQuery.getParameters()).toEqual({
      start: new Date('2026-11-06T06:00:00Z'),
      end: new Date('2026-11-07T06:00:00Z'),
    });
    expect(workers.find).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 6,
        select: { id: true, firstName: true, lastName: true, type: true },
      }),
    );
  });
  it('rejects unbounded activity windows and missing dashboard permissions', async () => {
    const reads = jest.spyOn(source, 'getRepository'),
      prepareForRead = jest.fn();
    const controller = new DashboardReadController(
      source,
      {} as never,
      { prepareForRead } as never,
      {} as never,
    );
    for (const query of [
      {},
      { date: '2026-11-06' },
      {
        date: '2026-11-06',
        activityFrom: '2026-01-01',
        activityTo: '2026-11-07',
      },
      {
        date: '2026-11-06',
        activityFrom: '2026-11-06T06:00:00Z',
        activityTo: '2026-11-06T05:00:00Z',
      },
    ])
      await expect(controller.read(query, req)).rejects.toThrow();
    await expect(
      controller.read({ date: '2026-11-06' }, {
        user: { permissions: [] },
      } as never),
    ).rejects.toThrow('source datasets');
    expect(reads).not.toHaveBeenCalled();
    expect(prepareForRead).not.toHaveBeenCalled();
  });
});
