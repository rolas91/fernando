import {
  calculateTimesheetHours,
  deterministicTimesheetId,
  timesheetCalculationRules,
  TimesheetsService,
  validateTimesheetStartTime,
  normalizeTimesheetSubmissionRow,
} from './timesheets.service';

describe('deterministicTimesheetId', () => {
  const workOrderId = 'wo_12345678-1234-1234-1234-123456789012';
  const shiftId = 'shift_12345678-1234-1234-1234-123456789012';
  const workerId = 'worker_12345678-1234-1234-1234-123456789012';

  it('creates stable IDs that fit the database column', () => {
    const id = deterministicTimesheetId(
      workOrderId,
      shiftId,
      workerId,
      'client',
    );

    expect(id).toBe(
      deterministicTimesheetId(workOrderId, shiftId, workerId, 'client'),
    );
    expect(id.length).toBeLessThanOrEqual(64);
    expect(id).toMatch(/_client$/);
  });

  it('keeps client and internal timesheets distinct', () => {
    const clientId = deterministicTimesheetId(
      workOrderId,
      shiftId,
      workerId,
      'client',
    );
    const internalId = deterministicTimesheetId(
      workOrderId,
      shiftId,
      workerId,
      'internal',
    );

    expect(clientId).not.toBe(internalId);
    expect(internalId.length).toBeLessThanOrEqual(64);
    expect(internalId).toMatch(/_internal$/);
  });
});

describe('calculateTimesheetHours', () => {
  const rules = timesheetCalculationRules({
    regularHoursLimit: 8,
    doubleTimeThreshold: 12,
    noLunchCreditEnabled: true,
    noLunchCreditMinimumHours: 7,
    noLunchCreditHours: 1,
    noLunchCreditTarget: 'st',
    noLunchCreditEffectiveDate: '',
  });

  it('does not add credit at the exact configured threshold', () => {
    expect(
      calculateTimesheetHours(
        { startTime: '07:00', endTime: '14:00', lunchTaken: false },
        rules,
      ),
    ).toEqual({ st: 7, ot: 0, dt: 0, total: 7 });
  });

  it('adds the configured ST credit above the threshold', () => {
    expect(
      calculateTimesheetHours(
        { startTime: '07:00', endTime: '16:00', lunchTaken: false },
        rules,
      ),
    ).toEqual({ st: 9, ot: 1, dt: 0, total: 10 });
  });

  it('adds the configured credit to OT on or after the effective date', () => {
    expect(
      calculateTimesheetHours(
        {
          startTime: '07:00',
          endTime: '16:00',
          date: '2026-07-08',
          lunchTaken: false,
        },
        {
          ...rules,
          noLunchCreditTarget: 'ot',
          noLunchCreditEffectiveDate: '2026-07-08',
        },
      ),
    ).toEqual({ st: 8, ot: 2, dt: 0, total: 10 });
  });

  it('keeps the configured credit on ST before the effective date', () => {
    expect(
      calculateTimesheetHours(
        {
          startTime: '07:00',
          endTime: '16:00',
          date: '2026-07-07',
          lunchTaken: false,
        },
        {
          ...rules,
          noLunchCreditTarget: 'ot',
          noLunchCreditEffectiveDate: '2026-07-08',
        },
      ),
    ).toEqual({ st: 9, ot: 1, dt: 0, total: 10 });
  });

  it('does not add credit when lunch and break were taken', () => {
    expect(
      calculateTimesheetHours(
        { startTime: '07:00', endTime: '16:00', lunchTaken: true },
        rules,
      ),
    ).toEqual({ st: 8, ot: 1, dt: 0, total: 9 });
  });

  it('deducts configured unpaid time when lunch and break were taken', () => {
    expect(
      calculateTimesheetHours(
        { startTime: '07:00', endTime: '16:00', lunchTaken: true },
        {
          ...rules,
          yesLunchDeductionEnabled: true,
          yesLunchDeductionMinimumHours: 7,
          yesLunchDeductionHours: 1,
        },
      ),
    ).toEqual({ st: 8, ot: 0, dt: 0, total: 8 });
  });

  it('allows the credit rule to be disabled', () => {
    expect(
      calculateTimesheetHours(
        { startTime: '07:00', endTime: '16:00', lunchTaken: false },
        { ...rules, noLunchCreditEnabled: false },
      ),
    ).toEqual({ st: 8, ot: 1, dt: 0, total: 9 });
  });

  it('deducts break minutes before distributing ST, OT, and DT', () => {
    expect(
      calculateTimesheetHours(
        {
          startTime: '07:00',
          endTime: '16:00',
          breakMinutes: 30,
          lunchTaken: true,
        },
        rules,
      ),
    ).toEqual({ st: 8, ot: 0.5, dt: 0, total: 8.5 });
  });

  it('calculates an overnight shift using the next-day end time', () => {
    expect(
      calculateTimesheetHours(
        {
          startTime: '07:00 PM',
          endTime: '04:00 AM',
          scheduledStartTime: '19:00',
          scheduledEndTime: '04:00',
          lunchTaken: true,
        },
        rules,
      ),
    ).toEqual({ st: 8, ot: 1, dt: 0, total: 9 });
  });

  it('classifies every Saturday hour as OT and hours after 12 as DT', () => {
    expect(
      calculateTimesheetHours(
        {
          startTime: '06:00',
          endTime: '20:00',
          date: '2026-08-15',
          lunchTaken: true,
        },
        rules,
      ),
    ).toEqual({ st: 0, ot: 12, dt: 2, total: 14 });
  });

  it('classifies every Sunday hour as DT', () => {
    expect(
      calculateTimesheetHours(
        {
          startTime: '07:00',
          endTime: '16:00',
          date: '2026-08-16',
          lunchTaken: true,
        },
        rules,
      ),
    ).toEqual({ st: 0, ot: 0, dt: 9, total: 9 });
  });

  it('uses editable weekend switches and Saturday threshold', () => {
    expect(
      calculateTimesheetHours(
        {
          startTime: '07:00',
          endTime: '18:00',
          date: '2026-08-15',
          lunchTaken: true,
        },
        {
          ...rules,
          saturdayAllOvertime: true,
          saturdayDoubleTimeThreshold: 10,
        },
      ),
    ).toEqual({ st: 0, ot: 10, dt: 1, total: 11 });

    expect(
      calculateTimesheetHours(
        {
          startTime: '07:00',
          endTime: '16:00',
          date: '2026-08-15',
          lunchTaken: true,
        },
        { ...rules, saturdayAllOvertime: false },
      ),
    ).toEqual({ st: 8, ot: 1, dt: 0, total: 9 });
  });
});

describe('validateTimesheetStartTime', () => {
  it('keeps early starts disabled unless configured', () => {
    expect(timesheetCalculationRules().allowEarlyStart).toBe(false);
    expect(
      timesheetCalculationRules({ allowEarlyStart: true }).allowEarlyStart,
    ).toBe(true);
  });

  it('accepts an earlier start when enabled and recalculates overnight hours', () => {
    expect(() =>
      validateTimesheetStartTime('02:00 PM', '16:00', '08:00', true),
    ).not.toThrow();
    const result = normalizeTimesheetSubmissionRow(
      {
        startTime: '02:00 PM',
        endTime: '08:00 AM',
        scheduledStartTime: '16:00',
        scheduledEndTime: '08:00',
        shiftDate: '2026-10-15',
        lunchTaken: true,
        st: 0,
        ot: 0,
        dt: 0,
        total: 0,
      },
      timesheetCalculationRules({
        allowEarlyStart: true,
        yesLunchDeductionEnabled: true,
        yesLunchDeductionMinimumHours: 7,
        yesLunchDeductionHours: 0.5,
      }),
    );
    expect(result).toMatchObject({
      startTime: '02:00 PM',
      st: 8,
      ot: 4,
      dt: 5.5,
      total: 17.5,
    });
  });

  it('still rejects malformed start times when early starts are enabled', () => {
    expect(() =>
      validateTimesheetStartTime('invalid', '16:00', '08:00', true),
    ).toThrow('format');
  });
  it('allows the scheduled start time', () => {
    expect(() => validateTimesheetStartTime('07:00 AM', '07:00')).not.toThrow();
  });

  it('allows a later start time', () => {
    expect(() => validateTimesheetStartTime('08:00 AM', '07:00')).not.toThrow();
  });

  it('rejects a start time before the scheduled shift start', () => {
    expect(() => validateTimesheetStartTime('06:59 AM', '07:00')).toThrow(
      'cannot be earlier',
    );
  });

  it('accepts the scheduled start for an overnight shift', () => {
    expect(() =>
      validateTimesheetStartTime('07:00 PM', '19:00', '04:00'),
    ).not.toThrow();
  });
});

describe('TimesheetsService.upsertShiftRows manual edit protection', () => {
  const existing = {
    id: 'ts-1',
    workerId: 'worker-1',
    workOrderId: 'wo-1',
    shiftId: 'shift-1',
    variant: 'internal',
    projectId: 'project-1',
    sourceSubmissionId: 'submission-1',
    date: '2026-10-19',
    clockIn: '07:00',
    clockOut: '16:00',
    breakMinutes: 0,
    regularHours: '8',
    overtimeHours: '0',
    doubleTimeHours: '0',
    lunchTaken: false,
    employeeNote: '',
    signature: '',
    status: 'completed',
    manuallyEdited: true,
    approvedBy: '',
    rejectedReason: '',
    notes: '',
  };

  const row = {
    workerId: 'worker-1',
    workOrderId: 'wo-1',
    shiftId: 'shift-1',
    projectId: 'project-1',
    shiftDate: '2026-10-19',
    startTime: '07:00',
    endTime: '17:00',
    status: 'completed',
    lunchTaken: false,
    breakMinutes: 0,
  };

  function createService() {
    const save = jest.fn(async (value) => value);
    const service: any = Object.create(TimesheetsService.prototype);
    service.timesheetsRepo = {
      findOne: jest.fn(async () => ({ ...existing })),
      create: jest.fn((value) => value),
      save,
    };
    service.companySettingsRepo = {
      findOne: async () => ({ overtimeRules: {} }),
    };
    service.shiftsQuery = {
      loadShiftsForWorkOrder: async () => [
        {
          id: 'shift-1',
          date: '2026-10-19',
          startTime: '07:00',
          endTime: '16:00',
          roles: [{ assignedWorkers: ['worker-1'], startTime: '07:00' }],
        },
      ],
    };
    service.shiftCatalogRepo = {
      findOne: async () => null,
      find: async () => [],
    };
    service.workOrdersRepo = { manager: {} };
    service.realtime = { emitTableUpdated: jest.fn() };
    service.isOnlyShiftForDay = async () => false;
    return { service, save };
  }

  it('keeps manually edited rows protected by default', async () => {
    const { service, save } = createService();
    await service.upsertShiftRows([row], {
      workOrderId: 'wo-1',
      shiftId: 'shift-1',
      sourceSubmissionId: 'submission-1',
    });
    expect(save).not.toHaveBeenCalled();
  });

  it('updates the same rows when a Work Order resubmit owns them', async () => {
    const { service, save } = createService();
    await service.upsertShiftRows([row], {
      workOrderId: 'wo-1',
      shiftId: 'shift-1',
      sourceSubmissionId: 'submission-1',
      overwriteManualEdits: true,
    });
    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0][0]).toMatchObject({
      id: 'ts-1',
      clockOut: '17:00',
      manuallyEdited: false,
    });
  });
});
