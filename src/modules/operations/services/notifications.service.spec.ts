import { NotificationsService } from './notifications.service';
import { Notification } from '../../../entities/notification.entity';
import { WorkOrderShift } from '../../../entities/work-order-shift.entity';
import { ShiftCancellationConfirmation } from '../../../entities/shift-cancellation-confirmation.entity';

describe('cancellation acknowledgements', () => {
  function setup() {
    const item = {
      id: 'n1',
      type: 'shift_cancelled',
      workOrderId: 'wo1',
      shiftId: 's1',
      workerId: 'w1',
      read: false,
      acknowledgedAt: null as Date | null,
    };
    const receipt = {
      notificationId: 'n1',
      acknowledgedAt: null as Date | null,
    };
    const notifications = {
      findOne: jest.fn().mockResolvedValue(item),
      save: jest.fn(async (value) => value),
    };
    const receipts = {
      findOne: jest.fn().mockResolvedValue(receipt),
      save: jest.fn(async (value) => value),
    };
    const shifts = {
      findOne: jest.fn().mockResolvedValue({ cancelled: true }),
    };
    const manager = {
      getRepository: (entity: unknown) =>
        entity === Notification
          ? notifications
          : entity === WorkOrderShift
            ? shifts
            : entity === ShiftCancellationConfirmation
              ? receipts
              : null,
    };
    const repo = {
      ...notifications,
      manager: {
        transaction: (fn: (m: typeof manager) => unknown) => fn(manager),
      },
    };
    const workers = { findOne: jest.fn().mockResolvedValue({ id: 'w1' }) };
    const realtime = { emitTableUpdated: jest.fn() };
    const service = new NotificationsService(
      repo as never,
      workers as never,
      realtime as never,
    );
    const actor = { email: 'worker@example.com' } as never;
    return {
      service,
      actor,
      item,
      receipt,
      notifications,
      receipts,
      shifts,
      realtime,
    };
  }

  it('persists a separate receipt, marks read, refreshes the scheduler and is idempotent', async () => {
    const s = setup();
    const result = await s.service.acknowledgeCancellation('n1', s.actor);
    expect(result.read).toBe(true);
    expect(result.acknowledgedAt).toBeInstanceOf(Date);
    const first = result.acknowledgedAt;
    await s.service.acknowledgeCancellation('n1', s.actor);
    expect(s.receipt.acknowledgedAt).toBe(first);
    expect(s.notifications.findOne).toHaveBeenCalledWith({
      where: { id: 'n1', workerId: 'w1' },
    });
    expect(s.realtime.emitTableUpdated).toHaveBeenCalledWith('work_orders');
  });

  it('rejects notifications owned by another worker', async () => {
    const s = setup();
    s.notifications.findOne.mockResolvedValue(null);
    await expect(
      s.service.acknowledgeCancellation('n1', s.actor),
    ).rejects.toThrow('Notification not found');
    expect(s.receipts.save).not.toHaveBeenCalled();
  });

  it('rejects ordinary assignment notifications', async () => {
    const s = setup();
    s.item.type = 'shift_assignment';
    await expect(
      s.service.acknowledgeCancellation('n1', s.actor),
    ).rejects.toThrow('not a shift cancellation');
    expect(s.receipts.save).not.toHaveBeenCalled();
  });

  it('rejects restored shifts and stale cancellation cycles', async () => {
    const s = setup();
    s.shifts.findOne.mockResolvedValue({ cancelled: false });
    await expect(
      s.service.acknowledgeCancellation('n1', s.actor),
    ).rejects.toThrow('no longer cancelled');
    s.shifts.findOne.mockResolvedValue({ cancelled: true });
    s.receipts.findOne.mockResolvedValue(null);
    await expect(
      s.service.acknowledgeCancellation('n1', s.actor),
    ).rejects.toThrow('no longer current');
    expect(s.receipts.save).not.toHaveBeenCalled();
  });

  it('opening a notification does not acknowledge the cancellation', async () => {
    const s = setup();
    await s.service.markMobileRead('n1', s.actor);
    expect(s.item.read).toBe(true);
    expect(s.item.acknowledgedAt).toBeNull();
    expect(s.receipts.save).not.toHaveBeenCalled();
  });
});
