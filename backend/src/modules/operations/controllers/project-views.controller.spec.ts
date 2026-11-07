import { join } from 'path';
import { DataSource } from 'typeorm';
import { Project } from '../../../entities/project.entity';
import { Client } from '../../../entities/client.entity';
import { Worker } from '../../../entities/worker.entity';
import { WorkOrder } from '../../../entities/work-order.entity';
import { StatusCatalog } from '../../../entities/status-catalog.entity';
import { ProjectViewsController } from './project-views.controller';
import type { UserAccessContext } from '../../access/ports/access.port';
import type { Request } from 'express';
const request = {
  user: {
    permissions: [
      'projects.read',
      'clients.read',
      'work-orders.read',
      'workers.read',
    ],
  } as UserAccessContext,
} as Request & { user: UserAccessContext };

describe('scoped project views', () => {
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
  it('filters calendar projects by actual shifts in the inclusive range, retaining global project dates and complete day counts', async () => {
    const project = {
      id: 'p',
      clientId: 'c',
      name: 'Long project',
      startDate: '2024-01-01',
      endDate: '2028-01-01',
    } as Project;
    const projects = source.getRepository(Project),
      orders = source.getRepository(WorkOrder),
      clients = source.getRepository(Client);
    const projectQuery = projects.createQueryBuilder('item'),
      dayQuery = orders.createQueryBuilder('wo');
    jest.spyOn(projects, 'createQueryBuilder').mockReturnValue(projectQuery);
    jest.spyOn(projectQuery, 'getMany').mockResolvedValue([project]);
    jest.spyOn(orders, 'createQueryBuilder').mockReturnValue(dayQuery);
    jest
      .spyOn(dayQuery, 'getRawMany')
      .mockResolvedValue([
        { projectId: 'p', date: '2026-11-05', shifts: '7', workers: '15' },
      ]);
    const fullOrderRead = jest.spyOn(orders, 'find'),
      fullWorkerRead = jest.spyOn(source.getRepository(Worker), 'find');
    jest
      .spyOn(clients, 'find')
      .mockResolvedValue([{ id: 'c', name: 'Client' }] as Client[]);
    const result = await new ProjectViewsController(source).calendar(
      {
        from: '2026-11-01',
        to: '2026-11-07',
        search: '50%_',
        status: 'confirmed',
        sort: 'name',
        direction: 'desc',
      },
      request,
    );
    expect(result.projects).toEqual([project]);
    expect(result.days).toEqual([
      { projectId: 'p', date: '2026-11-05', shifts: 7, workers: 15 },
    ]);
    const [sql, params] = projectQuery.getQueryAndParameters();
    expect(sql).toContain('EXISTS (SELECT 1 FROM work_orders');
    expect(sql).toContain('wo.deleted_at IS NULL');
    expect(sql).toContain('s.date BETWEEN');
    expect(sql).toContain('LOWER("item"."name") DESC');
    expect(params).toEqual([
      '%50\\%\\_%',
      'confirmed',
      '2026-11-01',
      '2026-11-07',
    ]);
    expect(dayQuery.getSql()).toContain('COUNT(DISTINCT \"s\".\"id\")');
    expect(dayQuery.getSql()).toContain('COUNT(DISTINCT \"rw\".\"worker_id\")');
    expect(dayQuery.getSql()).toContain('"wo"."deleted_at" IS NULL');
    expect(clients.find).toHaveBeenCalledWith(
      expect.objectContaining({ select: { id: true, name: true } }),
    );
    expect(fullOrderRead).not.toHaveBeenCalled();
    expect(fullWorkerRead).not.toHaveBeenCalled();
  });
  it('returns all-project counters independently of the assignment page, without downloading full shifts or worker profiles', async () => {
    const projects = source.getRepository(Project),
      orders = source.getRepository(WorkOrder),
      workers = source.getRepository(Worker),
      clients = source.getRepository(Client);
    jest
      .spyOn(projects, 'findOne')
      .mockResolvedValue({ id: 'p', clientId: 'c' } as Project);
    jest
      .spyOn(clients, 'findOne')
      .mockResolvedValue({ id: 'c', name: 'Client' } as Client);
    const assignmentQuery = orders.createQueryBuilder('wo'),
      workerQuery = workers.createQueryBuilder('worker');
    jest.spyOn(orders, 'createQueryBuilder').mockReturnValue(assignmentQuery);
    jest.spyOn(assignmentQuery, 'clone').mockReturnValue(assignmentQuery);
    jest.spyOn(assignmentQuery, 'getCount').mockResolvedValue(153);
    jest
      .spyOn(assignmentQuery, 'getRawMany')
      .mockResolvedValue([
        {
          id: 'wo26',
          title: 'Assignment',
          orderNumber: '26',
          startDate: '2026-11-05',
          endDate: '2026-11-06',
          shiftCount: '30',
          assigned: '75',
          required: '90',
        },
      ]);
    jest.spyOn(workers, 'createQueryBuilder').mockReturnValue(workerQuery);
    jest.spyOn(workerQuery, 'clone').mockReturnValue(workerQuery);
    jest.spyOn(workerQuery, 'getCount').mockResolvedValue(204);
    jest
      .spyOn(workerQuery, 'getMany')
      .mockResolvedValue([
        { id: 'w', firstName: 'Ana', lastName: 'Test', type: 'Lead' },
      ] as Worker[]);
    const result = await new ProjectViewsController(source).detail(
      'p',
      '2',
      request,
    );
    expect(result.assignments.meta).toEqual({
      page: 2,
      limit: 25,
      total: 153,
      totalPages: 7,
    });
    expect(result.assignments.data[0]).toMatchObject({
      shiftCount: 30,
      assigned: 75,
      required: 90,
    });
    expect(result.workerCount).toBe(204);
    expect(result.workers).toHaveLength(1);
    const [sql, params] = assignmentQuery.getQueryAndParameters();
    expect(sql).toContain('LIMIT 25 OFFSET 25');
    expect(sql).toContain('"wo"."deleted_at" IS NULL');
    expect(sql).toContain('COUNT(*) FROM work_order_shifts');
    expect(sql).toContain('SUM(r.required_count)');
    expect(params).toEqual(['p']);
    expect(sql).not.toContain('wo.*');
    expect(workerQuery.getSql()).toContain('EXISTS');
    expect(workerQuery.getSql()).toContain('LIMIT 8');
    expect(workerQuery.getSql()).toContain('wo.deleted_at IS NULL');
    expect(workerQuery.getSql()).not.toContain('hourly_rate');
  });
  it('returns an empty calendar without requesting labels or assignment history', async () => {
    const projects = source.getRepository(Project),
      query = projects.createQueryBuilder('item');
    jest.spyOn(projects, 'createQueryBuilder').mockReturnValue(query);
    jest.spyOn(query, 'getMany').mockResolvedValue([]);
    const orders = jest.spyOn(
      source.getRepository(WorkOrder),
      'createQueryBuilder',
    );
    const clients = jest.spyOn(source.getRepository(Client), 'find');
    expect(
      await new ProjectViewsController(source).calendar(
        { from: '2026-11-01', to: '2026-11-07' },
        request,
      ),
    ).toEqual({ projects: [], clients: [], days: [] });
    expect(orders).not.toHaveBeenCalled();
    expect(clients).not.toHaveBeenCalled();
  });
  it('uses configured project status sorting for calendar results', async () => {
    const projects = source.getRepository(Project),
      query = projects.createQueryBuilder('item');
    jest.spyOn(projects, 'createQueryBuilder').mockReturnValue(query);
    jest.spyOn(query, 'getMany').mockResolvedValue([]);
    jest.spyOn(source.getRepository(StatusCatalog), 'find').mockResolvedValue([
      { value: 'custom', name: 'Custom', sortOrder: 1 },
      { value: 'confirmed', name: 'Confirmed', sortOrder: 2 },
    ] as StatusCatalog[]);
    await new ProjectViewsController(source).calendar(
      { from: '2026-11-01', to: '2026-11-07', sort: 'status' },
      request,
    );
    expect(query.getQueryAndParameters()[1]).toEqual([
      '2026-11-01',
      '2026-11-07',
      'custom',
      'confirmed',
    ]);
  });
  it('rejects invalid ranges, unbounded calendars, invalid pagination and missing related permissions before reads', async () => {
    const controller = new ProjectViewsController(source),
      reads = jest.spyOn(source, 'getRepository');
    for (const input of [
      {},
      { from: '2026-02-30', to: '2026-03-02' },
      { from: '2026-11-07', to: '2026-11-01' },
      { from: '2024-01-01', to: '2026-11-01' },
    ])
      await expect(controller.calendar(input, request)).rejects.toThrow();
    await expect(controller.detail('p', '0', request)).rejects.toThrow(
      'positive integers',
    );
    const limited = { user: { permissions: ['projects.read'] } } as never;
    await expect(
      controller.calendar({ from: '2026-11-01', to: '2026-11-07' }, limited),
    ).rejects.toThrow('related datasets');
    await expect(controller.detail('p', '1', limited)).rejects.toThrow(
      'related datasets',
    );
    expect(reads).not.toHaveBeenCalled();
  });
  it('returns not found before loading assignment or worker metadata', async () => {
    jest
      .spyOn(source.getRepository(Project), 'findOne')
      .mockResolvedValue(null);
    const assignments = jest.spyOn(
      source.getRepository(WorkOrder),
      'createQueryBuilder',
    );
    await expect(
      new ProjectViewsController(source).detail('missing', '1', request),
    ).rejects.toThrow('not found');
    expect(assignments).not.toHaveBeenCalled();
  });
});
