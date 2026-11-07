import { ShiftsQueryService } from './shifts-query.service';

type RepoMock<T> = {
  manager: { getRepository: jest.Mock };
  find: jest.Mock;
  count: jest.Mock;
  createQueryBuilder: jest.Mock;
  exist: jest.Mock;
  insert: jest.Mock;
  save: jest.Mock;
  __records?: Record<string, unknown[]>;
};

function makeRepo<
  T extends Record<string, unknown> = Record<string, unknown>,
>(): RepoMock<T> {
  return {
    manager: {
      getRepository: jest.fn(() => ({ find: jest.fn(async () => []) })),
    },
    find: jest.fn(),
    count: jest.fn(),
    createQueryBuilder: jest.fn(),
    exist: jest.fn(),
    insert: jest.fn(),
    save: jest.fn(),
  };
}

function qb(rows: Record<string, unknown>[]) {
  return {
    innerJoin: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockResolvedValue(rows),
  };
}

describe('ShiftsQueryService', () => {
  it('returns null when no shifts are persisted in the relational tables', async () => {
    const shiftsRepo = makeRepo();
    shiftsRepo.find.mockResolvedValue([]);
    const service = new ShiftsQueryService(
      shiftsRepo as never,
      makeRepo() as never,
      makeRepo() as never,
    );
    expect(await service.loadShiftsForWorkOrder('wo-1')).toBeNull();
    expect(await service.hasRelationalData('wo-1')).toBe(false);
  });

  it('rebuilds the legacy JSON shape from the relational rows', async () => {
    const shiftsRepo = makeRepo();
    shiftsRepo.find.mockResolvedValue([
      {
        id: 's1',
        workOrderId: 'wo-1',
        date: '2026-06-22',
        startTime: '07:00',
        endTime: '15:30',
        defaultRoleStartTime: '07:00',
        shiftTemplateId: 'tpl-1',
        createdByUserId: 'user-created',
        createdByUser: { firstName: 'Casey', lastName: 'Creator' },
        pmApprovedByUserId: 'user-approved',
        pmApprovedByUser: { firstName: 'Alex', lastName: 'Approver' },
      },
    ]);
    shiftsRepo.count.mockResolvedValue(1);
    const rolesRepo = makeRepo();
    rolesRepo.createQueryBuilder.mockReturnValue(
      qb([
        {
          id: 'r1',
          shiftId: 's1',
          roleName: 'Flagger',
          requiredCount: 2,
          startTime: '07:00',
          requiredCertificationIds: ['c1'],
          requiredSkillIds: [],
        },
      ]),
    );
    const workersRepo = makeRepo();
    workersRepo.createQueryBuilder.mockReturnValue(
      qb([
        {
          roleId: 'r1',
          workerId: 'w1',
          confirmationStatus: 'confirmed',
          requestedAt: new Date('2026-06-20T10:00:00Z'),
          respondedAt: new Date('2026-06-20T10:05:00Z'),
          notificationChannel: 'sms',
        },
        {
          roleId: 'r1',
          workerId: 'w2',
          confirmationStatus: 'pending',
          requestedAt: null,
          respondedAt: null,
          notificationChannel: null,
        },
      ]),
    );
    const equipRepo = makeRepo();
    equipRepo.createQueryBuilder.mockReturnValue(
      qb([{ roleId: 'r1', equipmentId: 'e1' }]),
    );
    const matRepo = makeRepo();
    matRepo.createQueryBuilder.mockReturnValue(qb([]));

    const service = new ShiftsQueryService(
      shiftsRepo as never,
      rolesRepo as never,
      workersRepo as never,
    );
    const result = await service.loadShiftsForWorkOrder('wo-1');

    expect(shiftsRepo.find).toHaveBeenCalledWith(
      expect.objectContaining({
        order: { date: 'ASC', displayOrder: 'ASC' },
      }),
    );

    expect(result).toMatchObject([
      {
        id: 's1',
        workOrderId: 'wo-1',
        date: '2026-06-22',
        startTime: '07:00',
        endTime: '15:30',
        defaultRoleStartTime: '07:00',
        shiftTemplateId: 'tpl-1',
        createdByUserId: 'user-created',
        createdByName: 'Casey Creator',
        pmApprovedByUserId: 'user-approved',
        pmApprovedByName: 'Alex Approver',
        roles: [
          {
            id: 'r1',
            roleName: 'Flagger',
            requiredCount: 2,
            startTime: '07:00',
            requiredCertificationIds: ['c1'],
            requiredSkillIds: [],
            assignedWorkers: ['w1', 'w2'],
            workerConfirmations: [
              {
                workerId: 'w1',
                status: 'confirmed',
                requestedAt: '2026-06-20T10:00:00.000Z',
                respondedAt: '2026-06-20T10:05:00.000Z',
                notificationChannel: 'sms',
              },
              { workerId: 'w2', status: 'pending' },
            ],
          },
        ],
      },
    ]);
    expect(await service.hasRelationalData('wo-1')).toBe(true);
  });

  it('includes planned resources and work order types in batch shift reads', async () => {
    const shiftsRepo = makeRepo();
    shiftsRepo.find.mockResolvedValue([
      {
        id: 's1',
        workOrderId: 'wo-1',
        date: '2026-07-18',
        startTime: '07:00',
        endTime: '15:00',
        visibleDocumentTypes: [],
        plannedEquipment: [{ type: 'Excavator', estimatedQuantity: 2 }],
        plannedMaterials: [{ type: 'Concrete', estimatedQuantity: 4 }],
        workOrderTypes: ['Field Service', 'On Rent'],
      },
    ]);
    const rolesRepo = makeRepo();
    rolesRepo.createQueryBuilder.mockReturnValue(qb([]));
    const workersRepo = makeRepo();
    workersRepo.createQueryBuilder.mockReturnValue(qb([]));
    const equipRepo = makeRepo();
    equipRepo.createQueryBuilder.mockReturnValue(qb([]));
    const matRepo = makeRepo();
    matRepo.createQueryBuilder.mockReturnValue(qb([]));
    const service = new ShiftsQueryService(
      shiftsRepo as never,
      rolesRepo as never,
      workersRepo as never,
    );

    const result = await service.loadShiftsForWorkOrders(['wo-1']);
    expect(result.get('wo-1')?.[0]).toMatchObject({
      plannedEquipment: [{ type: 'Excavator', estimatedQuantity: 2 }],
      plannedMaterials: [{ type: 'Concrete', estimatedQuantity: 4 }],
      workOrderTypes: ['Field Service', 'On Rent'],
    });
  });
  it('scopes only explicitly ranged batch reads and preserves complete reads by default', async () => {
    const shiftsRepo = makeRepo(),
      rolesRepo = makeRepo(),
      workersRepo = makeRepo();
    shiftsRepo.find.mockResolvedValue([
      {
        id: 's',
        workOrderId: 'wo',
        date: '2026-11-06',
        plannedEquipment: [{ type: 'Truck', estimatedQuantity: 2 }],
      },
    ]);
    const roles = qb([]),
      workers = qb([]);
    rolesRepo.createQueryBuilder.mockReturnValue(roles);
    workersRepo.createQueryBuilder.mockReturnValue(workers);
    const service = new ShiftsQueryService(
      shiftsRepo as never,
      rolesRepo as never,
      workersRepo as never,
    );
    await service.loadShiftsForWorkOrders(['wo']);
    expect(shiftsRepo.find.mock.calls[0][0].where).not.toHaveProperty('date');
    expect(roles.andWhere).not.toHaveBeenCalled();
    expect(workers.andWhere).not.toHaveBeenCalled();
    const result = await service.loadShiftsForWorkOrders(['wo'], {
      from: '2026-11-06',
      to: '2026-11-06',
    });
    expect(shiftsRepo.find.mock.calls[1][0].where.date.type).toBe('between');
    expect(shiftsRepo.find.mock.calls[1][0].where.date.value).toEqual([
      '2026-11-06',
      '2026-11-06',
    ]);
    expect(roles.andWhere).toHaveBeenCalledWith(
      'shift.date BETWEEN :from AND :to',
      { from: '2026-11-06', to: '2026-11-06' },
    );
    expect(workers.andWhere).toHaveBeenCalledWith(
      'shift.date BETWEEN :from AND :to',
      { from: '2026-11-06', to: '2026-11-06' },
    );
    expect(result.get('wo')?.[0].plannedEquipment).toEqual([
      { type: 'Truck', estimatedQuantity: 2 },
    ]);
  });
  it('hydrates only selected list shifts when explicitly requested, without changing full-read defaults', async () => {
    const shiftsRepo = makeRepo(),
      rolesRepo = makeRepo(),
      workersRepo = makeRepo();
    shiftsRepo.find.mockResolvedValue([
      { id: 'selected', workOrderId: 'wo', date: '2026-11-06' },
    ]);
    const roles = qb([]),
      workers = qb([]);
    rolesRepo.createQueryBuilder.mockReturnValue(roles);
    workersRepo.createQueryBuilder.mockReturnValue(workers);
    const service = new ShiftsQueryService(
      shiftsRepo as never,
      rolesRepo as never,
      workersRepo as never,
    );
    await service.loadShiftsForWorkOrders(['wo'], undefined, ['selected']);
    expect(shiftsRepo.find.mock.calls[0][0].where.id.value).toEqual([
      'selected',
    ]);
    expect(roles.andWhere).toHaveBeenCalledWith(
      'shift.id IN (:...selectedShiftIds)',
      { selectedShiftIds: ['selected'] },
    );
    expect(workers.andWhere).toHaveBeenCalledWith(
      'shift.id IN (:...selectedShiftIds)',
      { selectedShiftIds: ['selected'] },
    );
    expect(
      shiftsRepo.manager.getRepository.mock.results[0].value.find.mock
        .calls[0][0].where.shiftId.value,
    ).toEqual(['selected']);
  });
});
