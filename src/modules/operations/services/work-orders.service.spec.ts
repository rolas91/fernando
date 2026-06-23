import { countsTowardShiftCompletion, WorkOrdersService } from './work-orders.service';
import { WorkOrder } from '../../../entities/work-order.entity';
import { Worker } from '../../../entities/worker.entity';
import { UserAccessContext } from '../../access/ports/access.port';

describe('countsTowardShiftCompletion', () => {
  it('counts a submitted shift form even when no PDF is generated', () => {
    expect(
      countsTowardShiftCompletion({
        shiftId: 'shift-1',
        status: 'submitted',
        pdfUrl: '',
      }),
    ).toBe(true);
  });

  it('does not count drafts or submissions without a shift', () => {
    expect(
      countsTowardShiftCompletion({
        shiftId: 'shift-1',
        status: 'draft',
        pdfUrl: '',
      }),
    ).toBe(false);
    expect(
      countsTowardShiftCompletion({
        shiftId: null,
        status: 'submitted',
        pdfUrl: '',
      }),
    ).toBe(false);
  });
});

describe('WorkOrdersService.updateMobileShiftConfirmation', () => {
  function buildService(): {
    service: WorkOrdersService;
    saved: { value: WorkOrder | null };
  } {
    const saved: { value: WorkOrder | null } = { value: null };
    const repo = {
      findOne: jest.fn(async () => saved.value),
      save: jest.fn(async (entity: WorkOrder) => {
        saved.value = entity;
        return entity;
      }),
    } as never;
    const workerRepo = {
      findOne: jest.fn(async () => ({
        id: 'worker-b',
        email: 'b@example.com',
      } as Worker)),
    } as never;
    const realtime = {
      emitTableUpdated: jest.fn(),
    } as never;
    const service = new WorkOrdersService(
      repo,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      workerRepo,
      {} as never,
      {} as never,
      realtime,
      {} as never,
      { updateWorkerConfirmation: jest.fn() } as never,
    );
    return { service, saved };
  }

  it('preserves the other worker confirmation when one worker re-confirms via mobile', async () => {
    const { service, saved } = buildService();
    const workOrder: WorkOrder = {
      id: 'wo-1',
      projectId: 'proj-1',
      workOrderTypeId: null,
      title: 'Test WO',
      orderNumber: null,
      status: 'pending',
      startDate: null,
      endDate: null,
      shifts: [
        {
          id: 'shift-1',
          date: '2026-06-22',
          startTime: '07:00',
          endTime: '15:30',
          defaultRoleStartTime: '07:00',
          roles: [
            {
              id: 'role-1',
              roleName: 'Flagger',
              requiredCount: 2,
              startTime: '07:00',
              requiredCertificationIds: [],
              requiredSkillIds: [],
              assignedWorkers: ['worker-a', 'worker-b'],
              assignedEquipment: [],
              assignedMaterials: [],
              workerConfirmations: [
                { workerId: 'worker-a', status: 'confirmed', respondedAt: '2026-06-20T10:00:00.000Z' },
                { workerId: 'worker-b', status: 'confirmed', respondedAt: '2026-06-20T11:00:00.000Z' },
              ],
            },
          ],
        },
      ],
      requesterName: '',
      contactEmail: '',
      contactPhoneNumber: '',
      assignmentAddress: '',
      latitude: null,
      longitude: null,
      assignmentCity: '',
      assignmentState: '',
      assignmentZipCode: '',
      assignmentCountry: 'USA',
      notes: '',
      dispatchNote: '',
      fileUploads: [],
      attachments: [],
      formTemplateIds: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    };
    saved.value = workOrder;

    const actor: UserAccessContext = {
      id: 'u-b',
      email: 'b@example.com',
      firstName: 'B',
      lastName: '',
      phone: '',
      avatarUrl: '',
      status: 'active',
      lastLogin: null,
      createdAt: '',
      updatedAt: '',
      role: 'viewer',
      roles: [],
      permissions: [],
    };

    await service.updateMobileShiftConfirmation(actor, 'wo-1', 'shift-1', 'confirmed');

    const role = saved.value!.shifts[0].roles[0];
    const confirmations = (role as { workerConfirmations?: Array<{ workerId: string; status: string }> })
      .workerConfirmations ?? [];

    const a = confirmations.find((c) => c.workerId === 'worker-a');
    const b = confirmations.find((c) => c.workerId === 'worker-b');
    expect(a?.status).toBe('confirmed');
    expect(b?.status).toBe('confirmed');
  });

  it('preserves the other worker confirmation when worker re-confirms the whole assignment via mobile', async () => {
    const { service, saved } = buildService();
    const workOrder: WorkOrder = {
      id: 'wo-1',
      projectId: 'proj-1',
      workOrderTypeId: null,
      title: 'Test WO',
      orderNumber: null,
      status: 'pending',
      startDate: null,
      endDate: null,
      shifts: [
        {
          id: 'shift-1',
          date: '2026-06-22',
          startTime: '07:00',
          endTime: '15:30',
          defaultRoleStartTime: '07:00',
          roles: [
            {
              id: 'role-1',
              roleName: 'Flagger',
              requiredCount: 2,
              startTime: '07:00',
              requiredCertificationIds: [],
              requiredSkillIds: [],
              assignedWorkers: ['worker-a', 'worker-b'],
              assignedEquipment: [],
              assignedMaterials: [],
              workerConfirmations: [
                { workerId: 'worker-a', status: 'confirmed', respondedAt: '2026-06-20T10:00:00.000Z' },
                { workerId: 'worker-b', status: 'confirmed', respondedAt: '2026-06-20T11:00:00.000Z' },
              ],
            },
          ],
        },
      ],
      requesterName: '',
      contactEmail: '',
      contactPhoneNumber: '',
      assignmentAddress: '',
      latitude: null,
      longitude: null,
      assignmentCity: '',
      assignmentState: '',
      assignmentZipCode: '',
      assignmentCountry: 'USA',
      notes: '',
      dispatchNote: '',
      fileUploads: [],
      attachments: [],
      formTemplateIds: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    };
    saved.value = workOrder;

    const actor: UserAccessContext = {
      id: 'u-b',
      email: 'b@example.com',
      firstName: 'B',
      lastName: '',
      phone: '',
      avatarUrl: '',
      status: 'active',
      lastLogin: null,
      createdAt: '',
      updatedAt: '',
      role: 'viewer',
      roles: [],
      permissions: [],
    };

    await service.updateMobileAssignmentConfirmation(actor, 'wo-1', 'confirmed');

    const role = saved.value!.shifts[0].roles[0];
    const confirmations = (role as { workerConfirmations?: Array<{ workerId: string; status: string }> })
      .workerConfirmations ?? [];

    const a = confirmations.find((c) => c.workerId === 'worker-a');
    const b = confirmations.find((c) => c.workerId === 'worker-b');
    expect(a?.status).toBe('confirmed');
    expect(b?.status).toBe('confirmed');
  });

  it('preserves the other worker confirmation across multiple shifts in the same assignment', async () => {
    const { service, saved } = buildService();
    const workOrder: WorkOrder = {
      id: 'wo-1',
      projectId: 'proj-1',
      workOrderTypeId: null,
      title: 'Test WO',
      orderNumber: null,
      status: 'pending',
      startDate: null,
      endDate: null,
      shifts: [
        {
          id: 'shift-1',
          date: '2026-06-22',
          startTime: '07:00',
          endTime: '15:30',
          defaultRoleStartTime: '07:00',
          roles: [
            {
              id: 'role-1',
              roleName: 'Flagger',
              requiredCount: 2,
              startTime: '07:00',
              requiredCertificationIds: [],
              requiredSkillIds: [],
              assignedWorkers: ['worker-a', 'worker-b'],
              assignedEquipment: [],
              assignedMaterials: [],
              workerConfirmations: [
                { workerId: 'worker-a', status: 'confirmed', respondedAt: '2026-06-20T10:00:00.000Z' },
                { workerId: 'worker-b', status: 'confirmed', respondedAt: '2026-06-20T11:00:00.000Z' },
              ],
            },
          ],
        },
        {
          id: 'shift-2',
          date: '2026-06-23',
          startTime: '07:00',
          endTime: '15:30',
          defaultRoleStartTime: '07:00',
          roles: [
            {
              id: 'role-2',
              roleName: 'Flagger',
              requiredCount: 2,
              startTime: '07:00',
              requiredCertificationIds: [],
              requiredSkillIds: [],
              assignedWorkers: ['worker-a', 'worker-b'],
              assignedEquipment: [],
              assignedMaterials: [],
              workerConfirmations: [
                { workerId: 'worker-a', status: 'confirmed', respondedAt: '2026-06-20T12:00:00.000Z' },
                { workerId: 'worker-b', status: 'confirmed', respondedAt: '2026-06-20T13:00:00.000Z' },
              ],
            },
          ],
        },
      ],
      requesterName: '',
      contactEmail: '',
      contactPhoneNumber: '',
      assignmentAddress: '',
      latitude: null,
      longitude: null,
      assignmentCity: '',
      assignmentState: '',
      assignmentZipCode: '',
      assignmentCountry: 'USA',
      notes: '',
      dispatchNote: '',
      fileUploads: [],
      attachments: [],
      formTemplateIds: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    };
    saved.value = workOrder;

    const actor: UserAccessContext = {
      id: 'u-b',
      email: 'b@example.com',
      firstName: 'B',
      lastName: '',
      phone: '',
      avatarUrl: '',
      status: 'active',
      lastLogin: null,
      createdAt: '',
      updatedAt: '',
      role: 'viewer',
      roles: [],
      permissions: [],
    };

    await service.updateMobileShiftConfirmation(actor, 'wo-1', 'shift-1', 'confirmed');

    const shift1 = saved.value!.shifts.find((s) => (s as { id?: string }).id === 'shift-1')!;
    const shift2 = saved.value!.shifts.find((s) => (s as { id?: string }).id === 'shift-2')!;
    const role1 = shift1.roles[0];
    const role2 = shift2.roles[0];
    const confs1 = (role1 as { workerConfirmations?: Array<{ workerId: string; status: string }> }).workerConfirmations ?? [];
    const confs2 = (role2 as { workerConfirmations?: Array<{ workerId: string; status: string }> }).workerConfirmations ?? [];

    expect(confs1.find((c) => c.workerId === 'worker-a')?.status).toBe('confirmed');
    expect(confs1.find((c) => c.workerId === 'worker-b')?.status).toBe('confirmed');
    expect(confs2.find((c) => c.workerId === 'worker-a')?.status).toBe('confirmed');
    expect(confs2.find((c) => c.workerId === 'worker-b')?.status).toBe('confirmed');
  });
});
