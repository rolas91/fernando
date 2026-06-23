import { IntegrationsService } from './integrations.service';

function makeRepo() {
  return {
    findOne: jest.fn(),
    save: jest.fn(),
    create: jest.fn((input) => input),
  };
}

function makeService() {
  const confirmationsRepo = makeRepo();
  const workOrdersRepo = makeRepo();
  const workersRepo = makeRepo();
  const notificationsRepo = makeRepo();
  const realtime = { emitTableUpdated: jest.fn() };
  const shiftsQuery = {
    loadShiftsForWorkOrder: jest.fn().mockResolvedValue(null),
    loadShiftsForWorkOrders: jest.fn().mockResolvedValue(new Map()),
  };
  const shiftsWrite = {
    updateWorkerConfirmation: jest.fn().mockResolvedValue(undefined),
    replaceShiftsForWorkOrder: jest.fn().mockResolvedValue(undefined),
    deleteShiftsForWorkOrder: jest.fn().mockResolvedValue(undefined),
  };
  const service = new IntegrationsService(
    confirmationsRepo as never,
    workOrdersRepo as never,
    workersRepo as never,
    notificationsRepo as never,
    realtime as never,
    shiftsQuery as never,
    shiftsWrite as never,
  );
  return { service, confirmationsRepo, workOrdersRepo, workersRepo, realtime, shiftsQuery, shiftsWrite };
}

describe('IntegrationsService.confirmShiftAssignment', () => {
  it('rejects when the token does not exist', async () => {
    const { service, confirmationsRepo } = makeService();
    confirmationsRepo.findOne.mockResolvedValue(null);
    const result = await service.confirmShiftAssignment('bad-token');
    expect(result.state).toBe('invalid');
    expect(result.httpStatus).toBe(404);
  });

  it('rejects when the linked work order is gone', async () => {
    const { service, confirmationsRepo, workOrdersRepo } = makeService();
    confirmationsRepo.findOne.mockResolvedValue({
      id: 'c-1',
      token: 'tok',
      workOrderId: 'wo-1',
      shiftId: 's-1',
      roleId: 'r-1',
      workerId: 'w-1',
      status: 'pending',
    });
    workOrdersRepo.findOne.mockResolvedValue(null);
    const result = await service.confirmShiftAssignment('tok');
    expect(result.state).toBe('invalid');
    expect(result.title).toContain('Shift not found');
  });

  it('writes the confirmation to the relational table and emits realtime', async () => {
    const { service, confirmationsRepo, workOrdersRepo, workersRepo, realtime, shiftsQuery, shiftsWrite } =
      makeService();
    confirmationsRepo.findOne.mockResolvedValue({
      id: 'c-1',
      token: 'tok',
      workOrderId: 'wo-1',
      shiftId: 's-1',
      roleId: 'r-1',
      workerId: 'w-1',
      status: 'pending',
    });
    workOrdersRepo.findOne.mockResolvedValue({ id: 'wo-1' });
    workersRepo.findOne.mockResolvedValue({
      id: 'w-1',
      firstName: 'Jane',
      lastName: 'Doe',
    });
    shiftsQuery.loadShiftsForWorkOrder.mockResolvedValue([
      {
        id: 's-1',
        workOrderId: 'wo-1',
        date: '2026-06-22',
        startTime: '07:00',
        endTime: '15:30',
        roles: [
          {
            id: 'r-1',
            roleName: 'Flagger',
            assignedWorkers: ['w-1'],
            assignedEquipment: [],
            assignedMaterials: [],
          },
        ],
      },
    ]);

    const result = await service.confirmShiftAssignment('tok');

    expect(result.state).toBe('confirmed');
    expect(result.httpStatus).toBe(200);
    expect(confirmationsRepo.save).toHaveBeenCalledTimes(1);
    expect(shiftsWrite.updateWorkerConfirmation).toHaveBeenCalledWith(
      expect.objectContaining({
        workOrderId: 'wo-1',
        shiftId: 's-1',
        roleId: 'r-1',
        workerId: 'w-1',
        status: 'confirmed',
      }),
    );
    expect(realtime.emitTableUpdated).toHaveBeenCalledWith('work_orders');
  });

  it('rejects when the worker is no longer assigned to that shift/role', async () => {
    const { service, confirmationsRepo, workOrdersRepo, workersRepo, shiftsQuery, shiftsWrite } =
      makeService();
    confirmationsRepo.findOne.mockResolvedValue({
      id: 'c-1',
      token: 'tok',
      workOrderId: 'wo-1',
      shiftId: 's-1',
      roleId: 'r-1',
      workerId: 'w-1',
      status: 'pending',
    });
    workOrdersRepo.findOne.mockResolvedValue({ id: 'wo-1' });
    workersRepo.findOne.mockResolvedValue({ id: 'w-1', firstName: 'Jane', lastName: 'Doe' });
    shiftsQuery.loadShiftsForWorkOrder.mockResolvedValue([
      {
        id: 's-1',
        roles: [{ id: 'r-1', assignedWorkers: ['w-OTHER'] }],
      },
    ]);

    const result = await service.confirmShiftAssignment('tok');

    expect(result.state).toBe('invalid');
    expect(result.httpStatus).toBe(409);
    expect(shiftsWrite.updateWorkerConfirmation).not.toHaveBeenCalled();
  });

  it('is a no-op when the confirmation was already confirmed', async () => {
    const { service, confirmationsRepo, workOrdersRepo, workersRepo, shiftsQuery, shiftsWrite, realtime } =
      makeService();
    confirmationsRepo.findOne.mockResolvedValue({
      id: 'c-1',
      token: 'tok',
      workOrderId: 'wo-1',
      shiftId: 's-1',
      roleId: 'r-1',
      workerId: 'w-1',
      status: 'confirmed',
    });
    workOrdersRepo.findOne.mockResolvedValue({ id: 'wo-1' });
    workersRepo.findOne.mockResolvedValue({ id: 'w-1', firstName: 'Jane', lastName: 'Doe' });
    shiftsQuery.loadShiftsForWorkOrder.mockResolvedValue([
      {
        id: 's-1',
        roles: [{ id: 'r-1', assignedWorkers: ['w-1'] }],
      },
    ]);

    const result = await service.confirmShiftAssignment('tok');

    expect(result.state).toBe('already_confirmed');
    expect(shiftsWrite.updateWorkerConfirmation).not.toHaveBeenCalled();
    expect(realtime.emitTableUpdated).not.toHaveBeenCalled();
  });
});
