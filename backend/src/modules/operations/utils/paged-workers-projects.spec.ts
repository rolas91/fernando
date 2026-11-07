import { join } from 'path';
import { DataSource } from 'typeorm';
import { Worker } from '../../../entities/worker.entity';
import { Project } from '../../../entities/project.entity';
import { Client } from '../../../entities/client.entity';
import { WorkOrder } from '../../../entities/work-order.entity';
import { StatusCatalog } from '../../../entities/status-catalog.entity';
import { WorkersService } from '../services/workers.service';
import { PagedListsController } from '../controllers/paged-lists.controller';
import { catalogQuery } from './paged-catalog.util';

describe('paged worker and project compatibility', () => {
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
  it('matches legacy worker type OR role and paginates before hydration', () => {
    const [sql, params] = catalogQuery(
      source.getRepository(Worker),
      'workers',
      { search: 'Lead', type: 'Supervisor', status: 'active' },
    )
      .skip(25)
      .take(25)
      .getQueryAndParameters();
    expect(sql).toContain('OR EXISTS (SELECT 1 FROM worker_worker_roles');
    expect(sql).toContain('string_agg(role.name');
    expect(sql).toContain('"item"."first_name"');
    expect(sql).toContain('LIMIT 25 OFFSET 25');
    expect(sql).not.toContain('LEFT JOIN');
    expect(params).toEqual(['%lead%', 'active', 'Supervisor']);
  });
  it('searches client names, handles null dates and binds configured project status order', () => {
    const repo = source.getRepository(Project);
    const [sql, params] = catalogQuery(repo, 'projects', {
      search: 'Client A',
      sort: 'date',
      direction: 'desc',
    }).getQueryAndParameters();
    expect(sql).toContain('SELECT client.name FROM clients client');
    expect(sql).toContain('"item"."start_date" DESC NULLS LAST');
    expect(params).toEqual(['%client a%']);
    const [statusSql, statuses] = catalogQuery(repo, 'projects', {
      sort: 'status',
      direction: 'desc',
      statusOrder: ['completed', 'pending'],
    }).getQueryAndParameters();
    expect(statusSql).toContain(
      'CASE "item"."status" WHEN $1 THEN 0 WHEN $2 THEN 1 ELSE 2147483647 END DESC',
    );
    expect(statuses).toEqual(['completed', 'pending']);
    expect(() =>
      catalogQuery(repo, 'projects', { sort: 'name; DROP TABLE projects' }),
    ).toThrow('Invalid project sort');
  });
  it('uses the existing worker serializer and preserves requested order and expiration dates', async () => {
    const find = jest.fn(async () => [
      {
        id: 'b',
        skills: [{ id: 'skill' }],
        workerRoles: [{ id: 'role' }],
        workerCertifications: [
          {
            certificationId: 'cert',
            expirationDate: '2027-01-01',
            certification: { id: 'cert', name: 'Traffic' },
          },
        ],
      },
      { id: 'a', skills: [], workerRoles: [], workerCertifications: [] },
    ]);
    const service = Object.create(WorkersService.prototype) as WorkersService;
    Object.assign(service, { workersRepo: { find } });
    const result = await service.findManyByIds(['a', 'b']);
    expect(result.map((row) => row.id)).toEqual(['a', 'b']);
    expect(result[1].certifications).toEqual([
      { id: 'cert', name: 'Traffic', expirationDate: '2027-01-01' },
    ]);
    expect(result[1].certificationAssignments).toEqual([
      { certificationId: 'cert', expirationDate: '2027-01-01' },
    ]);
    expect(result[1].workerRoleIds).toEqual(['role']);
    expect(result[1].skillIds).toEqual(['skill']);
    expect(find).toHaveBeenCalledWith(
      expect.objectContaining({
        relations: {
          workerCertifications: { certification: true },
          skills: true,
          workerRoles: true,
        },
      }),
    );
    find.mockClear();
    await service.findManyByIds([]);
    expect(find).not.toHaveBeenCalled();
  });
  it('batches large worker exports to avoid unbounded parameter lists', async () => {
    const find = jest.fn(async () => []);
    const service = Object.create(WorkersService.prototype) as WorkersService;
    Object.assign(service, { workersRepo: { find } });
    await service.findManyByIds(
      Array.from({ length: 1001 }, (_, index) => String(index)),
    );
    expect(find).toHaveBeenCalledTimes(3);
  });
  it('returns projected client labels and aggregate metrics instead of loading assignment history', async () => {
    const repo = source.getRepository(Project),
      original = repo.createQueryBuilder.bind(repo);
    const builders: ReturnType<typeof original>[] = [];
    jest.spyOn(repo, 'createQueryBuilder').mockImplementation((alias) => {
      const query = original(alias);
      builders.push(query);
      jest
        .spyOn(query, 'getManyAndCount')
        .mockResolvedValue([[{ id: 'p', clientId: 'c' } as Project], 51]);
      jest
        .spyOn(query, 'getRawMany')
        .mockResolvedValue([{ status: 'pending', count: '1000' }]);
      return query;
    });
    const clients = jest
      .spyOn(source.getRepository(Client), 'find')
      .mockResolvedValue([{ id: 'c', name: 'Client' }] as Client[]);
    const statuses = jest
      .spyOn(source.getRepository(StatusCatalog), 'find')
      .mockResolvedValue([{ value: 'pending' }] as StatusCatalog[]);
    const orders = source.getRepository(WorkOrder),
      orderQuery = orders.createQueryBuilder.bind(orders);
    let metricsSql = '';
    jest.spyOn(orders, 'createQueryBuilder').mockImplementation((alias) => {
      const query = orderQuery(alias);
      jest.spyOn(query, 'getRawMany').mockImplementation(async () => {
        metricsSql = query.getSql();
        return [{ projectId: 'p', workOrders: '2', workers: '3' }];
      });
      return query;
    });
    const fullHistory = jest.spyOn(orders, 'find');
    const result = await new PagedListsController(
      source,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    ).list('projects', '2', '25', '', '', '', 'status', 'asc');
    expect(result).toMatchObject({
      meta: { total: 51, totalItems: 1000 },
      relatedClients: [{ id: 'c', name: 'Client' }],
      projectMetrics: { p: { workOrders: 2, workers: 3 } },
    });
    expect(clients).toHaveBeenCalledWith(
      expect.objectContaining({ select: { id: true, name: true } }),
    );
    expect(statuses).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { scope: 'project', status: 'active' },
      }),
    );
    expect(metricsSql).toContain(
      'SUM((SELECT COUNT(DISTINCT assigned.worker_id)',
    );
    expect(metricsSql).toContain('WHERE shift.work_order_id = "wo"."id"');
    expect(metricsSql).toContain('"wo"."deleted_at" IS NULL');
    expect(fullHistory).not.toHaveBeenCalled();
    expect(builders[0].getSql()).toContain('LIMIT 25 OFFSET 25');
  });
});
