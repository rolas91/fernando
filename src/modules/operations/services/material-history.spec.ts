jest.mock('../../integrations/integrations.service', () => ({
  IntegrationsService: class IntegrationsService {},
}));

import { WorkOrdersService } from './work-orders.service';

describe('material history in mobile assignments', () => {
  it('resolves a previously recorded material by its original ID after archiving and editing SKU', async () => {
    const service = Object.create(WorkOrdersService.prototype) as any;
    const archived = {
      id: 'stable-material-id',
      name: 'Original cone',
      sku: 'EDITED-SKU',
      deletedAt: new Date(),
    };
    const submission = {
      id: 'form-1',
      workOrderId: 'order-1',
      shiftId: 'shift-1',
      data: {
        resources: {
          materials: [{ materialId: 'stable-material-id', actualQuantity: 3 }],
        },
      },
    };
    const originalData = JSON.stringify(submission.data);
    service.formSubmissionsRepo = {
      find: jest.fn().mockResolvedValue([submission]),
    };
    service.materialsRepo = { find: jest.fn().mockResolvedValue([archived]) };
    const maps = await service.loadMobileQuickAccessMaps([
      { id: 'order-1', shifts: [] },
    ]);
    expect(service.materialsRepo.find).toHaveBeenCalledWith(
      expect.objectContaining({ withDeleted: true }),
    );
    expect(maps.materialById.get('stable-material-id')).toBe(archived);
    expect(maps.resourceSubmissionsByWorkOrderId.get('order-1')).toEqual([
      submission,
    ]);
    expect(JSON.stringify(submission.data)).toBe(originalData);
    expect([
      ...service.collectSubmittedResourceIds([submission]).materialIds,
    ]).toEqual(['stable-material-id']);
  });
});
