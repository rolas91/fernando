import { PayrollReportController } from './payroll-report.controller';
import { type UserAccessContext } from '../../access/ports/access.port';
import type { Request } from 'express';

const actor = {
  permissions: [
    'timesheets.read',
    'workers.read',
    'projects.read',
    'work-orders.read',
    'shifts.read',
    'company-settings.read',
  ],
} as UserAccessContext;
const request = { user: actor } as Request & { user: UserAccessContext };
function setup() {
  const rows = Array.from({ length: 20 }, (_, i) => ({
    id: 't' + i,
    workerId: 'w',
    projectId: 'p',
    workOrderId: 'wo',
    shiftId: 's',
    variant: 'internal',
    date: '2026-11-05',
    clockIn: '18:00',
    clockOut: '03:00',
    regularHours: '8',
    overtimeHours: '1',
    doubleTimeHours: '0',
    lunchTaken: true,
    firstName: 'Ana',
    lastName: 'Smith',
    hourlyRate: '20',
    projectName: 'Project',
    projectNumber: '0593',
    orderNumber: '40',
    shiftDate: '2026-11-05',
    shiftName: 'Night',
    shiftTemplateId: null,
    startTime: '18:00',
    defaultRoleStartTime: null,
    roleStartTime: null,
  }));
  const query = jest
    .fn()
    .mockResolvedValueOnce([{ allStart: '2024-01-01', allEnd: '2027-01-12' }])
    .mockResolvedValueOnce(rows);
  const prepareForRead = jest.fn(async () => {}),
    findAll = jest.fn(async () => []);
  const source = {
    query,
    getRepository: jest.fn(() => ({ find: jest.fn(async () => []) })),
  };
  const controller = new PayrollReportController(
    source as never,
    { prepareForRead } as never,
    { findAll } as never,
  );
  return { controller, query, prepareForRead, rows };
}
describe('payroll report contract', () => {
  it('returns seven rows with full period totals, compact recent entries and no raw payroll history', async () => {
    const { controller, query, prepareForRead } = setup();
    const result = await controller.list(
      { today: '2026-11-05', page: '2' },
      request,
    );
    expect(result.pageRows).toHaveLength(7);
    expect(result.totalRecords).toBe(20);
    expect(result.totalPages).toBe(3);
    expect(result.totals.grossPay).toBe(4370);
    expect(result.totals.hours).toBe(180);
    expect(result.totals.timesheets).toBe(1);
    expect(result.workerSummaries[0].assignments).toBe(1);
    expect(result.dateBounds.allStart).toBe('2024-01-01');
    expect(result.dateBounds.allEnd).toBe('2027-01-12');
    expect(result.workerSummaries[0].recentTimesheets).toEqual([
      { id: 't0', projectId: 'p', workOrderId: 'wo', date: '2026-11-05' },
    ]);
    expect(result).not.toHaveProperty('detailedRows');
    expect(JSON.stringify(result)).not.toContain('hourlyRate":"');
    expect(prepareForRead).toHaveBeenCalledTimes(1);
    const sql = query.mock.calls[1][0] as string;
    expect(sql).toContain("t.variant = 'internal'");
    expect(sql).toContain('wo.deleted_at IS NULL');
    expect(sql).toContain('s.work_order_id = wo.id');
    expect(sql).toContain('s.pm_approved_at IS NOT NULL');
    expect(sql).not.toContain('t.signature');
    expect(query.mock.calls[1][1]).toEqual([null, null]);
  });
  it.each([
    ['week', '2026-11-01', '2026-11-07'],
    ['last_week', '2026-10-25', '2026-10-31'],
    ['custom', '2026-10-01', '2026-10-04'],
  ])(
    'binds %s date limits before loading payroll inputs',
    async (rangeMode, start, end) => {
      const { controller, query } = setup();
      await controller.list(
        {
          today: '2026-11-05',
          rangeMode,
          start: '2026-10-01',
          end: '2026-10-04',
        },
        request,
      );
      expect(query.mock.calls[1][1]).toEqual([start, end]);
      expect(query.mock.calls[1][0]).toContain('t.date >= $1::date');
    },
  );
  it('exports all filtered rows, independently of visible page', async () => {
    const { controller } = setup();
    expect(
      await controller.export({ today: '2026-11-05', page: '2' }, request),
    ).toHaveLength(20);
  });
  it('rejects missing wage access, invalid dates and injection before reading data', async () => {
    const { controller, query, prepareForRead } = setup();
    await expect(
      controller.list({ today: '2026-11-05' }, {
        user: { ...actor, permissions: ['timesheets.read'] },
      } as never),
    ).rejects.toThrow('requires access');
    await expect(
      controller.list({ today: '2026-02-30' }, request),
    ).rejects.toThrow('Invalid payroll date');
    await expect(
      controller.list(
        { today: '2026-11-05', page: '1;DROP TABLE timesheets' },
        request,
      ),
    ).rejects.toThrow('positive integers');
    expect(query).not.toHaveBeenCalled();
    expect(prepareForRead).not.toHaveBeenCalled();
  });
});
