import { ShiftsQueryService } from './shifts-query.service';
import { FormTemplatesService } from './form-templates.service';
import { normalizeWorkOrderShifts } from '../utils/work-order-shifts.util';

describe('shift forms survive scheduler reads', () => {
  const queryBuilder = () => {
    const builder = {
      innerJoin: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
    };
    return builder;
  };

  it.each(['single', 'batch'] as const)(
    'preserves selected forms through a %s read and edit payload',
    async (mode) => {
      const shift = {
        id: 'shift-1', workOrderId: 'wo-1', date: '2026-09-11',
        startTime: '16:00', endTime: '23:00',
        formTemplateIds: ['form-wo', 'form-timesheet'],
        workOrderAuthorizedWorkerIds: ['worker-1'],
      };
      const service = new ShiftsQueryService(
        { find: jest.fn().mockResolvedValue([shift]) } as never,
        { createQueryBuilder: queryBuilder } as never,
        { createQueryBuilder: queryBuilder } as never,
      );
      const result = mode === 'single'
        ? await service.loadShiftsForWorkOrder('wo-1')
        : (await service.loadShiftsForWorkOrders(['wo-1'])).get('wo-1');
      expect(result?.[0]).toMatchObject({
        formTemplateIds: ['form-wo', 'form-timesheet'],
        workOrderAuthorizedWorkerIds: ['worker-1'],
      });
      expect(result?.[0].formTemplateIds).not.toBe(shift.formTemplateIds);
      const editPayload = normalizeWorkOrderShifts(result);
      expect(editPayload[0].formTemplateIds).toEqual(['form-wo', 'form-timesheet']);
      const templates = [{ id: 'form-wo' }, { id: 'form-timesheet' }, { id: 'unselected' }];
      const forms = new FormTemplatesService(
        { find: jest.fn().mockResolvedValue(templates) } as never,
        { findOne: jest.fn().mockResolvedValue(editPayload[0]) } as never,
      );
      await expect(forms.findAssigned({ workOrderId: 'wo-1', shiftId: 'shift-1' }))
        .resolves.toEqual(templates.slice(0, 2));
    },
  );
});
