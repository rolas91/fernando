import { ShiftWorkOrderAccessService } from './shift-work-order-access.service';

describe('ShiftWorkOrderAccessService', () => {
  const workersRepo = { findOne: jest.fn() };
  const shiftsRepo = { findOne: jest.fn() };
  const rolesRepo = { find: jest.fn() };
  const roleWorkersRepo = { findOne: jest.fn() };
  const service = new ShiftWorkOrderAccessService(
    workersRepo as never,
    shiftsRepo as never,
    rolesRepo as never,
    roleWorkersRepo as never,
  );
  const workerActor = {
    id: 'user-1',
    email: 'worker@example.com',
    role: 'viewer',
    roles: ['viewer'],
    permissions: ['mobile.assignments.read'],
  } as never;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('allows roles with global Work Order Form permission', async () => {
    await expect(
      service.canManageShiftWorkOrder(
        {
          ...workerActor,
          permissions: ['mobile.work-orders.submit'],
        },
        'wo-1',
        'shift-1',
      ),
    ).resolves.toBe(true);
    expect(workersRepo.findOne).not.toHaveBeenCalled();
  });

  it('allows a selected worker who is still assigned to the shift', async () => {
    workersRepo.findOne.mockResolvedValueOnce({ id: 'worker-1' });
    shiftsRepo.findOne.mockResolvedValueOnce({
      id: 'shift-1',
      workOrderId: 'wo-1',
      workOrderAuthorizedWorkerIds: ['worker-1'],
    });
    rolesRepo.find.mockResolvedValueOnce([{ id: 'role-1' }]);
    roleWorkersRepo.findOne.mockResolvedValueOnce({
      roleId: 'role-1',
      workerId: 'worker-1',
    });

    await expect(
      service.canManageShiftWorkOrder(workerActor, 'wo-1', 'shift-1'),
    ).resolves.toBe(true);
  });

  it('denies an assigned worker who was not selected', async () => {
    workersRepo.findOne.mockResolvedValueOnce({ id: 'worker-1' });
    shiftsRepo.findOne.mockResolvedValueOnce({
      id: 'shift-1',
      workOrderId: 'wo-1',
      workOrderAuthorizedWorkerIds: [],
    });

    await expect(
      service.canManageShiftWorkOrder(workerActor, 'wo-1', 'shift-1'),
    ).resolves.toBe(false);
    expect(rolesRepo.find).not.toHaveBeenCalled();
  });

  it('denies a selected worker after they are removed from the shift', async () => {
    workersRepo.findOne.mockResolvedValueOnce({ id: 'worker-1' });
    shiftsRepo.findOne.mockResolvedValueOnce({
      id: 'shift-1',
      workOrderId: 'wo-1',
      workOrderAuthorizedWorkerIds: ['worker-1'],
    });
    rolesRepo.find.mockResolvedValueOnce([{ id: 'role-1' }]);
    roleWorkersRepo.findOne.mockResolvedValueOnce(null);

    await expect(
      service.canManageShiftWorkOrder(workerActor, 'wo-1', 'shift-1'),
    ).resolves.toBe(false);
  });
});
