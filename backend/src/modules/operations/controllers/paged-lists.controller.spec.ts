import { TimesheetsService } from '../services/timesheets.service';
import { DataSource } from 'typeorm';
import { ExecutionContext } from '@nestjs/common';
import { Client } from '../../../entities/client.entity';
import { Project } from '../../../entities/project.entity';
import { Worker } from '../../../entities/worker.entity';
import { User } from '../../../entities/user.entity';
import { Timesheet } from '../../../entities/timesheet.entity';
import { PagedListsController } from './paged-lists.controller';
import { OperationsAuthGuard } from '../operations-auth.guard';

describe('paged catalog contracts', () => {
  it.each([false, true])(
    'preserves legacy worker lookups while querying users only with UUIDs (mixed=%s)',
    async (mixed) => {
      const userId = '550e8400-e29b-41d4-a716-446655440000';
      const data = [{ id: 'submission-1', workerId: '0013' }];
      if (mixed) data.push({ id: 'submission-2', workerId: userId });
      const workerFind = jest.fn(async () => [
        { id: '0013', firstName: 'Legacy', lastName: 'Worker', email: '' },
      ]);
      const userFind = jest.fn(async () => [
        { id: userId, firstName: 'Account', lastName: 'User', email: '' },
      ]);
      const getRepository = jest.fn((entity) => {
        if (entity === Worker) return { find: workerFind };
        if (entity === User) return { find: userFind };
        throw new Error('Unexpected lookup');
      });
      const controller = new PagedListsController(
        { getRepository } as never,
        {} as never,
        {} as never,
        {} as never,
        {
          findPaged: jest.fn(async () => ({
            data,
            meta: { total: data.length },
          })),
        } as never,
      );
      const result = await controller.list(
        'form-submissions',
        '1',
        '25',
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        { user: { permissions: ['workers.read', 'users.read'] } } as never,
      );
      const lookups = (
        result as { lookups: { submitters: Record<string, string> } }
      ).lookups;
      expect(lookups.submitters['0013']).toBe('Legacy Worker');
      expect(
        (
          workerFind.mock.calls[0] as unknown as [
            { where: { id: { value: string[] } } },
          ]
        )[0].where.id.value,
      ).toEqual(mixed ? ['0013', userId] : ['0013']);
      if (mixed) {
        expect(
          (
            userFind.mock.calls[0] as unknown as [
              { where: { id: { value: string[] } } },
            ]
          )[0].where.id.value,
        ).toEqual([userId]);
        expect(lookups.submitters[userId]).toBe('Account User');
      } else expect(userFind).not.toHaveBeenCalled();
    },
  );
  it('returns bounded rows, full filtered totals, global counters and one grouped project-count query', async () => {
    const source = new DataSource({
      type: 'postgres',
      entities: [Client, Project, Timesheet],
    });
    await (
      source as unknown as { buildMetadatas(): Promise<void> }
    ).buildMetadatas();
    const clients = source.getRepository(Client);
    const projects = source.getRepository(Project);
    const clientBuilder = clients.createQueryBuilder.bind(clients);
    const projectBuilder = projects.createQueryBuilder.bind(projects);
    const queries: ReturnType<typeof clientBuilder>[] = [];
    jest.spyOn(clients, 'createQueryBuilder').mockImplementation((alias) => {
      const query = clientBuilder(alias);
      queries.push(query);
      jest
        .spyOn(query, 'getManyAndCount')
        .mockResolvedValue([[{ id: 'client-2' } as Client], 51]);
      jest.spyOn(query, 'getRawMany').mockResolvedValue([
        { status: 'active', count: '2500' },
        { status: 'archived', count: '100' },
      ]);
      jest
        .spyOn(query, 'getMany')
        .mockResolvedValue([
          { id: 'export-a' },
          { id: 'export-b' },
        ] as Client[]);
      return query;
    });
    let projectSql = '';
    jest.spyOn(projects, 'createQueryBuilder').mockImplementation((alias) => {
      const query = projectBuilder(alias);
      jest.spyOn(query, 'getRawMany').mockImplementation(async () => {
        projectSql = query.getSql();
        return [{ clientId: 'client-2', count: '900' }];
      });
      return query;
    });
    const controller = new PagedListsController(
      source,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    const result = await controller.list(
      'clients',
      '2',
      '25',
      'name',
      'active',
    );
    expect(result.data).toHaveLength(1);
    expect(result.meta).toMatchObject({
      page: 2,
      limit: 25,
      total: 51,
      totalPages: 3,
      totalItems: 2600,
      statusCounts: { active: 2500, archived: 100 },
    });
    expect('projectCounts' in result && result.projectCounts).toEqual({
      'client-2': 900,
    });
    expect(queries[0].getSql()).toContain('LIMIT 25 OFFSET 25');
    expect(projectSql).toContain('GROUP BY');
    expect(projects.createQueryBuilder).toHaveBeenCalledTimes(1);
    expect(
      await controller.exportCatalog('clients', 'name', 'active'),
    ).toHaveLength(2);
    expect(queries.at(-1)?.getSql()).not.toContain('LIMIT');
    expect(queries.at(-1)?.getParameters()).toMatchObject({
      search: '%name%',
      status: 'active',
    });
  });
  it('rejects unsupported and prototype resources before repository access', async () => {
    const getRepository = jest.fn();
    const controller = new PagedListsController(
      { getRepository } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    await expect(controller.list('__proto__')).rejects.toThrow('Unsupported');
    await expect(controller.exportCatalog('toString')).rejects.toThrow(
      'Unsupported',
    );
    expect(getRepository).not.toHaveBeenCalled();
  });
  it('reconciles existing submissions and counts only internal pending timesheets for the badge', async () => {
    const count = jest.fn(async () => 12345);
    const reconcile = jest.fn(async () => {});
    const service = Object.create(
      TimesheetsService.prototype,
    ) as TimesheetsService;
    Object.assign(service, {
      timesheetsRepo: { count },
      reconcileTimesheetSubmissions: reconcile,
    });
    const controller = new PagedListsController(
      {} as never,
      service,
      {} as never,
      {} as never,
      {} as never,
    );
    expect(await controller.summary('timesheets')).toEqual({ pending: 12345 });
    expect(reconcile).toHaveBeenCalledTimes(1);
    expect(count).toHaveBeenCalledWith({
      where: { variant: 'internal', status: 'pending' },
    });
    expect(reconcile.mock.invocationCallOrder[0]).toBeLessThan(
      count.mock.invocationCallOrder[0],
    );
  });
  it.each([
    '/paged/materials',
    '/api/paged/materials/export',
    '/paged/timesheets/summary',
  ])('enforces the underlying read permission for %s', async (url) => {
    const permissions: string[] = [];
    const guard = new OperationsAuthGuard(
      { verifyAccessToken: () => ({ sub: 'user' }) } as never,
      {
        getUserAccessContext: async () => ({
          email: 'reader@example.com',
          permissions,
        }),
      } as never,
    );
    const context = {
      switchToHttp: () => ({
        getRequest: () => ({
          method: 'GET',
          originalUrl: url,
          headers: { authorization: 'Bearer token' },
        }),
      }),
    } as ExecutionContext;
    await expect(guard.canActivate(context)).rejects.toThrow('cannot read');
    permissions.push(
      url.includes('timesheets') ? 'timesheets.read' : 'materials.read',
    );
    expect(await guard.canActivate(context)).toBe(true);
  });
});
