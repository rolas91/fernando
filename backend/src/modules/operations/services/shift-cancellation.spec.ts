import { WorkOrderShiftsWriteService } from './work-order-shifts-write.service';
import { ShiftsQueryService } from './shifts-query.service';
import { WorkOrderShift } from '../../../entities/work-order-shift.entity';

describe('shift cancellation lifecycle', () => {
  it('clears old receipts on restore and recancel without changing assignment acceptance', async () => {
    const shift = { cancelled: true };
    const shifts = { findOne: jest.fn(async () => shift), save: jest.fn() };
    const receipts = { delete: jest.fn() };
    const manager = {
      getRepository: (entity: unknown) =>
        entity === WorkOrderShift ? shifts : receipts,
    };
    const source = {
      transaction: (fn: (m: typeof manager) => unknown) => fn(manager),
    };
    const service = new WorkOrderShiftsWriteService(
      source as never,
      shifts as never,
      {} as never,
      {} as never,
    );
    const input = { workOrderId: 'wo1', shiftId: 's1' };
    await service.restoreShift(input);
    expect(shift.cancelled).toBe(false);
    await service.cancelShift(input);
    expect(shift.cancelled).toBe(true);
    expect(receipts.delete).toHaveBeenCalledTimes(2);
    await service.cancelShift(input);
    expect(receipts.delete).toHaveBeenCalledTimes(2);
  });

  it.each(['pending', 'confirmed'])(
    'exposes cancellation receipts with assignment status %s in both scheduler query paths',
    async (status) => {
      const acknowledgedAt = new Date('2026-10-21T01:00:00Z');
      const shift = { id: 's1', workOrderId: 'wo1', cancelled: true };
      const receiptRepo = {
        find: jest.fn(async () => [
          { shiftId: 's1', workerId: 'w1', acknowledgedAt },
        ]),
      };
      const shifts = {
        find: jest.fn(async () => [shift]),
        manager: { getRepository: () => receiptRepo },
      };
      const query = (rows: unknown[]) => {
        const q = {
          innerJoin: jest.fn(),
          where: jest.fn(),
          orderBy: jest.fn(),
          getMany: jest.fn(async () => rows),
        };
        q.innerJoin.mockReturnValue(q);
        q.where.mockReturnValue(q);
        q.orderBy.mockReturnValue(q);
        return { createQueryBuilder: () => q };
      };
      const roles = query(
        ['r1', 'r2'].map((id) => ({
          id,
          shiftId: 's1',
          requiredCertificationIds: [],
          requiredSkillIds: [],
        })),
      );
      const workers = query(
        ['r1', 'r2'].map((roleId) => ({
          roleId,
          workerId: 'w1',
          confirmationStatus: status,
        })),
      );
      const service = new ShiftsQueryService(
        shifts as never,
        roles as never,
        workers as never,
      );
      const single = await service.loadShiftsForWorkOrder('wo1');
      const batch = await service.loadShiftsForWorkOrders(['wo1']);
      for (const result of [single, batch.get('wo1')]) {
        expect(result).toEqual([
          expect.objectContaining({
            roles: [1, 2].map(() =>
              expect.objectContaining({
                workerConfirmations: [
                  expect.objectContaining({
                    status,
                    cancellationAcknowledgedAt: acknowledgedAt.toISOString(),
                  }),
                ],
              }),
            ),
          }),
        ]);
      }
      shift.cancelled = false;
      const restored = await service.loadShiftsForWorkOrder('wo1');
      expect(JSON.stringify(restored)).not.toContain(
        'cancellationAcknowledgedAt',
      );
    },
  );
});
