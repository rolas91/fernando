import { NumberingService } from './numbering.service';

describe('work order numbering', () => {
  const date = new Date('2026-10-13T12:00:00Z');
  function setup(template: string, padding = 5, prefix = '') {
    const settings = { find: jest.fn().mockResolvedValue([{
      workOrderNumberPrefix: prefix, workOrderNumberPadding: padding,
      workOrderNumberTemplate: template, workOrderNumberReset: 'never',
    }]) };
    const sequence = { findOne: jest.fn().mockResolvedValue(null) };
    const service = new NumberingService(settings as any, sequence as any, {} as any);
    return { service, sequence };
  }
  it.each([
    ['{NNNNN}', 5, '', '00001'],
    ['{NNNN}', 5, '', '00001'],
    ['{PREFIX}{NNNNN}', 5, '', '00001'],
    ['{PREFIX}-{YYYY}-{NNNN}', 4, 'ASN', 'ASN-2026-0001'],
    ['{NN}', 2, '', '01'],
  ])('formats %s with padding %s', async (template, padding, prefix, expected) => {
    const { service } = setup(template, padding, prefix);
    expect((await service.previewNextWorkOrderNumber(date)).number).toBe(expected);
  });
  it('preserves an intentionally empty prefix', async () => {
    expect((await setup('{NNNNN}').service.loadConfig()).prefix).toBe('');
  });
  it('uses the same format for generation and preview without advancing on preview', async () => {
    const { service, sequence } = setup('{NNNNN}');
    sequence.findOne.mockResolvedValue({ lastValue: 41 } as any);
    const advance = jest.spyOn(service as any, 'advanceSequence').mockResolvedValue(42);
    expect((await service.previewNextWorkOrderNumber(date)).number).toBe('00042');
    expect(advance).not.toHaveBeenCalled();
    expect(await service.nextWorkOrderNumber(date)).toBe('00042');
    expect(advance).toHaveBeenCalledWith('GLOBAL');
  });
});
