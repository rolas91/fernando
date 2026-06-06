import { updateShiftWorkerConfirmation } from './work-order-shifts.util';

describe('updateShiftWorkerConfirmation', () => {
  it('preserves existing worker confirmations when another worker confirms later', () => {
    const shifts = [
      {
        id: 'shift-1',
        roles: [
          {
            id: 'role-1',
            requiredCount: 2,
            assignedWorkers: ['worker-a', 'worker-b'],
            assignedEquipment: [],
            assignedMaterials: [],
            workerConfirmations: [
              { workerId: 'worker-a', status: 'confirmed', respondedAt: '2026-06-06T10:00:00.000Z' },
              { workerId: 'worker-b', status: 'pending' },
            ],
          },
        ],
      },
    ];

    const next = updateShiftWorkerConfirmation(
      shifts,
      {
        shiftId: 'shift-1',
        roleId: 'role-1',
        workerId: 'worker-b',
      },
      {
        status: 'confirmed',
        respondedAt: '2026-06-06T10:05:00.000Z',
      },
    );

    const role = next[0].roles?.[0] as { workerConfirmations?: Array<{ workerId: string; status: string }> };

    expect(role.workerConfirmations).toEqual([
      { workerId: 'worker-a', status: 'confirmed', respondedAt: '2026-06-06T10:00:00.000Z' },
      { workerId: 'worker-b', status: 'confirmed', respondedAt: '2026-06-06T10:05:00.000Z' },
    ]);
  });
});
