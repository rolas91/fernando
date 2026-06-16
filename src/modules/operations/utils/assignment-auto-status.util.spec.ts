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

  it('returns pending when every shift ended but required forms remain incomplete', () => {
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
    expect(r.status).toBe('pending');
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

  it('returns pending, not at risk, when future fully staffed shifts still need confirmations', () => {
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
              workerConfirmations: [{ workerId: 'w1', status: 'pending' }],
            },
          ],
        },
      ],
      ...emptyCtx,
      rules,
      now,
    });

    expect(r.status).toBe('pending');
    expect(r.signals.allShiftsFullyStaffed).toBe(true);
    expect(r.signals.awaitingConfirmationWithFullStaff).toBe(true);
  });

  it('returns pending when confirmations remain pending after every shift ended', () => {
    const r = computeAssignmentStatus({
      workOrderId: 'wo1',
      startDate: '2026-05-09',
      endDate: '2026-05-20',
      shifts: [
        {
          id: 's1',
          date: '2026-05-09',
          startTime: '07:00',
          endTime: '16:00',
          roles: [
            {
              id: 'r1',
              roleName: 'Flagger',
              requiredCount: 1,
              assignedWorkers: ['w1'],
              assignedEquipment: [],
              workerConfirmations: [{ workerId: 'w1', status: 'pending' }],
            },
          ],
        },
      ],
      ...emptyCtx,
      rules,
      now,
    });

    expect(r.status).toBe('pending');
    expect(r.signals.awaitingConfirmationWithFullStaff).toBe(false);
    expect(r.signals.assignedWorkerWeeklyOvertimeRisk).toBe(false);
    expect(r.signals.anyShiftInProgress).toBe(false);
    expect(r.signals.operationalShiftCount).toBe(0);
  });

  it('returns in progress only while a confirmed shift is currently active', () => {
    const r = computeAssignmentStatus({
      workOrderId: 'wo1',
      startDate: '2026-05-01',
      endDate: '2026-05-31',
      shifts: [
        {
          id: 's1',
          date: '2026-05-10',
          startTime: '07:00',
          endTime: '16:00',
          roles: [
            {
              id: 'r1',
              roleName: 'Flagger',
              requiredCount: 1,
              assignedWorkers: ['w1'],
              assignedEquipment: [],
              workerConfirmations: [{ workerId: 'w1', status: 'confirmed' }],
            },
          ],
        },
      ],
      ...emptyCtx,
      rules,
      now,
    });

    expect(r.status).toBe('in_progress');
    expect(r.signals.anyShiftInProgress).toBe(true);
  });

  it('does not use the assignment date range to mark a future shift in progress', () => {
    const r = computeAssignmentStatus({
      workOrderId: 'wo1',
      startDate: '2026-05-01',
      endDate: '2026-05-31',
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
              workerConfirmations: [{ workerId: 'w1', status: 'confirmed' }],
            },
          ],
        },
      ],
      ...emptyCtx,
      rules,
      now,
    });

    expect(r.status).toBe('confirmed');
    expect(r.signals.anyShiftInProgress).toBe(false);
  });

  it('keeps an overnight shift in progress until its next-day end time', () => {
    const r = computeAssignmentStatus({
      workOrderId: 'wo1',
      startDate: '2026-05-10',
      endDate: '2026-05-11',
      shifts: [
        {
          id: 's1',
          date: '2026-05-10',
          startTime: '19:00',
          endTime: '04:00',
          roles: [
            {
              id: 'r1',
              roleName: 'Lead',
              requiredCount: 1,
              assignedWorkers: ['w1'],
              assignedEquipment: [],
              workerConfirmations: [{ workerId: 'w1', status: 'confirmed' }],
            },
          ],
        },
      ],
      ...emptyCtx,
      rules,
      now: new Date('2026-05-11T02:00:00'),
    });

    expect(r.status).toBe('in_progress');
    expect(r.signals.anyShiftInProgress).toBe(true);
  });

  it('does not mark at risk for hours scheduled outside the evaluated shift week', () => {
    const r = computeAssignmentStatus({
      workOrderId: 'wo_current',
      startDate: '2026-05-26',
      endDate: '2026-05-26',
      shifts: [
        {
          id: 's_current',
          date: '2026-05-26',
          startTime: '07:00',
          endTime: '16:00',
          roles: [
            {
              id: 'r_current',
              roleName: 'Lead',
              requiredCount: 1,
              assignedWorkers: ['w1'],
              assignedEquipment: [],
              workerConfirmations: [{ workerId: 'w1', status: 'confirmed' }],
            },
          ],
        },
      ],
      allWorkOrdersForScheduling: [
        {
          id: 'wo_current',
          status: 'in_progress',
          shifts: [
            {
              id: 's_current',
              date: '2026-05-26',
              startTime: '07:00',
              endTime: '16:00',
              roles: [{ id: 'r_current', requiredCount: 1, assignedWorkers: ['w1'], assignedEquipment: [] }],
            },
          ],
        },
        {
          id: 'wo_previous_week',
          status: 'at_risk',
          shifts: [
            {
              id: 's_prev_1',
              date: '2026-05-18',
              startTime: '07:00',
              endTime: '16:00',
              roles: [{ id: 'r_prev_1', requiredCount: 1, assignedWorkers: ['w1'], assignedEquipment: [] }],
            },
            {
              id: 's_prev_2',
              date: '2026-05-19',
              startTime: '07:00',
              endTime: '16:00',
              roles: [{ id: 'r_prev_2', requiredCount: 1, assignedWorkers: ['w1'], assignedEquipment: [] }],
            },
            {
              id: 's_prev_3',
              date: '2026-05-20',
              startTime: '07:00',
              endTime: '16:00',
              roles: [{ id: 'r_prev_3', requiredCount: 1, assignedWorkers: ['w1'], assignedEquipment: [] }],
            },
            {
              id: 's_prev_4',
              date: '2026-05-21',
              startTime: '07:00',
              endTime: '16:00',
              roles: [{ id: 'r_prev_4', requiredCount: 1, assignedWorkers: ['w1'], assignedEquipment: [] }],
            },
            {
              id: 's_prev_5',
              date: '2026-05-22',
              startTime: '07:00',
              endTime: '16:00',
              roles: [{ id: 'r_prev_5', requiredCount: 1, assignedWorkers: ['w1'], assignedEquipment: [] }],
            },
          ],
        },
      ],
      equipmentStatusById: new Map(),
      workerCertExpiryDates: new Map(),
      rules,
      now: new Date('2026-05-26T12:00:00'),
    });
    expect(r.status).toBe('in_progress');
    expect(r.signals.assignedWorkerWeeklyOvertimeRisk).toBe(false);
  });

  it('marks at risk when assigned worker exceeds hours in the evaluated week', () => {
    const sameWeekShifts = [26, 27, 28, 29, 30].map((day) => ({
      id: `s_may_${day}`,
      date: `2026-05-${day}`,
      startTime: '07:00',
      endTime: '16:00',
      roles: [{ id: `r_may_${day}`, requiredCount: 1, assignedWorkers: ['w1'], assignedEquipment: [] }],
    }));
    const r = computeAssignmentStatus({
      workOrderId: 'wo_current',
      startDate: '2026-05-26',
      endDate: '2026-05-30',
      shifts: [
        {
          ...sameWeekShifts[0],
          roles: [
            {
              id: 'r_current',
              roleName: 'Lead',
              requiredCount: 1,
              assignedWorkers: ['w1'],
              assignedEquipment: [],
              workerConfirmations: [{ workerId: 'w1', status: 'confirmed' }],
            },
          ],
        },
      ],
      allWorkOrdersForScheduling: [
        { id: 'wo_current', status: 'in_progress', shifts: [sameWeekShifts[0]] },
        { id: 'wo_same_week', status: 'confirmed', shifts: sameWeekShifts.slice(1) },
      ],
      equipmentStatusById: new Map(),
      workerCertExpiryDates: new Map(),
      rules,
      now: new Date('2026-05-26T12:00:00'),
    });
    expect(r.status).toBe('at_risk');
    expect(r.signals.assignedWorkerWeeklyOvertimeRisk).toBe(true);
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
