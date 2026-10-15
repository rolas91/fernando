import { NumberingService } from './numbering.service';

describe('work order numbering', () => {
  const date = new Date('2026-10-13T12:00:00Z');
  function setup(template: string, padding = 5, prefix = '') {
    const settings = {
      find: jest.fn().mockResolvedValue([
        {
          workOrderNumberPrefix: prefix,
          workOrderNumberPadding: padding,
          workOrderNumberTemplate: template,
          workOrderNumberReset: 'never',
        },
      ]),
    };
    const sequence = { findOne: jest.fn().mockResolvedValue(null) };
    const service = new NumberingService(
      settings as any,
      sequence as any,
      {} as any,
    );
    return { service, sequence, settings };
  }
  it.each([
    ['{NNNNN}', 5, '', '00001'],
    ['{NNNN}', 5, '', '00001'],
    ['{PREFIX}{NNNNN}', 5, '', '00001'],
    ['{PREFIX}-{YYYY}-{NNNN}', 4, 'ASN', 'ASN-2026-0001'],
    ['{NN}', 2, '', '01'],
    ['{prefix}-{yyyy}-{nnnnnn}', 6, 'WO', 'WO-2026-000001'],
    ['{PREFIX}{NN}', 2, '$&', '$&01'],
  ])(
    'formats %s with padding %s',
    async (template, padding, prefix, expected) => {
      const { service } = setup(template, padding, prefix);
      expect((await service.previewNextWorkOrderNumber(date)).number).toBe(
        expected,
      );
    },
  );
  it('preserves an intentionally empty prefix', async () => {
    expect((await setup('{NNNNN}').service.loadConfig()).prefix).toBe('');
  });
  it('prefers default settings over an alphabetically earlier company', async () => {
    const { service, settings } = setup('{NNNNNN}', 6);
    settings.find.mockResolvedValue([
      {
        id: 'other',
        workOrderNumberTemplate: 'OTHER-{NNNN}',
        workOrderNumberPadding: 4,
      },
      {
        id: 'default',
        workOrderNumberTemplate: '{NNNNNN}',
        workOrderNumberPadding: 6,
      },
    ] as any);
    expect((await service.previewNextWorkOrderNumber(date)).number).toBe(
      '000001',
    );
  });
  it('selects the same settings record shown by company settings', async () => {
    const { service, settings } = setup('{NNNNNN}', 6);
    expect((await service.previewNextWorkOrderNumber(date)).number).toBe(
      '000001',
    );
    expect(settings.find).toHaveBeenCalledWith({
      order: { name: 'ASC', id: 'ASC' },
    });
  });
  it('uses the same format for generation and preview without advancing on preview', async () => {
    const { service, sequence } = setup('{NNNNN}');
    sequence.findOne.mockResolvedValue({ lastValue: 41 } as any);
    const advance = jest
      .spyOn(service as any, 'advanceSequence')
      .mockResolvedValue(42);
    expect((await service.previewNextWorkOrderNumber(date)).number).toBe(
      '00042',
    );
    expect(advance).not.toHaveBeenCalled();
    expect(await service.nextWorkOrderNumber(date)).toBe('00042');
    expect(advance).toHaveBeenCalledWith('GLOBAL');
  });

  it('persists a distinct number for each submission and reuses it after settings change', async () => {
    const { service, settings } = setup('{NNNNNN}', 6);
    const rows = new Map([
      ['first', { id: 'first', workOrderNumber: null as string | null }],
      ['second', { id: 'second', workOrderNumber: null as string | null }],
    ]);
    let counter = 40;
    const repo = {
      findOne: jest.fn(async ({ where }) => rows.get(where.id)),
      update: jest.fn(async (id, patch) => Object.assign(rows.get(id)!, patch)),
    };
    const manager = {
      getRepository: () => repo,
      query: jest.fn(async () => [{ last_value: ++counter }]),
    };
    Object.assign(service, {
      dataSource: { transaction: async (fn) => fn(manager) },
    });
    expect(await service.ensureSubmissionWorkOrderNumber('first')).toBe(
      '000041',
    );
    expect(await service.ensureSubmissionWorkOrderNumber('second')).toBe(
      '000042',
    );
    settings.find.mockResolvedValue([
      { workOrderNumberTemplate: 'NEW-{NNNN}', workOrderNumberPadding: 4 },
    ] as any);
    expect(await service.ensureSubmissionWorkOrderNumber('first')).toBe(
      '000041',
    );
    expect(await service.ensureSubmissionWorkOrderNumber('second')).toBe(
      '000042',
    );
    expect(manager.query).toHaveBeenCalledTimes(2);
    await expect(
      service.ensureSubmissionWorkOrderNumber('missing'),
    ).rejects.toThrow('not found');
    expect(manager.query).toHaveBeenCalledTimes(2);
  });
});
