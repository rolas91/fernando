import { DataSource } from 'typeorm';

jest.mock('../app.module', () => ({ AppModule: class {} }));

import {
  CURRENT_FORM_TEMPLATES_BACKUP,
  restoreMissingFormTemplates,
} from './seed-form-templates-backup';

describe('restoreMissingFormTemplates', () => {
  const createRepository = (
    existingIds: string[],
    existingNames: string[] = [],
  ) => {
    const saved: Array<Record<string, unknown>> = [];
    const repository = {
      findOne: jest.fn(
        ({ where }: { where: Array<{ id?: string; name?: string }> }) => {
          const id = where.find((condition) => condition.id)?.id;
          const name = where.find((condition) => condition.name)?.name;
          return Promise.resolve(
            (id && existingIds.includes(id)) ||
              (name && existingNames.includes(name))
              ? { id, name }
              : null,
          );
        },
      ),
      create: jest.fn((template: Record<string, unknown>) => template),
      save: jest.fn((template: Record<string, unknown>) => {
        saved.push(template);
        return Promise.resolve(template);
      }),
    };
    const dataSource = {
      getRepository: jest.fn(() => repository),
    } as unknown as DataSource;

    return { dataSource, repository, saved };
  };

  it('contains the complete set of current production form designs', () => {
    expect(
      CURRENT_FORM_TEMPLATES_BACKUP.map(({ id, fields }) => [
        id,
        fields.length,
      ]),
    ).toEqual([
      ['work_order_daily_completion', 12],
      ['ft_1779422754097', 1],
      ['incident_report_field_report', 19],
    ]);
    expect(
      CURRENT_FORM_TEMPLATES_BACKUP[0].fields.map((field) => field.id),
    ).toEqual([
      'dr_traffic_job_number',
      'work_date',
      'job_name',
      'description_of_work',
      'client',
      'contact',
      'work_shift',
      'worker_timesheets',
      'field_1785298083414_3n94e',
      'notes',
      'worker_signature',
      'field_1785359097384_i86ik',
    ]);
    expect(
      CURRENT_FORM_TEMPLATES_BACKUP.every(
        ({ assignedProjects, assignedRoles }) =>
          assignedProjects.length === 0 && assignedRoles.length === 0,
      ),
    ).toBe(true);
  });

  it('does not modify forms that already exist', async () => {
    const allIds = CURRENT_FORM_TEMPLATES_BACKUP.map(({ id }) => id);
    const { dataSource, repository } = createRepository(allIds);

    const result = await restoreMissingFormTemplates(dataSource);

    expect(result).toEqual({ restored: [], existing: allIds });
    expect(repository.create).not.toHaveBeenCalled();
    expect(repository.save).not.toHaveBeenCalled();
  });

  it('restores only missing forms with their complete definitions', async () => {
    const existingId = CURRENT_FORM_TEMPLATES_BACKUP[0].id;
    const { dataSource, saved } = createRepository([existingId]);

    const result = await restoreMissingFormTemplates(dataSource);

    expect(result.existing).toEqual([existingId]);
    expect(result.restored).toEqual(
      CURRENT_FORM_TEMPLATES_BACKUP.slice(1).map(({ id }) => id),
    );
    expect(saved).toHaveLength(2);
    expect(saved[0]).toMatchObject(CURRENT_FORM_TEMPLATES_BACKUP[1]);
    expect(saved[1]).toMatchObject(CURRENT_FORM_TEMPLATES_BACKUP[2]);
  });

  it('does not create a duplicate when the form name already exists', async () => {
    const { dataSource, saved } = createRepository([], ['TimeSheet']);

    const result = await restoreMissingFormTemplates(dataSource);

    expect(result.existing).toContain('ft_1779422754097');
    expect(saved.map(({ id }) => id)).not.toContain('ft_1779422754097');
  });
});
