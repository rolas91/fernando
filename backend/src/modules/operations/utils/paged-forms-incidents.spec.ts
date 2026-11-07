import { FormSubmissionsController } from '../controllers/form-submissions.controller';
import { FormSubmissionsService } from '../services/form-submissions.service';
import type { UserAccessContext } from '../../access/ports/access.port';
import { catalogQuery } from './paged-catalog.util';
import { DataSource } from 'typeorm';
import { Incident } from '../../../entities/incident.entity';

function submission(id: string, workerId: string, templateId = 'timesheet') {
  return {
    id,
    workerId,
    templateId,
    data: { privateSignature: 'large' },
    submittedAt: '2026-11-05',
  };
}
function setup() {
  const rows = [
    submission('other', 'other'),
    submission('own', 'me'),
    submission('incident', 'other', 'incident'),
  ];
  const builder = {
    select: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    groupBy: jest.fn().mockReturnThis(),
    getRawMany: jest.fn(() =>
      Promise.resolve([
        { templateId: 'timesheet', count: '21' },
        { templateId: 'unknown', count: '2' },
      ]),
    ),
    orderBy: jest.fn().mockReturnThis(),
    addOrderBy: jest.fn().mockReturnThis(),
    clone: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getMany: jest.fn(() => Promise.resolve(rows)),
    getManyAndCount: jest.fn(() => Promise.resolve([rows.slice(0, 1), 20])),
    getCount: jest.fn(() => Promise.resolve(100)),
  };
  const service = Object.create(
    FormSubmissionsService.prototype,
  ) as FormSubmissionsService;
  Object.assign(service, {
    repo: {
      createQueryBuilder: () => builder,
      findOne: ({ where }: { where: { id: string } }) =>
        Promise.resolve(rows.find((row) => row.id === where.id)),
    },
    templatesRepo: {
      find: () =>
        Promise.resolve([
          { id: 'timesheet', name: 'Payroll', category: 'timesheet' },
          { id: 'incident', name: 'Safety', category: 'incident' },
        ]),
    },
    resolveWorkerIdForActor: () => Promise.resolve('me'),
  });
  return { service, builder };
}
describe('paged forms and incidents', () => {
  it('requires submitted-form read permission for both scoped endpoints', async () => {
    const { service } = setup();
    const read = jest
      .spyOn(service, 'findScheduleReadMetadata')
      .mockResolvedValue([]);
    const controller = new FormSubmissionsController(service);
    const denied = {
      user: { permissions: ['work-orders.read'] } as UserAccessContext,
    };
    expect(() => controller.scheduleIndex(denied as never)).toThrow(
      'read permission',
    );
    expect(() =>
      controller.assignmentDocuments('assignment', denied as never),
    ).toThrow('read permission');
    expect(read).not.toHaveBeenCalled();
    const user = {
      permissions: ['form-submissions.read'],
    } as UserAccessContext;
    await controller.scheduleIndex({ user } as never);
    expect(read).toHaveBeenLastCalledWith(undefined, user);
    await controller.assignmentDocuments('assignment', { user } as never);
    expect(read).toHaveBeenLastCalledWith('assignment', user);
  });
  it('projects completion identifiers only and scopes document metadata to the selected assignment', async () => {
    const { service, builder } = setup();
    const index = await service.findScheduleReadMetadata(undefined);
    expect(builder.where).toHaveBeenCalledWith('submission.status = :status', {
      status: 'submitted',
    });
    expect(builder.select).toHaveBeenLastCalledWith([
      'submission.id',
      'submission.templateId',
      'submission.workOrderId',
      'submission.shiftId',
      'submission.status',
    ]);
    expect(index[0]).not.toHaveProperty('data');
    expect(index[0]).not.toHaveProperty('workerId');
    expect(index[0]).not.toHaveProperty('pdfUrl');
    builder.select.mockClear();
    const documents = await service.findScheduleReadMetadata('assignment-2');
    expect(builder.where).toHaveBeenLastCalledWith(
      'submission.workOrderId = :workOrderId',
      { workOrderId: 'assignment-2' },
    );
    expect((builder.select.mock.calls as [string[]][])[0][0]).toContain(
      'submission.pdfUrl',
    );
    expect((builder.select.mock.calls as [string[]][])[0][0]).not.toContain(
      'submission.data',
    );
    expect(documents[0]).not.toHaveProperty('data');
    await expect(service.findScheduleReadMetadata('   ')).rejects.toThrow(
      'Assignment ID is required',
    );
  });
  it('retains nested own-timesheet visibility before reducing schedule/document reads', async () => {
    const { service, builder } = setup();
    const actor = {
      role: 'viewer',
      permissions: ['mobile.timesheets.submit'],
    } as UserAccessContext;
    for (const id of [undefined, 'assignment']) {
      const rows = await service.findScheduleReadMetadata(id, actor);
      expect(rows.map((row) => row.id)).toEqual(['own', 'incident']);
      expect(rows.every((row) => !('data' in row))).toBe(true);
    }
    expect(builder.select).not.toHaveBeenCalled();
  });
  it('applies existing viewer visibility before totals and pages, excluding response bodies', async () => {
    const { service } = setup();
    const actor = {
      role: 'viewer',
      permissions: ['mobile.timesheets.submit'],
    } as UserAccessContext;
    const result = await service.findPaged('2', '1', '', actor);
    expect(result.meta).toMatchObject({
      total: 2,
      totalItems: 2,
      totalPages: 2,
      page: 2,
    });
    expect(result.data.map((row) => row.id)).toEqual(['incident']);
    expect(result.data[0]).not.toHaveProperty('data');
    const searched = await service.findPaged('1', '25', 'payroll', actor);
    expect(searched.meta.total).toBe(1);
    expect(searched.meta.totalItems).toBe(2);
    expect(searched.data[0].id).toBe('own');
    await expect(service.findOneForActor('other', actor)).rejects.toThrow(
      'not found',
    );
    expect((await service.findOneForActor('own', actor)).data).toHaveProperty(
      'privateSignature',
    );
  });
  it('paginates SQL reads and searches template names as literal text for unrestricted actors', async () => {
    const { service, builder } = setup();
    const result = await service.findPaged('3', '25', '50%_');
    expect(builder.skip).toHaveBeenCalledWith(50);
    expect(builder.take).toHaveBeenCalledWith(25);
    expect(builder.getMany).not.toHaveBeenCalled();
    expect(builder.andWhere.mock.calls[0]).toEqual([
      expect.stringContaining('template.name'),
      { search: '%50\\%\\_%' },
    ]);
    expect(result.meta).toMatchObject({ total: 20, totalItems: 100 });
    expect(result.data[0]).not.toHaveProperty('data');
  });
  it('aggregates report form counts in SQL without JSON and preserves viewer ownership inside the selected UTC dates', async () => {
    const unrestricted = setup();
    expect(
      await unrestricted.service.summaryForRange('2026-11-01', '2026-11-06'),
    ).toEqual([
      { templateId: 'timesheet', count: 21 },
      { templateId: 'unknown', count: 2 },
    ]);
    expect(unrestricted.builder.getMany).not.toHaveBeenCalled();
    expect(unrestricted.builder.groupBy).toHaveBeenCalledWith(
      'submission.templateId',
    );
    expect(unrestricted.builder.where).toHaveBeenCalledWith(
      'submission.submittedAt >= :start AND submission.submittedAt < :end',
      {
        start: new Date('2026-11-01T00:00:00Z'),
        end: new Date('2026-11-07T00:00:00Z'),
      },
    );
    const own = setup();
    const actor = {
      role: 'viewer',
      permissions: ['mobile.timesheets.submit'],
    } as UserAccessContext;
    expect(
      await own.service.summaryForRange('2026-11-01', '2026-11-06', actor),
    ).toEqual([
      { templateId: 'timesheet', count: 1 },
      { templateId: 'incident', count: 1 },
    ]);
    expect(own.builder.getRawMany).not.toHaveBeenCalled();
  });
  it('keeps assignment-wide legacy documents but limits detail reads to the selected shift and actor', async () => {
    const { service, builder } = setup();
    const actor = {
      role: 'viewer',
      permissions: ['mobile.timesheets.submit'],
    } as UserAccessContext;
    const rows = await service.findForShiftRead('wo', 'selected', actor);
    expect(builder.where).toHaveBeenCalledWith(
      'submission.workOrderId = :workOrderId',
      { workOrderId: 'wo' },
    );
    expect(builder.andWhere).toHaveBeenCalledWith(
      "(submission.shiftId = :shiftId OR COALESCE(submission.shiftId, '') = '')",
      { shiftId: 'selected' },
    );
    expect(rows.map((row) => row.id)).toEqual(['own', 'incident']);
  });
  it('preserves incident concatenation search, status filtering and date order in SQL', async () => {
    const source = new DataSource({ type: 'postgres', entities: [Incident] });
    await (
      source as unknown as { buildMetadatas(): Promise<void> }
    ).buildMetadatas();
    const [sql, params] = catalogQuery(
      source.getRepository(Incident),
      'incidents',
      { search: 'Safety%_', status: 'open' },
    )
      .skip(25)
      .take(25)
      .getQueryAndParameters();
    expect(sql).toContain('CONCAT(');
    expect(sql).toContain('"item"."date" DESC');
    expect(sql).toContain('LIMIT 25 OFFSET 25');
    expect(params).toEqual(['%safety\\%\\_%', 'open']);
  });
});
