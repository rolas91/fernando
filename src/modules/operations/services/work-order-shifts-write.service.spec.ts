import { BadRequestException } from '@nestjs/common';
import type { ShiftWriteInput } from './work-order-shifts-write.service';
import { WorkOrderShiftsWriteService } from './work-order-shifts-write.service';

describe('WorkOrderShiftsWriteService role validation', () => {
  const dataSource = { transaction: jest.fn() };
  const service = new WorkOrderShiftsWriteService(
    dataSource as never,
    {} as never,
    {} as never,
    {} as never,
  );

  beforeEach(() => jest.clearAllMocks());

  it('rejects the same role name twice in one shift before opening a transaction', async () => {
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
          id: 'role-2',
          roleName: ' flagger ',
          requiredCount: 2,
          assignedWorkers: [],
        },
      ],
    };

    await expect(
      service.replaceShiftsForWorkOrder('work-order-1', [shift]),
    ).rejects.toEqual(
      new BadRequestException(
        'Shift "Night Shift" cannot contain the role "flagger" more than once. Increase its quantity instead.',
      ),
    );
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });
});
