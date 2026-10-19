jest.mock('../../integrations/integrations.service', () => ({
  IntegrationsService: class {},
}));
import {
  calculateTimesheetHours,
  timesheetCalculationRules,
} from './timesheets.service';
import { computeShiftStatus } from '../utils/shift-status.util';
import { businessDate } from '../utils/shift-date.util';
import { isOnlyShiftForDay } from '../utils/single-shift-day.util';
import { WorkOrdersService } from './work-orders.service';
import { FormSubmissionsService } from './form-submissions.service';
import { WorkOrderShiftsWriteService } from './work-order-shifts-write.service';

describe('requested improvements', () => {
  it('rejects PM approval of future shifts without saving', async () => {
    const service: any = Object.create(WorkOrderShiftsWriteService.prototype);
    service.shiftsRepo = {
      findOne: async () => ({ date: '2999-01-01' }),
      save: jest.fn(),
    };
    await expect(
      service.approveShift({ workOrderId: 'w', shiftId: 's', userId: 'u' }),
    ).rejects.toThrow('future shift');
    expect(service.shiftsRepo.save).not.toHaveBeenCalled();
  });
  const rules = timesheetCalculationRules({ noLunchCreditEnabled: false });
  it('tops up only a single weekday shift and preserves actual clocks', () => {
    const row = { startTime: '08:00', endTime: '13:00', date: '2026-10-19' };
    expect(
      calculateTimesheetHours({ ...row, singleShiftDay: true }, rules),
    ).toEqual({ st: 8, ot: 0, dt: 0, total: 8 });
    expect(
      calculateTimesheetHours({ ...row, singleShiftDay: false }, rules).st,
    ).toBe(5);
    expect(row.endTime).toBe('13:00');
  });
  it('preserves overtime and weekend double time', () => {
    expect(
      calculateTimesheetHours(
        {
          startTime: '08:00',
          endTime: '18:00',
          date: '2026-10-19',
          singleShiftDay: true,
        },
        rules,
      ),
    ).toEqual({ st: 8, ot: 2, dt: 0, total: 10 });
    expect(
      calculateTimesheetHours(
        {
          startTime: '08:00',
          endTime: '13:00',
          date: '2026-10-18',
          singleShiftDay: true,
        },
        rules,
      ),
    ).toEqual({ st: 0, ot: 0, dt: 5, total: 5 });
  });
  it.each([
    [[{ id: 's' }], true],
    [[{ id: 's' }, { id: 's' }], true],
    [[{ id: 's' }, { id: 'other' }], false],
    [[], false],
  ])('counts distinct shifts per worker/day: %j', async (rows, expected) => {
    const query: any = { getMany: jest.fn().mockResolvedValue(rows) };
    for (const name of ['innerJoin', 'where', 'andWhere', 'select'])
      query[name] = jest.fn().mockReturnValue(query);
    const manager: any = {
      getRepository: () => ({ createQueryBuilder: () => query }),
    };
    expect(await isOnlyShiftForDay(manager, 'worker', 's', '2026-10-19')).toBe(
      expected,
    );
  });
  it('does not complete future shifts even with submitted forms', () => {
    const result = computeShiftStatus({
      workOrderId: 'w',
      shift: {
        id: 's',
        date: '2999-01-01',
        status: 'ready_to_notify',
        roles: [],
      },
      completion: { isShiftCompleted: () => true },
    });
    expect(result.status).toBe('ready_to_notify');
    expect(
      computeShiftStatus({
        workOrderId: 'w',
        shift: { id: 's', date: '2000-01-01', status: 'ready_to_notify' },
        completion: { isShiftCompleted: () => true },
      }).status,
    ).toBe('shift_completed');
  });
  it('uses the business date near UTC midnight', () => {
    const previous = process.env.BUSINESS_TIME_ZONE;
    process.env.BUSINESS_TIME_ZONE = 'America/Los_Angeles';
    try {
      expect(businessDate(new Date('2026-10-19T01:00:00Z'))).toBe('2026-10-18');
    } finally {
      if (previous === undefined) delete process.env.BUSINESS_TIME_ZONE;
      else process.env.BUSINESS_TIME_ZONE = previous;
    }
  });
  it('rejects future Work Order submission but allows drafts', async () => {
    const service: any = Object.create(FormSubmissionsService.prototype);
    service.shiftsQuery = {
      loadShiftsForWorkOrder: async () => [{ id: 's', date: '2999-01-01' }],
    };
    await expect(
      service.assertSubmissionDate(
        'submitted',
        { category: 'work_order' },
        'w',
        's',
      ),
    ).rejects.toThrow('future shift');
    await expect(
      service.assertSubmissionDate(
        'draft',
        { category: 'work_order' },
        'w',
        's',
      ),
    ).resolves.toBeUndefined();
  });
  function emailService() {
    const service: any = Object.create(WorkOrdersService.prototype);
    Object.assign(service, {
      workOrdersRepo: { findOne: async () => ({ projectId: 'p' }) },
      projectsRepo: { findOne: async () => ({ clientId: 'c' }) },
      clientsRepo: { findOne: async () => ({ email: 'client@example.com' }) },
      formSubmissionsRepo: {
        findOne: jest.fn(async () => ({
          id: 'sub',
          templateId: 't',
          pdfUrl: '/files/test.pdf',
        })),
      },
      formTemplatesRepo: { findOne: async () => ({ category: 'work_order' }) },
      readGeneratedPdf: jest.fn(async () => Buffer.from('%PDF-test')),
      integrations: {
        sendWorkOrderDocument: jest.fn(async () => ({ success: true })),
      },
      logger: { error: jest.fn() },
    });
    return service;
  }
  it('sends only the confirmed project client and scoped submitted PDF', async () => {
    const service = emailService();
    await expect(
      service.emailWorkOrderPdf('w', 'sub', 'client@example.com'),
    ).resolves.toEqual({ success: true });
    expect(service.formSubmissionsRepo.findOne).toHaveBeenCalledWith({
      where: { id: 'sub', workOrderId: 'w', status: 'submitted' },
    });
    expect(service.integrations.sendWorkOrderDocument).toHaveBeenCalledWith(
      'client@example.com',
      'work-order-sub.pdf',
      expect.any(Buffer),
    );
  });
  it('does not send when the recipient changed or delivery failed', async () => {
    const service = emailService();
    await expect(
      service.emailWorkOrderPdf('w', 'sub', 'other@example.com'),
    ).rejects.toThrow('email changed');
    expect(service.integrations.sendWorkOrderDocument).not.toHaveBeenCalled();
    service.integrations.sendWorkOrderDocument.mockRejectedValue(
      new Error('SMTP unavailable'),
    );
    await expect(
      service.emailWorkOrderPdf('w', 'sub', 'client@example.com'),
    ).rejects.toThrow('Could not send');
  });
});
