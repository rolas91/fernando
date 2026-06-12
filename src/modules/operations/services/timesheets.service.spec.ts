import {
  calculateTimesheetHours,
  timesheetCalculationRules,
  validateTimesheetStartTime,
} from './timesheets.service';

describe('calculateTimesheetHours', () => {
  const rules = timesheetCalculationRules({
    regularHoursLimit: 8,
    doubleTimeThreshold: 12,
    noLunchCreditEnabled: true,
    noLunchCreditMinimumHours: 7,
    noLunchCreditHours: 1,
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

  it('does not add credit when lunch and break were taken', () => {
    expect(
      calculateTimesheetHours(
        { startTime: '07:00', endTime: '16:00', lunchTaken: true },
        rules,
      ),
    ).toEqual({ st: 8, ot: 1, dt: 0, total: 9 });
  });

  it('allows the credit rule to be disabled', () => {
    expect(
      calculateTimesheetHours(
        { startTime: '07:00', endTime: '16:00', lunchTaken: false },
        { ...rules, noLunchCreditEnabled: false },
      ),
    ).toEqual({ st: 8, ot: 1, dt: 0, total: 9 });
  });
});

describe('validateTimesheetStartTime', () => {
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
});
