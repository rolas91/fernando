import { IntegrationsService } from './integrations.service';
import { Notification } from '../../entities/notification.entity';

jest.mock('expo-server-sdk', () => ({ Expo: jest.fn() }));

describe('cancellation notification delivery', () => {
  it('sends a typed cancellation with shift identifiers and no assignment confirmation link', async () => {
    const orders = { findOne: jest.fn(async () => ({ title: 'Job' })) };
    const workers = {
      findOne: jest.fn(async () => ({
        firstName: 'Test',
        lastName: 'Worker',
        email: 'test@example.com',
      })),
    };
    const query = {
      loadShiftsForWorkOrder: jest.fn(async () => [
        {
          id: 's1',
          date: '2026-10-20',
          roles: [
            { assignedWorkers: ['w1'], startTime: '08:00' },
            { assignedWorkers: ['w1'], startTime: '08:00' },
          ],
        },
      ]),
    };
    const service = new IntegrationsService(
      {} as never,
      orders as never,
      workers as never,
      {} as never,
      {} as never,
      query as never,
      {} as never,
    );
    const send = jest
      .spyOn(service, 'sendNotification')
      .mockResolvedValue({ success: true, simulated: true, channel: 'in_app' });
    await service.notifyShiftCancellation('wo1', 's1');
    expect(send).toHaveBeenCalledTimes(1);
    const body = send.mock.calls[0][0];
    expect(body).toMatchObject({
      title: 'Shift Cancelled',
      cancellation: { workOrderId: 'wo1', shiftId: 's1', workerId: 'w1' },
    });
    expect(body.confirmation).toBeUndefined();
  });

  it('atomically saves the typed inbox entry and independent receipt', async () => {
    const saved: any[] = [];
    const notifications = {
      save: jest.fn(async (value) => {
        saved.push(value);
        return value;
      }),
    };
    const receipts = { upsert: jest.fn() };
    const manager = {
      getRepository: (entity: unknown) =>
        entity === Notification ? notifications : receipts,
    };
    const repo = {
      create: (value: unknown) => value,
      manager: {
        transaction: (fn: (m: typeof manager) => unknown) => fn(manager),
      },
    };
    const service = new IntegrationsService(
      {} as never,
      {} as never,
      {} as never,
      repo as never,
      { emitTableUpdated: jest.fn() } as never,
      {} as never,
      {} as never,
    );
    await (service as any).persistFcmNotification(
      {
        notificationId: 'n1',
        title: 'Shift Cancelled',
        cancellation: { workOrderId: 'wo1', shiftId: 's1', workerId: 'w1' },
      },
      { success: true },
    );
    expect(saved[0]).toMatchObject({
      id: 'n1',
      type: 'shift_cancelled',
      workOrderId: 'wo1',
      shiftId: 's1',
      workerId: 'w1',
    });
    expect(receipts.upsert).toHaveBeenCalledWith(
      {
        workOrderId: 'wo1',
        shiftId: 's1',
        workerId: 'w1',
        notificationId: 'n1',
        acknowledgedAt: null,
      },
      ['workOrderId', 'shiftId', 'workerId'],
    );
  });
});
