import { BadRequestException } from '@nestjs/common';
import type { ShiftWriteInput } from './work-order-shifts-write.service';
import { WorkOrderShiftsWriteService } from './work-order-shifts-write.service';

describe('WorkOrderShiftsWriteService role identifier validation', () => {
  const dataSource = { transaction: jest.fn() };
  const service = new WorkOrderShiftsWriteService(
    dataSource as never,
    {} as never,
    {} as never,
    {} as never,
  );

  beforeEach(() => jest.clearAllMocks());

  it('rejects duplicate role identifiers before opening a transaction', async () => {
    const shift: ShiftWriteInput = {
      id: 'shift-1',
      shiftName: 'Night Shift',
      date: '2026-08-19',
      startTime: '19:00',
      endTime: '04:00',
      roles: [
        {
          id: 'role-1',
          roleName: 'Flagger',
          requiredCount: 1,
          assignedWorkers: [],
        },
        {
          id: 'role-1',
          roleName: 'Lead',
          requiredCount: 2,
          assignedWorkers: [],
        },
      ],
    };

    await expect(
      service.replaceShiftsForWorkOrder('work-order-1', [shift]),
    ).rejects.toEqual(
      new BadRequestException(
        'Duplicate shift role identifier "role-1". Refresh the page and try again.',
      ),
    );
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });
});
