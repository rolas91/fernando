import {
  FormContextResolutionService,
  validExistingClockIn,
} from './form-context-resolution.service';

describe('saved timesheet start times', () => {
  it('preserves an early start on reopening only when enabled', () => {
    expect(validExistingClockIn('14:00', '16:00', '08:00', true)).toBe(true);
    expect(validExistingClockIn('14:00', '16:00', '08:00', false)).toBe(false);
    expect(validExistingClockIn('invalid', '16:00', '08:00', true)).toBe(false);
  });
});

jest.mock('./work-orders.service', () => ({
  WorkOrdersService: jest.fn(),
}));

describe('FormContextResolutionService material options', () => {
  const materialRepo = {
    find: jest.fn().mockResolvedValue([
      { id: 'planned', type: 'Cone', name: 'Planned cone', status: 'active' },
      { id: 'extra', type: 'cone', name: 'Extra cone', status: 'active' },
      { id: 'retired', type: 'Cone', status: 'retired' },
      { id: 'sign', type: 'Sign', name: 'Sign', status: 'active' },
      {
        id: 'archived',
        type: 'Cone',
        name: 'Old cone',
        sku: 'OLD-SKU',
        status: 'active',
        deletedAt: new Date(),
      },
    ]),
  };
  const service = new FormContextResolutionService(
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    { find: jest.fn().mockResolvedValue([]) } as never,
    materialRepo as never,
    {} as never,
    {} as never,
    {} as never,
  );

  it('offers unplanned materials of the same type without preselecting them', async () => {
    const result = await service['loadPlannedResourceOptions']({
      plannedMaterials: [
        {
          type: 'Cone',
          estimatedQuantity: 4,
          materialIds: ['planned', 'retired'],
          materialQuantities: { planned: 4 },
        },
      ],
    });

    expect(result.materials[0].items.map((item) => item.id)).toEqual([
      'planned',
      'extra',
    ]);
    expect(result.materials[0].materialIds).toEqual(['planned']);
    expect(result.materials[0].items[0].estimatedQuantity).toBe(4);
    expect(result.additionalMaterials.map((item) => item.id)).toEqual(['sign']);
  });

  it('offers materials when the planned type has no selected IDs', async () => {
    const result = await service['loadPlannedResourceOptions']({
      plannedMaterials: [{ type: 'Cone', materialIds: [] }],
    });

    expect(result.materials[0].materialIds).toEqual([]);
    expect(result.materials[0].items.map((item) => item.id)).toEqual([
      'planned',
      'extra',
    ]);
  });

  it('preserves archived planned IDs and labels while excluding them from new selections', async () => {
    const result = await service['loadPlannedResourceOptions']({
      plannedMaterials: [{ type: 'Cone', materialIds: ['archived'] }],
    });
    expect(materialRepo.find).toHaveBeenCalledWith({ withDeleted: true });
    expect(result.materials[0].materialIds).toEqual(['archived']);
    expect(
      result.materials[0].items.find((item) => item.id === 'archived'),
    ).toMatchObject({
      id: 'archived',
      label: 'OLD-SKU — Old cone',
      archived: true,
    });
    expect(
      result.additionalMaterials.some((item) => item.id === 'archived'),
    ).toBe(false);
    const unplanned = await service['loadPlannedResourceOptions']({
      plannedMaterials: [{ type: 'Cone' }],
    });
    expect(
      unplanned.materials[0].items.some((item) => item.id === 'archived'),
    ).toBe(false);
    expect(unplanned.archivedMaterials[0].id).toBe('archived');
  });
});
