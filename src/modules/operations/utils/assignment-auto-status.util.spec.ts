import {
  computeAssignmentStatus,
  computeAssignmentSignals,
  DEFAULT_ASSIGNMENT_AUTO_STATUS_RULES,
  parseAssignmentAutoStatusRules,
  resolveStickyCancelled,
  type ComputeAssignmentStatusInput,
} from './assignment-auto-status.util';

const rules = DEFAULT_ASSIGNMENT_AUTO_STATUS_RULES;

const emptyCtx = {
  allWorkOrdersForScheduling: [] as ComputeAssignmentStatusInput['allWorkOrdersForScheduling'],
  equipmentStatusById: new Map<string, string>(),
  workerCertExpiryDates: new Map<string, (string | null | undefined)[]>(),
};

describe('resolveStickyCancelled', () => {
  it('keeps cancelled when no dto status', () => {
    expect(resolveStickyCancelled('cancelled', undefined)).toBe(true);
  });
  it('reopens when dto sets non-cancelled', () => {
    expect(resolveStickyCancelled('cancelled', 'pending')).toBe(false);
  });
});

describe('computeAssignmentStatus', () => {
  const now = new Date('2026-05-10T12:00:00');

  it('returns pending for empty shifts future window', () => {
    const r = computeAssignmentStatus({
      workOrderId: 'wo1',
      startDate: '2026-05-12',
      endDate: '2026-05-20',
      shifts: [],
      ...emptyCtx,
      rules,
      now,
    });
    expect(r.status).toBe('pending');
  });

  it('does not complete from date and staffing alone', () => {
    const r = computeAssignmentStatus({
      workOrderId: 'wo1',
      startDate: '2026-04-01',
      endDate: '2026-05-05',
      shifts: [
        {
          id: 's1',
          date: '2026-05-04',
          startTime: '07:00',
          endTime: '16:00',
          roles: [
            {
              id: 'r1',
              roleName: 'Flagger',
              requiredCount: 1,
              assignedWorkers: ['w1'],
              assignedEquipment: [],
              workerConfirmations: [
                { workerId: 'w1', status: 'confirmed' },
              ],
            },
          ],
        },
      ],
      ...emptyCtx,
      rules,
      now,
    });
    expect(r.status).toBe('confirmed');
    expect(r.signals.allWorkOrderShiftFormsSubmitted).toBe(false);
  });

  it('returns completed when every shift has submitted Work Order PDF', () => {
    const r = computeAssignmentStatus({
      workOrderId: 'wo1',
      startDate: '2026-04-01',
      endDate: '2026-05-20',
      shifts: [
        {
          id: 's1',
          date: '2026-05-04',
          startTime: '07:00',
          endTime: '16:00',
          roles: [
            {
              id: 'r1',
              roleName: 'Flagger',
              requiredCount: 1,
              assignedWorkers: ['w1'],
              assignedEquipment: [],
            },
          ],
        },
      ],
      ...emptyCtx,
      completedWorkOrderShiftKeys: new Set(['wo1:s1']),
      rules,
      now,
    });
    expect(r.status).toBe('completed');
    expect(r.signals.allWorkOrderShiftFormsSubmitted).toBe(true);
  });

  it('returns confirmed when fully staffed and confirmations in before start', () => {
    const r = computeAssignmentStatus({
      workOrderId: 'wo1',
      startDate: '2026-05-12',
      endDate: '2026-05-20',
      shifts: [
        {
          id: 's1',
          date: '2026-05-15',
          startTime: '07:00',
          endTime: '16:00',
          roles: [
            {
              id: 'r1',
              roleName: 'Flagger',
              requiredCount: 1,
              assignedWorkers: ['w1'],
              assignedEquipment: [],
              workerConfirmations: [
                { workerId: 'w1', status: 'confirmed' },
              ],
            },
          ],
        },
      ],
      ...emptyCtx,
      rules,
      now,
    });
    expect(r.status).toBe('confirmed');
    expect(r.signals.allShiftsFullyStaffed).toBe(true);
  });

  it('returns critical on decline', () => {
    const r = computeAssignmentStatus({
      workOrderId: 'wo1',
      startDate: '2026-05-12',
      endDate: '2026-05-20',
      shifts: [
        {
          id: 's1',
          date: '2026-05-15',
          startTime: '07:00',
          endTime: '16:00',
          roles: [
            {
              id: 'r1',
              roleName: 'Flagger',
              requiredCount: 1,
              assignedWorkers: ['w1'],
              assignedEquipment: [],
              workerConfirmations: [
                { workerId: 'w1', status: 'declined' },
              ],
            },
          ],
        },
      ],
      ...emptyCtx,
      rules,
      now,
    });
    expect(r.status).toBe('critical');
  });

  it('dtoStatus cancelled wins', () => {
    const r = computeAssignmentStatus({
      workOrderId: 'wo1',
      dtoStatus: 'cancelled',
      startDate: '2026-05-12',
      endDate: '2026-05-20',
      shifts: [],
      ...emptyCtx,
      rules,
      now,
    });
    expect(r.status).toBe('cancelled');
  });
});

describe('parseAssignmentAutoStatusRules', () => {
  it('merges partial', () => {
    const m = parseAssignmentAutoStatusRules({
      coverageAtRisk: 0.9,
    });
    expect(m.coverageAtRisk).toBe(0.9);
    expect(m.coverageCritical).toBe(rules.coverageCritical);
  });
});

describe('computeAssignmentSignals equipment', () => {
  const now = new Date('2026-05-10T12:00:00');
  it('counts maintenance equipment', () => {
    const s = computeAssignmentSignals({
      workOrderId: 'wo1',
      startDate: '2026-05-12',
      endDate: '2026-05-20',
      shifts: [
        {
          id: 's1',
          date: '2026-05-15',
          startTime: '07:00',
          endTime: '16:00',
          roles: [
            {
              id: 'r1',
              roleName: 'Foreman',
              requiredCount: 1,
              assignedWorkers: ['w1'],
              assignedEquipment: ['eq1'],
              workerConfirmations: [
                { workerId: 'w1', status: 'confirmed' },
              ],
            },
          ],
        },
      ],
      allWorkOrdersForScheduling: [],
      equipmentStatusById: new Map([['eq1', 'maintenance']]),
      workerCertExpiryDates: new Map(),
      rules,
      now,
    });
    expect(s.equipmentIssueSlots).toBe(1);
    expect(s.equipmentOk).toBe(false);
  });
});
