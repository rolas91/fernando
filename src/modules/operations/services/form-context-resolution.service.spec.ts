import { FormContextResolutionService } from './form-context-resolution.service';

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
});
