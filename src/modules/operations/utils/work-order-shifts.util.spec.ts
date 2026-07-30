import {
  normalizeWorkOrderShifts,
  preserveOtherWorkerConfirmations,
  snapshotWorkerConfirmations,
  updateShiftWorkerConfirmation,
} from './work-order-shifts.util';

const shiftsWithOneConfirmed = [
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

describe('updateShiftWorkerConfirmation', () => {
  it('normalizes and deduplicates Work Order Types on the shift', () => {
    const normalized = normalizeWorkOrderShifts([
      {
        id: 'shift-types',
        workOrderTypes: [' Field Service ', 'On Rent', 'On Rent', ''],
        roles: [],
      },
    ]);

    expect(normalized[0].workOrderTypes).toEqual(['Field Service', 'On Rent']);
  });

  it('preserves confirmations when normalizing an already saved shift', () => {
    const normalized = normalizeWorkOrderShifts(
      shiftsWithOneConfirmed,
      shiftsWithOneConfirmed,
    );

    const role = normalized[0].roles?.[0] as { workerConfirmations?: Array<{ workerId: string; status: string }> };

    expect(role.workerConfirmations).toEqual([
      { workerId: 'worker-a', status: 'confirmed', respondedAt: '2026-06-06T10:00:00.000Z' },
      { workerId: 'worker-b', status: 'pending' },
    ]);
  });

  it('preserves existing worker confirmations when another worker confirms later', () => {
    const next = updateShiftWorkerConfirmation(
      shiftsWithOneConfirmed,
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

describe('normalizeWorkOrderShifts - role id regeneration', () => {
  it('preserves confirmations when frontend sends a new role id but keeps roleName and worker', () => {
    const previous = [
      {
        id: 'shift-1',
        roles: [
          {
            id: 'role-1',
            roleName: 'Flagger',
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
    const incoming = [
      {
        id: 'shift-1',
        roles: [
          {
            id: 'sr_shift-1_1718900000000_Flagger',
            roleName: 'Flagger',
            requiredCount: 2,
            assignedWorkers: ['worker-a', 'worker-b'],
            assignedEquipment: [],
            assignedMaterials: [],
          },
        ],
      },
    ];

    const normalized = normalizeWorkOrderShifts(incoming, previous);
    const role = normalized[0].roles?.[0] as { workerConfirmations?: Array<{ workerId: string; status: string }> };

    expect(role.workerConfirmations).toEqual([
      { workerId: 'worker-a', status: 'confirmed', respondedAt: '2026-06-06T10:00:00.000Z' },
      { workerId: 'worker-b', status: 'pending' },
    ]);
  });
});

describe('preserveOtherWorkerConfirmations', () => {
  const baseShift = {
    id: 'shift-1',
    roles: [
      {
        id: 'role-1',
        roleName: 'Flagger',
        requiredCount: 2,
        assignedWorkers: ['worker-a', 'worker-b'],
        assignedEquipment: [],
        assignedMaterials: [],
        workerConfirmations: [
          { workerId: 'worker-a', status: 'confirmed', respondedAt: '2026-06-06T10:00:00.000Z' },
          { workerId: 'worker-b', status: 'confirmed', respondedAt: '2026-06-06T11:00:00.000Z' },
        ],
      },
    ],
  };

  it('restores a peer confirmation that was wiped by a subsequent normalize', () => {
    const snapshot = snapshotWorkerConfirmations([baseShift]);
    const wiped = [
      {
        ...baseShift,
        roles: [
          {
            ...baseShift.roles[0],
            workerConfirmations: [
              { workerId: 'worker-a', status: 'pending' },
            ],
          },
        ],
      },
    ];
    const restored = preserveOtherWorkerConfirmations(
      wiped,
      snapshot,
      { shiftId: 'shift-1', roleId: 'role-1', workerId: 'worker-a' },
    );
    const role = restored[0].roles?.[0] as { workerConfirmations?: Array<{ workerId: string; status: string }> };
    const b = role.workerConfirmations?.find((c) => c.workerId === 'worker-b');
    expect(b?.status).toBe('confirmed');
  });

  it('keeps the target worker updated status and does not touch other roles', () => {
    const snapshot = snapshotWorkerConfirmations([
      {
        ...baseShift,
        roles: [
          baseShift.roles[0],
          {
            id: 'role-2',
            roleName: 'Foreman',
            requiredCount: 1,
            assignedWorkers: ['worker-c'],
            assignedEquipment: [],
            assignedMaterials: [],
            workerConfirmations: [
              { workerId: 'worker-c', status: 'confirmed' },
            ],
          },
        ],
      },
    ]);
    const mutated = [
      {
        ...baseShift,
        roles: [
          {
            ...baseShift.roles[0],
            workerConfirmations: [
              { workerId: 'worker-a', status: 'pending' },
            ],
          },
          {
            id: 'role-2',
            roleName: 'Foreman',
            requiredCount: 1,
            assignedWorkers: ['worker-c'],
            assignedEquipment: [],
            assignedMaterials: [],
            workerConfirmations: [
              { workerId: 'worker-c', status: 'pending' },
            ],
          },
        ],
      },
    ];
    const restored = preserveOtherWorkerConfirmations(
      mutated,
      snapshot,
      { shiftId: 'shift-1', roleId: 'role-1', workerId: 'worker-a' },
    );
    const role1 = restored[0].roles?.[0] as { workerConfirmations?: Array<{ workerId: string; status: string }> };
    const role2 = restored[0].roles?.[1] as { workerConfirmations?: Array<{ workerId: string; status: string }> };
    const a = role1.workerConfirmations?.find((c) => c.workerId === 'worker-a');
    const b = role1.workerConfirmations?.find((c) => c.workerId === 'worker-b');
    const c = role2.workerConfirmations?.find((c) => c.workerId === 'worker-c');
    expect(a?.status).toBe('pending');
    expect(b?.status).toBe('confirmed');
    /** Other roles are not touched by this helper; they need their own restore call. */
    expect(c?.status).toBe('pending');
  });
});
