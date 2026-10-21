jest.mock('../../integrations/integrations.service', () => ({
  IntegrationsService: class IntegrationsService {},
}));

import { WorkOrdersService } from './work-orders.service';

describe('mobile cancellation visibility', () => {
  const service = Object.create(WorkOrdersService.prototype) as any;
  function assignment(acknowledged = false, cancelled = true) {
    return {
      id: 'wo1',
      title: 'Assignment',
      shifts: [
        {
          id: 's1',
          date: '2026-10-21',
          startTime: '08:00',
          endTime: '17:00',
          cancelled,
          roles: [
            {
              id: 'r1',
              roleName: 'Lead',
              requiredCount: 2,
              assignedWorkers: ['w1', 'w2'],
              workerConfirmations: ['w1', 'w2'].map((workerId) => ({
                workerId,
                status: 'confirmed',
                requestedAt: '2026-10-20T08:00:00Z',
                cancellationAcknowledgedAt:
                  acknowledged && workerId === 'w1'
                    ? '2026-10-21T08:00:00Z'
                    : undefined,
              })),
            },
          ],
        },
      ],
    };
  }

  it('keeps the cancelled shift visible until the worker explicitly acknowledges it', () => {
    const result = service.serializeMobileAssignment(assignment(), 'w1');
    expect(result.shifts).toHaveLength(1);
    expect(result.shifts[0].effectiveStatus).toBe('shift_cancelled');
  });

  it('hides it only for the worker who acknowledged the cancellation', () => {
    const workOrder = assignment(true);
    expect(
      service.serializeMobileAssignment(workOrder, 'w1').shifts,
    ).toHaveLength(0);
    expect(
      service.serializeMobileAssignment(workOrder, 'w2').shifts,
    ).toHaveLength(1);
  });

  it('keeps active shifts visible regardless of an old cancellation acknowledgement', () => {
    expect(
      service.serializeMobileAssignment(assignment(true, false), 'w1').shifts,
    ).toHaveLength(1);
  });

  it('does not expose the shift to unassigned workers', () => {
    expect(
      service.serializeMobileAssignment(assignment(), 'other').shifts,
    ).toHaveLength(0);
  });
});
