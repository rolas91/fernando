import { FormTemplatesService } from './form-templates.service';

describe('FormTemplatesService.findAssigned', () => {
  const templates = [
    { id: 'form-a', name: 'A', assignedProjects: [], assignedRoles: [] },
    { id: 'form-b', name: 'B', assignedProjects: [], assignedRoles: [] },
  ];

  it('uses the selected shift form allowlist', async () => {
    const service = new FormTemplatesService(
      { find: jest.fn(async () => templates) } as never,
      {
        findOne: jest.fn(async () => ({ id: 'shift-1', formTemplateIds: ['form-b'] })),
      } as never,
    );

    await expect(
      service.findAssigned({ workOrderId: 'wo-1', shiftId: 'shift-1' }),
    ).resolves.toEqual([templates[1]]);
  });

  it('returns no forms for a shift with an empty allowlist', async () => {
    const service = new FormTemplatesService(
      { find: jest.fn(async () => templates) } as never,
      { findOne: jest.fn(async () => ({ id: 'shift-1', formTemplateIds: [] })) } as never,
    );

    await expect(
      service.findAssigned({ workOrderId: 'wo-1', shiftId: 'shift-1' }),
    ).resolves.toEqual([]);
  });
});
