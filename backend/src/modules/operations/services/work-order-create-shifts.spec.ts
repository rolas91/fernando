jest.mock('../../integrations/integrations.service', () => ({
  IntegrationsService: class {},
}));
import { DataSource } from 'typeorm';
import { WorkOrder } from '../../../entities/work-order.entity';
import { WorkOrdersService } from './work-orders.service';

describe('assignment creation with relational shifts', () => {
  it.each([true, false])(
    'preserves normalized initial shifts with real TypeORM entity metadata (has shifts: %s)',
    async (hasShifts) => {
      const source = new DataSource({
        type: 'postgres',
        entities: [WorkOrder],
      });
      await (
        source as unknown as { buildMetadatas(): Promise<void> }
      ).buildMetadatas();
      const repository = source.getRepository(WorkOrder);
      const shifts = hasShifts
        ? [
            {
              id: 'shift',
              date: '2026-11-13',
              startTime: '08:00',
              endTime: '09:00',
              roles: [],
            },
          ]
        : [];
      // TypeORM only copies mapped properties; shifts are stored in relational tables.
      expect(
        repository.create({ id: 'assignment', shifts }).shifts,
      ).toBeUndefined();
      jest
        .spyOn(repository, 'save')
        .mockImplementation(async (entity) => entity as WorkOrder);
      const write = jest.fn(async () => {}),
        bounds = jest.fn(async () => {}),
        certifications = jest.fn(async () => {}),
        delegation = jest.fn();
      const service = Object.create(
        WorkOrdersService.prototype,
      ) as WorkOrdersService;
      Object.assign(service, {
        workOrdersRepo: repository,
        applyProjectAssignmentDateBounds: bounds,
        assertAssignedWorkersMeetRoleCertifications: certifications,
        assertWorkOrderDelegationChangesAllowed: delegation,
        shiftsWrite: { replaceShiftsForWorkOrder: write },
        realtime: { emitTableUpdated: jest.fn() },
        refreshShifts: jest.fn(async () => {}),
      });
      const result = await service.create({
        id: 'assignment',
        title: 'Test',
        projectId: 'project',
        orderNumber: 'explicit',
        startDate: '2026-11-13',
        endDate: '2026-11-13',
        shifts,
      });
      expect(result.shifts).toHaveLength(shifts.length);
      expect(write).toHaveBeenCalledWith(
        'assignment',
        hasShifts
          ? [expect.objectContaining({ id: 'shift', date: '2026-11-13' })]
          : [],
      );
      expect(bounds).toHaveBeenCalledWith(
        'project',
        '2026-11-13',
        '2026-11-13',
      );
      expect(certifications).toHaveBeenCalledTimes(1);
      expect(delegation).toHaveBeenCalledTimes(1);
      expect(result.status).toBe('');
    },
  );
});
