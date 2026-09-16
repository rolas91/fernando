import { WorkOrdersService } from './work-orders.service';

jest.mock('../../integrations/integrations.service', () => ({
  IntegrationsService: jest.fn(),
}));

describe('bulk creation with matching existing shifts', () => {
  it.each([undefined, false, true])(
    'creates all selected dates and preserves existing shifts (legacy skipDuplicates=%s)',
    async (skipDuplicates) => {
      const dates = ['2026-09-15', '2026-09-16'];
      const existing = dates.map((date, index) => ({
        id: `existing-${index}`, date, startTime: '08:00', endTime: '16:00', roles: [],
      }));
      const workOrder = {
        id: 'wo-1', startDate: dates[0], endDate: dates[1], shifts: existing,
      };
      const replace = jest.fn().mockResolvedValue(undefined);
      const service = Object.assign(Object.create(WorkOrdersService.prototype), {
        findOne: jest.fn().mockResolvedValue(workOrder),
        workOrdersRepo: { save: jest.fn(async (value) => value) },
        realtime: { emitTableUpdated: jest.fn() },
        shiftsQuery: { loadShiftsForWorkOrder: jest.fn().mockResolvedValue(existing) },
        shiftsWrite: { replaceShiftsForWorkOrder: replace },
        refreshShifts: jest.fn().mockResolvedValue(undefined),
      }) as WorkOrdersService;

      const result = await service.bulkCreateShifts('wo-1', {
        dates, baseDate: dates[0], shiftName: 'Additional crew',
        startTime: '08:00', endTime: '16:00', skipDuplicates,
        roles: [{ roleName: 'Flagger', requiredCount: 1 }],
      });

      expect(result.skipped).toEqual([]);
      expect(result.created.map((shift) => shift.date)).toEqual(dates);
      expect(result.workOrder.shifts).toHaveLength(4);
      const written = replace.mock.calls[0][1] as Array<{ id: string }>;
      expect(written).toHaveLength(4);
      expect(new Set(written.map((shift) => shift.id)).size).toBe(4);
      expect(written.map((shift) => shift.id)).toEqual(expect.arrayContaining(['existing-0', 'existing-1']));
    },
  );
});
