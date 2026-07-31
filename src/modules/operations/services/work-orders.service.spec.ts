jest.mock('../../integrations/integrations.service', () => ({
  IntegrationsService: class IntegrationsService {},
}));

import {
  countsTowardShiftCompletion,
  workOrderAccessNotificationChanges,
  WorkOrdersService,
} from './work-orders.service';
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

describe('WorkOrdersService mobile required-action completion', () => {
  it('marks Timesheet completed only after every assigned worker completes it', async () => {
    const submissions = [
      {
        workOrderId: 'wo-1',
        shiftId: 'shift-1',
        templateId: 'template-wo',
        status: 'submitted',
        data: {},
      },
      {
        workOrderId: 'wo-1',
        shiftId: 'shift-1',
        templateId: 'template-timesheet',
        status: 'submitted',
        data: {
          timesheetWorkers: [
            { workerId: 'worker-a', status: 'completed' },
          ],
        },
      },
    ];
    const service = new WorkOrdersService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { find: jest.fn(async () => submissions) } as never,
      {
        find: jest.fn(async () => [
          {
            id: 'template-wo',
            name: 'Work Order Form',
            category: 'Work Order',
            isRequired: true,
          },
          {
            id: 'template-timesheet',
            name: 'Timesheet',
            category: 'Timesheet',
            isRequired: true,
          },
        ]),
      } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    const workOrder = {
      id: 'wo-1',
      formTemplateIds: ['template-wo', 'template-timesheet'],
      shifts: [
        {
          id: 'shift-1',
          roles: [
            {
              assignedWorkers: ['worker-a', 'worker-b'],
            },
          ],
        },
      ],
    } as WorkOrder;
    const resolveCompletion = (
      service as unknown as {
        resolveMobileShiftCompletion(
          workOrders: WorkOrder[],
        ): Promise<{
          completedShiftKeys: Set<string>;
          completedTemplateIdsByShift: Map<string, Set<string>>;
        }>;
      }
    ).resolveMobileShiftCompletion.bind(service);

    const partial = await resolveCompletion([workOrder]);
    expect(
      partial.completedTemplateIdsByShift.get('wo-1:shift-1'),
    ).toEqual(new Set(['template-wo']));
    expect(partial.completedShiftKeys.has('wo-1:shift-1')).toBe(false);

    submissions.push({
      workOrderId: 'wo-1',
      shiftId: 'shift-1',
      templateId: 'template-timesheet',
      status: 'submitted',
      data: {
        timesheetWorkers: [
          { workerId: 'worker-b', status: 'completed' },
        ],
      },
    });

    const complete = await resolveCompletion([workOrder]);
    expect(
      complete.completedTemplateIdsByShift.get('wo-1:shift-1'),
    ).toEqual(new Set(['template-wo', 'template-timesheet']));
    expect(complete.completedShiftKeys.has('wo-1:shift-1')).toBe(true);
  });
});

describe('workOrderAccessNotificationChanges', () => {
  const shift = (
    authorizedWorkerIds: string[],
    options: { notified?: boolean; assigned?: boolean } = {},
  ) => ({
    id: 'shift-1',
    date: '2026-07-28',
    workOrderAuthorizedWorkerIds: authorizedWorkerIds,
    roles: [
      {
        id: 'role-1',
        assignedWorkers:
          options.assigned === false ? [] : ['worker-1'],
        workerConfirmations:
          options.notified === false
            ? []
            : [
                {
                  workerId: 'worker-1',
                  requestedAt: '2026-07-27T12:00:00.000Z',
                },
              ],
      },
    ],
  });

  it('does not notify for an unrelated shift edit', () => {
    expect(
      workOrderAccessNotificationChanges(
        [shift(['worker-1'])],
        [{ ...shift(['worker-1']), startTime: '09:00' }],
      ),
    ).toEqual([]);
  });

  it('notifies when access is removed from a previously notified assigned worker', () => {
    expect(
      workOrderAccessNotificationChanges(
        [shift(['worker-1'])],
        [shift([])],
      ),
    ).toEqual([
      {
        shiftId: 'shift-1',
        shiftDate: '2026-07-28',
        roleId: 'role-1',
        workerId: 'worker-1',
        granted: false,
      },
    ]);
  });

  it('does not notify an assigned worker who never received the shift notification', () => {
    expect(
      workOrderAccessNotificationChanges(
        [shift(['worker-1'], { notified: false })],
        [shift([], { notified: false })],
      ),
    ).toEqual([]);
  });

  it('notifies when access is granted to a previously notified assigned worker', () => {
    expect(
      workOrderAccessNotificationChanges(
        [shift([])],
        [shift(['worker-1'])],
      ),
    ).toEqual([
      {
        shiftId: 'shift-1',
        shiftDate: '2026-07-28',
        roleId: 'role-1',
        workerId: 'worker-1',
        granted: true,
      },
    ]);
  });

  it('does not send a duplicate access removal when the worker leaves the shift', () => {
    expect(
      workOrderAccessNotificationChanges(
        [shift(['worker-1'])],
        [shift([], { assigned: false })],
      ),
    ).toEqual([]);
  });
});

describe('WorkOrdersService.updateMobileShiftConfirmation', () => {
  function buildService(completed = false): {
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
    const shiftsQuery = {
      loadShiftsForWorkOrder: jest.fn(async () => null),
      loadShiftsForWorkOrders: jest.fn(async (ids: string[]) => {
        const map = new Map<string, unknown[]>();
        const current = saved.value;
        if (current && ids.includes(current.id) && Array.isArray(current.shifts)) {
          map.set(current.id, current.shifts as unknown[]);
        }
        return map;
      }),
    } as never;
    const service = new WorkOrdersService(
      repo,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {
        find: jest.fn(async () =>
          completed
            ? [
                {
                  workOrderId: 'wo-1',
                  shiftId: 'shift-1',
                  templateId: 'template-wo',
                  status: 'submitted',
                  data: {},
                },
              ]
            : [],
        ),
      } as never,
      {
        find: jest.fn(async () =>
          completed
            ? [
                {
                  id: 'template-wo',
                  name: 'Work Order Form',
                  category: 'Work Order',
                  isRequired: true,
                },
              ]
            : [],
        ),
      } as never,
      workerRepo,
      {} as never,
      realtime,
      {} as never,
      { updateWorkerConfirmation: jest.fn() } as never,
      shiftsQuery,
      { nextWorkOrderNumber: jest.fn(async () => 'ASN-2026-0001') } as never,
      { notifyWorkOrderAccessChange: jest.fn() } as never,
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

  it('rejects confirmation changes after the shift is completed', async () => {
    const { service, saved } = buildService(true);
    saved.value = {
      id: 'wo-1',
      projectId: 'proj-1',
      title: 'Completed WO',
      shifts: [
        {
          id: 'shift-1',
          roles: [
            {
              id: 'role-1',
              roleName: 'Flagger',
              requiredCount: 1,
              assignedWorkers: ['worker-b'],
              assignedEquipment: [],
              assignedMaterials: [],
            },
          ],
        },
      ],
      formTemplateIds: ['template-wo'],
    } as WorkOrder;

    await expect(
      service.updateMobileShiftConfirmation(
        {
          email: 'b@example.com',
        } as UserAccessContext,
        'wo-1',
        'shift-1',
        'confirmed',
      ),
    ).rejects.toThrow('Completed shifts cannot be modified');
  });

  it('allows adding another shift while preserving a completed shift', () => {
    const { service } = buildService();
    const completed = {
      id: 'shift-completed',
      shiftName: 'Completed',
      date: '2026-07-20',
      startTime: '07:00',
      endTime: '15:00',
      roles: [
        {
          id: 'role-1',
          roleName: 'Flagger',
          requiredCount: 1,
          assignedWorkers: ['worker-a'],
          assignedEquipment: [],
          assignedMaterials: [],
          workerConfirmations: [
            {
              workerId: 'worker-a',
              status: 'confirmed',
              respondedAt: '2026-07-19T10:00:00.000Z',
            },
          ],
        },
      ],
    };
    const clientCopy = JSON.parse(JSON.stringify(completed)) as Record<
      string,
      unknown
    >;
    const clientRole = (
      clientCopy.roles as Array<Record<string, unknown>>
    )[0];
    delete clientRole.workerConfirmations;

    expect(() =>
      (
        service as unknown as {
          assertCompletedShiftsUnchanged: (
            workOrderId: string,
            completedKeys: Set<string>,
            previous: Record<string, unknown>[],
            next: Record<string, unknown>[],
          ) => void;
        }
      ).assertCompletedShiftsUnchanged(
        'wo-1',
        new Set(['wo-1:shift-completed']),
        [completed],
        [
          clientCopy,
          {
            id: 'shift-new',
            shiftName: 'New Shift',
            date: '2026-07-21',
            roles: [],
          },
        ],
      ),
    ).not.toThrow();
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

describe('WorkOrdersService.findOne shifts merge', () => {
  function makeService(opts: {
    jsonShifts: unknown[] | null;
    relationalShifts: Record<string, unknown>[] | undefined;
  }) {
    const row: WorkOrder = {
      id: 'wo-1',
      projectId: 'proj-1',
      workOrderTypeId: null,
      title: 'T',
      orderNumber: null,
      status: 'pending',
      startDate: null,
      endDate: null,
      shifts: opts.jsonShifts as never,
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
      updatedAt: '',
      role: 'viewer',
      roles: [],
      permissions: [],
    };
    const repo = {
      findOne: jest.fn(async () => row),
      find: jest.fn(async () => [row]),
      save: jest.fn(),
    } as never;
    const map = new Map<string, Record<string, unknown>[]>();
    if (opts.relationalShifts) map.set('wo-1', opts.relationalShifts);
    const shiftsQuery = {
      loadShiftsForWorkOrder: jest.fn(async () => opts.relationalShifts ?? null),
      loadShiftsForWorkOrders: jest.fn(async () => map),
    } as never;
    const service = new WorkOrdersService(
      repo,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { find: jest.fn(async () => []) } as never,
      { find: jest.fn(async () => []) } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      shiftsQuery,
      { nextWorkOrderNumber: jest.fn(async () => 'ASN-2026-0001') } as never,
      { notifyWorkOrderAccessChange: jest.fn() } as never,
    );
    return { service, repo };
  }

  it('replaces legacy JSON with relational rows when available', async () => {
    const jsonShifts = [{ id: 'old', roles: [] }];
    const relationalShifts = [{ id: 'new', roles: [] }];
    const { service } = makeService({ jsonShifts, relationalShifts });
    const result = await service.findOne('wo-1');
    expect((result.shifts as Array<{ id: string }>)[0].id).toBe('new');
  });

  it('returns an empty shifts array when no relational rows exist', async () => {
    const jsonShifts = [{ id: 'old', roles: [] }];
    const { service } = makeService({ jsonShifts, relationalShifts: undefined });
    const result = await service.findOne('wo-1');
    expect(result.shifts).toEqual([]);
  });

  it('keeps the work order intact when relational query returns null', async () => {
    const { service } = makeService({ jsonShifts: null, relationalShifts: null });
    const result = await service.findOne('wo-1');
    expect(result.id).toBe('wo-1');
    expect(result.shifts).toEqual([]);
  });
});
