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

  describe('editing an already submitted Work Order', () => {
    it('allows an admin without a linked worker profile', async () => {
      shiftsRepo.findOne.mockResolvedValueOnce({
        id: 'shift-1',
        pmApprovedAt: null,
      });

      await expect(
        service.canEditSubmittedShiftWorkOrder(
          {
            id: 'admin-1',
            email: 'admin@example.com',
            role: 'admin',
            roles: ['admin'],
            permissions: ['form-submissions.write'],
          } as never,
          'wo-1',
          'shift-1',
        ),
      ).resolves.toBe(true);
      expect(workersRepo.findOne).not.toHaveBeenCalled();
    });

    it('allows the worker selected as the shift Work Order manager', async () => {
      shiftsRepo.findOne
        .mockResolvedValueOnce({ id: 'shift-1', pmApprovedAt: null })
        .mockResolvedValueOnce({
          id: 'shift-1',
          workOrderId: 'wo-1',
          workOrderAuthorizedWorkerIds: ['worker-1'],
        });
      workersRepo.findOne.mockResolvedValueOnce({ id: 'worker-1' });
      rolesRepo.find.mockResolvedValueOnce([{ id: 'role-1' }]);
      roleWorkersRepo.findOne.mockResolvedValueOnce({
        roleId: 'role-1',
        workerId: 'worker-1',
      });

      await expect(
        service.canEditSubmittedShiftWorkOrder(workerActor, 'wo-1', 'shift-1'),
      ).resolves.toBe(true);
    });

    it('does not let a global mobile Work Order permission bypass the designation', async () => {
      shiftsRepo.findOne
        .mockResolvedValueOnce({ id: 'shift-1', pmApprovedAt: null })
        .mockResolvedValueOnce({
          id: 'shift-1',
          workOrderId: 'wo-1',
          workOrderAuthorizedWorkerIds: [],
        });
      workersRepo.findOne.mockResolvedValueOnce({ id: 'worker-1' });

      await expect(
        service.canEditSubmittedShiftWorkOrder(
          {
            id: 'user-1',
            email: 'worker@example.com',
            role: 'viewer',
            roles: ['viewer'],
            permissions: ['mobile.work-orders.submit'],
          } as never,
          'wo-1',
          'shift-1',
        ),
      ).resolves.toBe(false);
    });

    it('rejects an edit when the shift is PM approved', async () => {
      shiftsRepo.findOne.mockResolvedValueOnce({
        id: 'shift-1',
        pmApprovedAt: new Date('2026-10-19T12:00:00Z'),
      });

      await expect(
        service.canEditSubmittedShiftWorkOrder(workerActor, 'wo-1', 'shift-1'),
      ).resolves.toBe(false);
      expect(workersRepo.findOne).not.toHaveBeenCalled();
    });
  });
});
