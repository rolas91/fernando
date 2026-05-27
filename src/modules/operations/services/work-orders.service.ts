import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { CompanySettings } from '../../../entities/company-settings.entity';
import { Equipment } from '../../../entities/equipment.entity';
import { FormSubmission } from '../../../entities/form-submission.entity';
import { FormTemplate } from '../../../entities/form-template.entity';
import { Material } from '../../../entities/material.entity';
import { Project } from '../../../entities/project.entity';
import { Worker } from '../../../entities/worker.entity';
import { WorkOrder } from '../../../entities/work-order.entity';
import { RealtimeGateway } from '../../realtime/realtime.gateway';
import { CreateWorkOrderDto } from '../dto/create-work-order.dto';
import { UpdateWorkOrderDto } from '../dto/update-work-order.dto';
import {
  computeAssignmentStatus,
  parseAssignmentAutoStatusRules,
  type ComputeAssignmentStatusInput,
} from '../utils/assignment-auto-status.util';
import {
  assertAssignmentWithinProjectDates,
  assertShiftsWithinAssignmentDateRange,
} from '../utils/work-order-shift-date-range.util';
import {
  normalizeWorkOrderShifts,
  updateShiftWorkerConfirmation,
  type ShiftConfirmationStatus,
} from '../utils/work-order-shifts.util';
import { SpacesStorageService } from './spaces-storage.service';
import type { UserAccessContext } from '../../access/ports/access.port';

type MobileAssignmentStatusFilter =
  | 'all'
  | 'active'
  | 'pending'
  | 'at_risk'
  | 'critical'
  | 'completed';

type MobileAssignmentQuery = {
  search?: string;
  status?: MobileAssignmentStatusFilter | string;
};

@Injectable()
export class WorkOrdersService {
  private readonly logger = new Logger(WorkOrdersService.name);

  constructor(
    @InjectRepository(WorkOrder)
    private readonly workOrdersRepo: Repository<WorkOrder>,
    @InjectRepository(Project)
    private readonly projectsRepo: Repository<Project>,
    @InjectRepository(Equipment)
    private readonly equipmentRepo: Repository<Equipment>,
    @InjectRepository(Material)
    private readonly materialsRepo: Repository<Material>,
    @InjectRepository(FormSubmission)
    private readonly formSubmissionsRepo: Repository<FormSubmission>,
    @InjectRepository(FormTemplate)
    private readonly formTemplatesRepo: Repository<FormTemplate>,
    @InjectRepository(Worker)
    private readonly workerRepo: Repository<Worker>,
    @InjectRepository(CompanySettings)
    private readonly companySettingsRepo: Repository<CompanySettings>,
    private readonly realtime: RealtimeGateway,
    private readonly spacesStorage: SpacesStorageService,
  ) {}

  async findAll() {
    const rows = await this.workOrdersRepo.find({ order: { startDate: 'ASC' } });
    return this.refreshAutoAssignmentStatuses(rows);
  }

  async findMobileAssignmentsForUser(
    actor: UserAccessContext | undefined,
    query: MobileAssignmentQuery,
  ) {
    const worker = await this.resolveWorkerForMobileUser(actor);
    const search = (query.search || '').trim().toLowerCase();
    const status = (query.status || 'active').trim().toLowerCase();
    const assignments = await this.refreshAutoAssignmentStatuses(await this.workOrdersRepo.find({
      order: { createdAt: 'DESC', startDate: 'DESC', id: 'DESC' },
    }));
    const assigned = assignments.filter((wo) =>
      this.workOrderHasAssignedWorker(wo, worker.id),
    );
    const projectIds = [...new Set(assigned.map((wo) => wo.projectId).filter(Boolean))];
    const projects =
      projectIds.length > 0
        ? await this.projectsRepo.find({ where: { id: In(projectIds) } })
        : [];
    const projectById = new Map(projects.map((project) => [project.id, project]));
    const completedShiftKeys = await this.resolveCompletedMobileShiftKeys(assigned);
    const quickAccessMaps = await this.loadMobileQuickAccessMaps(assigned);

    return assigned
      .filter((wo) => this.mobileStatusMatches(wo.status, status))
      .filter((wo) => {
        if (!search) return true;
        const project = projectById.get(wo.projectId);
        const haystack = [
          wo.title,
          wo.orderNumber,
          wo.assignmentAddress,
          wo.assignmentCity,
          wo.assignmentState,
          project?.name,
          project?.number,
          project?.location,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return haystack.includes(search);
      })
      .map((wo) =>
        this.serializeMobileAssignment(
          wo,
          worker.id,
          projectById.get(wo.projectId),
          completedShiftKeys,
          quickAccessMaps,
        ),
      );
  }

  async updateMobileShiftConfirmation(
    actor: UserAccessContext | undefined,
    workOrderId: string,
    shiftId: string,
    status: ShiftConfirmationStatus,
  ) {
    if (status !== 'confirmed' && status !== 'declined') {
      throw new BadRequestException('Confirmation status must be confirmed or declined.');
    }

    const worker = await this.resolveWorkerForMobileUser(actor);
    const workOrder = await this.findOne(workOrderId);
    const shifts = normalizeWorkOrderShifts(workOrder.shifts);
    this.logger.log(
      `[mobile-confirmation] shift request workOrder=${workOrderId} shift=${shiftId} worker=${worker.id} email=${worker.email} status=${status}`,
    );
    const shift = shifts.find((item) => item.id === shiftId);
    if (!shift || !Array.isArray(shift.roles)) {
      throw new NotFoundException(`Shift ${shiftId} not found`);
    }
    const role = shift.roles
      .map((item) => item as Record<string, unknown>)
      .find((item) => {
        const assignedWorkers = Array.isArray(item.assignedWorkers)
          ? item.assignedWorkers
          : [];
        return assignedWorkers.includes(worker.id);
      });
    const roleId = typeof role?.id === 'string' ? role.id : '';
    if (!role || !roleId) {
      this.logger.warn(
        `[mobile-confirmation] shift denied workOrder=${workOrderId} shift=${shiftId} worker=${worker.id}: worker not assigned`,
      );
      throw new ForbiddenException('Worker is not assigned to this shift.');
    }
    this.logger.log(
      `[mobile-confirmation] updating shift workOrder=${workOrderId} shift=${shiftId} role=${roleId} worker=${worker.id} status=${status}`,
    );

    workOrder.shifts = updateShiftWorkerConfirmation(
      shifts,
      {
        shiftId,
        roleId,
        workerId: worker.id,
      },
      {
        status,
        respondedAt: new Date().toISOString(),
      },
    );
    const saved = await this.workOrdersRepo.save(workOrder);
    this.realtime.emitTableUpdated('work_orders');
    this.logger.log(
      `[mobile-confirmation] shift saved workOrder=${workOrderId} shift=${shiftId} worker=${worker.id} status=${status}`,
    );
    return this.serializeMobileAssignment(saved, worker.id);
  }

  async updateMobileAssignmentConfirmation(
    actor: UserAccessContext | undefined,
    workOrderId: string,
    status: ShiftConfirmationStatus,
  ) {
    if (status !== 'confirmed' && status !== 'declined') {
      throw new BadRequestException('Confirmation status must be confirmed or declined.');
    }

    const worker = await this.resolveWorkerForMobileUser(actor);
    const workOrder = await this.findOne(workOrderId);
    const shifts = normalizeWorkOrderShifts(workOrder.shifts);
    let updatedCount = 0;
    const touchedShifts: string[] = [];
    const respondedAt = new Date().toISOString();

    this.logger.log(
      `[mobile-confirmation] assignment request workOrder=${workOrderId} worker=${worker.id} email=${worker.email} status=${status}`,
    );

    const nextShifts = shifts.map((shift) => {
      const shiftId = typeof shift.id === 'string' ? shift.id : '';
      if (!shiftId) return shift;
      const shiftRoles = Array.isArray(shift.roles) ? shift.roles : [];
      let shiftUpdated = false;

      const nextRoles = shiftRoles.map((item) => {
        const role = item as Record<string, unknown>;
        const assignedWorkers = Array.isArray(role.assignedWorkers)
          ? role.assignedWorkers
          : [];
        if (!assignedWorkers.includes(worker.id)) return role;

        const roleId = typeof role.id === 'string' ? role.id : '';
        const confirmations = Array.isArray(role.workerConfirmations)
          ? (role.workerConfirmations as Record<string, unknown>[])
          : [];
        const hasConfirmation = confirmations.some(
          (confirmation) => confirmation?.workerId === worker.id,
        );
        const current = confirmations.find(
          (confirmation) => confirmation?.workerId === worker.id,
        );
        if (current?.status === status) return role;

        this.logger.log(
          `[mobile-confirmation] updating assignment shift workOrder=${workOrderId} shift=${shiftId} role=${roleId || 'unknown'} worker=${worker.id} from=${String(current?.status || 'pending')} to=${status}`,
        );

        const nextConfirmations = hasConfirmation
          ? confirmations.map((confirmation) => {
              if (confirmation?.workerId !== worker.id) return confirmation;
              return {
                ...confirmation,
                workerId: worker.id,
                status,
                respondedAt,
              };
            })
          : [
              ...confirmations,
              {
                workerId: worker.id,
                status,
                respondedAt,
              },
            ];

        shiftUpdated = true;
        updatedCount += 1;
        return {
          ...role,
          workerConfirmations: nextConfirmations,
        };
      });

      if (!shiftUpdated) return shift;
      touchedShifts.push(shiftId);
      return {
        ...shift,
        roles: nextRoles,
      };
    });

    if (updatedCount === 0) {
      this.logger.log(
        `[mobile-confirmation] assignment no-op workOrder=${workOrderId} worker=${worker.id} status=${status}`,
      );
      return this.serializeMobileAssignment(workOrder, worker.id);
    }

    workOrder.shifts = nextShifts;
    const saved = await this.workOrdersRepo.save(workOrder);
    this.realtime.emitTableUpdated('work_orders');
    this.logger.log(
      `[mobile-confirmation] assignment saved workOrder=${workOrderId} worker=${worker.id} status=${status} updatedCount=${updatedCount} shifts=${touchedShifts.join(',')}`,
    );
    return this.serializeMobileAssignment(saved, worker.id);
  }

  async findOne(id: string) {
    const workOrder = await this.workOrdersRepo.findOne({ where: { id } });
    if (!workOrder) throw new NotFoundException(`Assignment ${id} not found`);
    return workOrder;
  }

  private async resolveWorkerForMobileUser(actor: UserAccessContext | undefined) {
    const email = actor?.email?.trim().toLowerCase();
    if (!email) throw new ForbiddenException('Authenticated user email is required.');

    const worker = await this.workerRepo.findOne({ where: { email } });
    if (!worker) {
      throw new ForbiddenException(
        'No worker profile is linked to this user email.',
      );
    }
    return worker;
  }

  private workOrderHasAssignedWorker(workOrder: WorkOrder, workerId: string) {
    const shifts = Array.isArray(workOrder.shifts) ? workOrder.shifts : [];
    return shifts.some((shift) => {
      const roles = Array.isArray((shift as Record<string, unknown>).roles)
        ? ((shift as Record<string, unknown>).roles as Record<string, unknown>[])
        : [];
      return roles.some((role) => {
        const assignedWorkers = Array.isArray(role.assignedWorkers)
          ? role.assignedWorkers
          : [];
        return assignedWorkers.includes(workerId);
      });
    });
  }

  private mobileStatusMatches(rawStatus: string, filter: string) {
    const status = (rawStatus || '').trim().toLowerCase().replace(/\s+/g, '_');
    if (!filter || filter === 'all') return !['cancelled', 'closed'].includes(status);
    if (!filter || filter === 'active') {
      return !['completed', 'cancelled', 'closed'].includes(status);
    }
    if (filter === 'completed') {
      return status === 'completed' || status === 'closed' || status === 'approved';
    }
    return status === filter;
  }

  private async resolveCompletedMobileShiftKeys(workOrders: WorkOrder[]) {
    const workOrderIds = [...new Set(workOrders.map((wo) => wo.id).filter(Boolean))];
    if (workOrderIds.length === 0) return new Set<string>();

    const [submissions, templates] = await Promise.all([
      this.formSubmissionsRepo.find({
        where: {
          workOrderId: In(workOrderIds),
          status: 'submitted',
        },
      }),
      this.formTemplatesRepo.find(),
    ]);
    const submittedKeys = new Set(
      submissions
        .filter((submission) => submission.shiftId && submission.pdfUrl?.trim())
        .map((submission) => `${submission.workOrderId}:${submission.shiftId}:${submission.templateId}`),
    );
    const completedShiftKeys = new Set<string>();

    for (const workOrder of workOrders) {
      const pickedTemplateIds = new Set((workOrder.formTemplateIds || []).filter(Boolean));
      const requiredTemplates = templates.filter((template) => {
        if (template.isRequired === false) return false;
        return pickedTemplateIds.size === 0 || pickedTemplateIds.has(template.id);
      });
      if (requiredTemplates.length === 0) continue;
      const shifts = Array.isArray(workOrder.shifts) ? workOrder.shifts : [];
      for (const shift of shifts) {
        const record = shift as Record<string, unknown>;
        const shiftId = typeof record.id === 'string' ? record.id : '';
        if (!shiftId) continue;
        const hasEveryRequired = requiredTemplates.every((template) =>
          submittedKeys.has(`${workOrder.id}:${shiftId}:${template.id}`),
        );
        if (hasEveryRequired) completedShiftKeys.add(`${workOrder.id}:${shiftId}`);
      }
    }

    return completedShiftKeys;
  }

  private serializeMobileAssignment(
    workOrder: WorkOrder,
    workerId: string,
    project?: Project,
    completedShiftKeys = new Set<string>(),
    quickAccessMaps?: {
      workerById: Map<string, Worker>;
      equipmentById: Map<string, Equipment>;
      materialById: Map<string, Material>;
    },
  ) {
    const quickAccess = this.buildMobileQuickAccess(workOrder, project, quickAccessMaps);
    const workerShifts = (Array.isArray(workOrder.shifts) ? workOrder.shifts : [])
      .map((shift) => {
        const record = shift as Record<string, unknown>;
        const roles = Array.isArray(record.roles)
          ? (record.roles as Record<string, unknown>[])
          : [];
        const role = roles.find((item) => {
          const assignedWorkers = Array.isArray(item.assignedWorkers)
            ? item.assignedWorkers
            : [];
          return assignedWorkers.includes(workerId);
        });
        if (!role) return null;
        const confirmations = Array.isArray(role.workerConfirmations)
          ? (role.workerConfirmations as Record<string, unknown>[])
          : [];
        const confirmation = confirmations.find((item) => item.workerId === workerId);
        return {
          id: typeof record.id === 'string' ? record.id : '',
          date: typeof record.date === 'string' ? record.date : '',
          startTime: typeof record.startTime === 'string' ? record.startTime : '',
          endTime: typeof record.endTime === 'string' ? record.endTime : '',
          roleId: typeof role.id === 'string' ? role.id : '',
          roleName: typeof role.roleName === 'string' ? role.roleName : '',
          confirmationStatus:
            confirmation?.status === 'confirmed' || confirmation?.status === 'declined'
              ? confirmation.status
              : 'pending',
          completed: completedShiftKeys.has(
            `${workOrder.id}:${typeof record.id === 'string' ? record.id : ''}`,
          ),
        };
      })
      .filter((shift): shift is NonNullable<typeof shift> => Boolean(shift))
      .sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime));

    return {
      id: workOrder.id,
      orderNumber: workOrder.orderNumber || workOrder.id,
      title: workOrder.title,
      status: workOrder.status,
      startDate: workOrder.startDate,
      endDate: workOrder.endDate,
      projectId: workOrder.projectId,
      projectName: project?.name || '',
      location: this.formatMobileLocation(workOrder, project),
      quickAccess,
      shifts: workerShifts,
    };
  }

  private async loadMobileQuickAccessMaps(workOrders: WorkOrder[]) {
    const workerIds = new Set<string>();
    const equipmentIds = new Set<string>();
    const materialIds = new Set<string>();
    for (const workOrder of workOrders) {
      const ids = this.collectMobileQuickAccessIds(workOrder);
      ids.workerIds.forEach((id) => workerIds.add(id));
      ids.equipmentIds.forEach((id) => equipmentIds.add(id));
      ids.materialIds.forEach((id) => materialIds.add(id));
    }

    const [workers, equipment, materials]: [Worker[], Equipment[], Material[]] = await Promise.all([
      workerIds.size > 0 ? this.workerRepo.find({ where: { id: In([...workerIds]) } }) : Promise.resolve([]),
      equipmentIds.size > 0 ? this.equipmentRepo.find({ where: { id: In([...equipmentIds]) } }) : Promise.resolve([]),
      materialIds.size > 0 ? this.materialsRepo.find({ where: { id: In([...materialIds]) } }) : Promise.resolve([]),
    ]);

    return {
      workerById: new Map<string, Worker>(workers.map((item) => [item.id, item])),
      equipmentById: new Map<string, Equipment>(equipment.map((item) => [item.id, item])),
      materialById: new Map<string, Material>(materials.map((item) => [item.id, item])),
    };
  }

  private collectMobileQuickAccessIds(workOrder: WorkOrder) {
    const workerIds = new Set<string>();
    const equipmentIds = new Set<string>();
    const materialIds = new Set<string>();
    for (const shift of Array.isArray(workOrder.shifts) ? workOrder.shifts : []) {
      const roles = Array.isArray(shift.roles)
        ? (shift.roles as Record<string, unknown>[])
        : [];
      for (const role of roles) {
        if (Array.isArray(role.assignedWorkers)) {
          role.assignedWorkers
            .filter((id): id is string => typeof id === 'string' && id.trim().length > 0)
            .forEach((id) => workerIds.add(id));
        }
        if (Array.isArray(role.assignedEquipment)) {
          role.assignedEquipment
            .filter((id): id is string => typeof id === 'string' && id.trim().length > 0)
            .forEach((id) => equipmentIds.add(id));
        }
        if (Array.isArray(role.assignedMaterials)) {
          role.assignedMaterials
            .filter((id): id is string => typeof id === 'string' && id.trim().length > 0)
            .forEach((id) => materialIds.add(id));
        }
      }
    }

    return { workerIds, equipmentIds, materialIds };
  }

  private buildMobileQuickAccess(
    workOrder: WorkOrder,
    project?: Project,
    maps?: {
      workerById: Map<string, Worker>;
      equipmentById: Map<string, Equipment>;
      materialById: Map<string, Material>;
    },
  ) {
    const { workerIds, equipmentIds, materialIds } = this.collectMobileQuickAccessIds(workOrder);
    const crew = [...workerIds].map((id) => {
      const worker = maps?.workerById.get(id);
      const name = worker
        ? `${worker.firstName} ${worker.lastName}`.trim() || worker.email || worker.id
        : id;
      return {
        id,
        name,
        initials: this.initialsFromName(name),
        roleLine: this.roleNamesForWorker(workOrder, id).join(', ') || worker?.role || worker?.type || 'Assigned crew',
        badge: worker?.type || worker?.role || 'Crew',
        phone: worker?.phone || '',
      };
    });
    const equipment = [
      ...[...equipmentIds].map((id) => {
        const item = maps?.equipmentById.get(id);
        return {
          id,
          name: item?.name || id,
          description: item?.notes || item?.brand || item?.type || 'Assigned equipment',
          status: item?.status || 'Assigned',
          type: item?.type || 'Equipment',
          identifier: item?.identifier || '',
          kind: 'equipment',
        };
      }),
      ...[...materialIds].map((id) => {
        const item = maps?.materialById.get(id);
        return {
          id,
          name: item?.name || id,
          description: item?.notes || item?.brand || item?.type || 'Assigned material',
          status: item?.status || 'Assigned',
          type: item?.type || 'Material',
          identifier: item?.identifier || '',
          kind: 'material',
        };
      }),
    ];
    const notes = [
      workOrder.dispatchNote?.trim()
        ? { id: 'dispatchNote', title: 'Dispatch Note', body: workOrder.dispatchNote.trim() }
        : null,
      workOrder.notes?.trim()
        ? { id: 'notes', title: 'Notes', body: workOrder.notes.trim() }
        : null,
    ].filter((item): item is { id: string; title: string; body: string } => Boolean(item));
    const documents = [
      ...(workOrder.fileUploads || []).filter(Boolean).map((url, index) => ({
        id: `file_${index}`,
        title: this.fileNameFromUrl(url),
        url,
        tag: 'Required',
      })),
      ...(workOrder.attachments || []).filter(Boolean).map((url, index) => ({
        id: `attachment_${index}`,
        title: this.fileNameFromUrl(url),
        url,
        tag: 'Reference',
      })),
    ];

    return {
      crewCount: crew.length,
      equipmentCount: equipment.length,
      hasClient: Boolean(project?.clientId?.trim()),
      hasNotes: notes.length > 0,
      documentCount: documents.length,
      crew,
      equipment,
      client: project?.clientId?.trim()
        ? {
            id: project.clientId,
            name: project.name,
            projectNumber: project.number,
            projectManager: project.projectManager,
            projectManagerEmail: project.projectManagerEmail,
          }
        : null,
      notes,
      documents,
    };
  }

  private roleNamesForWorker(workOrder: WorkOrder, workerId: string) {
    const names = new Set<string>();
    for (const shift of Array.isArray(workOrder.shifts) ? workOrder.shifts : []) {
      const roles = Array.isArray(shift.roles)
        ? (shift.roles as Record<string, unknown>[])
        : [];
      for (const role of roles) {
        const assignedWorkers = Array.isArray(role.assignedWorkers) ? role.assignedWorkers : [];
        if (!assignedWorkers.includes(workerId)) continue;
        if (typeof role.roleName === 'string' && role.roleName.trim()) names.add(role.roleName.trim());
      }
    }
    return [...names];
  }

  private initialsFromName(name: string) {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    return (parts[0]?.[0] || '?') + (parts[1]?.[0] || '');
  }

  private fileNameFromUrl(url: string) {
    const clean = url.split('?')[0] || url;
    const name = clean.split('/').pop() || 'Document';
    try {
      return decodeURIComponent(name);
    } catch {
      return name;
    }
  }

  private formatMobileLocation(workOrder: WorkOrder, project?: Project) {
    const assignmentParts = [
      workOrder.assignmentAddress,
      workOrder.assignmentCity,
      workOrder.assignmentState,
    ]
      .map((item) => (item || '').trim())
      .filter(Boolean);
    if (assignmentParts.length > 0) return assignmentParts.join(', ');

    const projectParts = [project?.location, project?.city, project?.state]
      .map((item) => (item || '').trim())
      .filter(Boolean);
    return projectParts.join(', ');
  }

  async create(dto: CreateWorkOrderDto) {
    await this.applyProjectAssignmentDateBounds(dto.projectId, dto.startDate, dto.endDate);

    const shifts = normalizeWorkOrderShifts(dto.shifts);
    assertShiftsWithinAssignmentDateRange(dto.startDate, dto.endDate, shifts);
    await this.assertAssignedWorkersMeetRoleCertifications(shifts);
    const { status: dtoStatusLane, ...dtoWithoutDeclaredStatus } = dto;
    const entity = this.workOrdersRepo.create({
      ...dtoWithoutDeclaredStatus,
      status: 'pending',
      shifts,
      dispatchNote: dto.dispatchNote?.trim() || '',
      fileUploads: this.normalizeTextArray(dto.fileUploads),
      formTemplateIds: this.normalizeTextArray(dto.formTemplateIds),
    });
    if (dto.assignmentAddress !== undefined) {
      entity.assignmentAddress = (dto.assignmentAddress ?? '').trim();
    }
    if (dto.assignmentCity !== undefined) {
      entity.assignmentCity = (dto.assignmentCity ?? '').trim();
    }
    if (dto.assignmentState !== undefined) {
      entity.assignmentState = (dto.assignmentState ?? '').trim();
    }
    if (dto.assignmentZipCode !== undefined) {
      entity.assignmentZipCode = (dto.assignmentZipCode ?? '').trim();
    }
    if (dto.assignmentCountry !== undefined) {
      entity.assignmentCountry =
        (dto.assignmentCountry ?? '').trim() || 'USA';
    }

    await this.applyAutoAssignmentStatus(entity, undefined, dtoStatusLane);

    return this.workOrdersRepo.save(entity).then((saved) => {
      this.realtime.emitTableUpdated('work_orders');
      return saved;
    });
  }

  async update(id: string, dto: UpdateWorkOrderDto) {
    const workOrder = await this.findOne(id);
    const previousStatus = workOrder.status;

    /** Must be captured before Object.assign: dto replaces entity.shifts, and normalize needs true DB-merge baseline. */
    const previousShiftsSnapshot: Record<string, unknown>[] =
      dto.shifts !== undefined
        ? (JSON.parse(
            JSON.stringify(workOrder.shifts ?? []),
          ) as Record<string, unknown>[])
        : [];

    const { status: dtoStatusLane, ...dtoRest } = dto;
    Object.assign(workOrder, dtoRest);
    if (dto.shifts !== undefined) {
      workOrder.shifts = normalizeWorkOrderShifts(
        dto.shifts,
        previousShiftsSnapshot,
      );
    }
    assertShiftsWithinAssignmentDateRange(
      workOrder.startDate,
      workOrder.endDate,
      workOrder.shifts as Record<string, unknown>[],
    );

    await this.assertAssignedWorkersMeetRoleCertifications(
      workOrder.shifts as Record<string, unknown>[],
    );

    await this.applyProjectAssignmentDateBounds(
      workOrder.projectId,
      workOrder.startDate,
      workOrder.endDate,
    );

    if (dto.dispatchNote !== undefined) {
      workOrder.dispatchNote = dto.dispatchNote.trim();
    }
    if (dto.fileUploads !== undefined) {
      workOrder.fileUploads = this.normalizeTextArray(dto.fileUploads);
    }
    if (dto.formTemplateIds !== undefined) {
      workOrder.formTemplateIds = this.normalizeTextArray(dto.formTemplateIds);
    }
    if (dto.assignmentAddress !== undefined) {
      workOrder.assignmentAddress = (dto.assignmentAddress ?? '').trim();
    }
    if (dto.assignmentCity !== undefined) {
      workOrder.assignmentCity = (dto.assignmentCity ?? '').trim();
    }
    if (dto.assignmentState !== undefined) {
      workOrder.assignmentState = (dto.assignmentState ?? '').trim();
    }
    if (dto.assignmentZipCode !== undefined) {
      workOrder.assignmentZipCode = (dto.assignmentZipCode ?? '').trim();
    }
    if (dto.assignmentCountry !== undefined) {
      workOrder.assignmentCountry =
        (dto.assignmentCountry ?? '').trim() || 'USA';
    }

    await this.applyAutoAssignmentStatus(
      workOrder,
      previousStatus,
      dtoStatusLane,
    );

    const saved = await this.workOrdersRepo.save(workOrder);
    this.realtime.emitTableUpdated('work_orders');
    return saved;
  }

  async remove(id: string) {
    const workOrder = await this.findOne(id);
    try {
      await this.spacesStorage.deleteManyPublicFiles(workOrder.fileUploads || []);
    } catch (error) {
      this.logger.warn(
        `Could not delete stored files for assignment ${id}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
    await this.workOrdersRepo.remove(workOrder);
    this.realtime.emitTableUpdated('work_orders');
    return { success: true };
  }

  /**
   * Ensures every assigned worker has all required certifications for their shift role.
   * Falls back to legacy requiredSkillIds for older assignments.
   */
  private async assertAssignedWorkersMeetRoleCertifications(
    shifts: Record<string, unknown>[],
  ): Promise<void> {
    const workerIds = new Set<string>();
    for (const shift of shifts) {
      const roles = Array.isArray(shift.roles) ? shift.roles : [];
      for (const raw of roles) {
        const role = raw as Record<string, unknown>;
        const assigned = Array.isArray(role.assignedWorkers)
          ? role.assignedWorkers.filter(
              (id): id is string => typeof id === 'string' && id.trim() !== '',
            )
          : [];
        assigned.forEach((id) => workerIds.add(id.trim()));
      }
    }
    if (workerIds.size === 0) return;

    const ids = [...workerIds];
    const workers = await this.workerRepo.find({
      where: { id: In(ids) },
      relations: {
        workerCertifications: { certification: true },
        workerRoles: true,
      },
    });
    if (workers.length !== ids.length) {
      throw new BadRequestException(
        'One or more assigned workers do not exist or could not be loaded.',
      );
    }
    const byId = new Map(workers.map((w) => [w.id, w]));

    const activeCertificationIdSetForWorker = (w: Worker): Set<string> =>
      new Set(
        (w.workerCertifications ?? []).filter((wc) => {
          const st = String(wc.certification?.status ?? '').toLowerCase();
          return st !== 'inactive';
        }).map((wc) => wc.certificationId),
      );
    const workerHasRequiredRole = (w: Worker, roleName: string): boolean => {
      const target = roleName.trim().toLowerCase();
      if (!target) return true;
      return (w.workerRoles ?? []).some((role) => {
        const status = String(role.status ?? '').toLowerCase();
        return status !== 'inactive' && role.name.trim().toLowerCase() === target;
      });
    };

    for (const shift of shifts) {
      const roles = Array.isArray(shift.roles) ? shift.roles : [];
      for (const raw of roles) {
        const role = raw as Record<string, unknown>;
        const roleName =
          typeof role.roleName === 'string' && role.roleName.trim()
            ? role.roleName.trim()
            : 'Role';

        const rawRequired = Array.isArray(role.requiredCertificationIds)
          ? role.requiredCertificationIds
          : Array.isArray(role.requiredSkillIds)
            ? role.requiredSkillIds
            : [];
        const required = rawRequired
          .filter(
              (id): id is string => typeof id === 'string' && id.trim() !== '',
            ).map((id) => id.trim());
        if (required.length === 0) continue;

        const requiredSet = new Set(required);

        const assigned = Array.isArray(role.assignedWorkers)
          ? role.assignedWorkers.filter(
              (id): id is string => typeof id === 'string' && id.trim() !== '',
            ).map((id) => id.trim())
          : [];

        for (const workerId of assigned) {
          const w = byId.get(workerId);
          if (!w) {
            throw new BadRequestException(
              `Assigned worker "${workerId}" was not found.`,
            );
          }
          if (!workerHasRequiredRole(w, roleName)) {
            throw new BadRequestException(
              `Worker "${w.firstName} ${w.lastName}" cannot be assigned to "${roleName}": missing required worker role.`,
            );
          }
          const have = activeCertificationIdSetForWorker(w);
          const missing = [...requiredSet].filter((sid) => !have.has(sid));
          if (missing.length > 0) {
            throw new BadRequestException(
              `Worker "${w.firstName} ${w.lastName}" cannot be assigned to "${roleName}": missing one or more required certifications.`,
            );
          }
        }
      }
    }
  }

  private async applyProjectAssignmentDateBounds(
    projectId: string | undefined,
    woStart: unknown,
    woEnd: unknown,
  ): Promise<void> {
    const pid = typeof projectId === 'string' ? projectId.trim() : '';
    if (!pid) return;

    const project = await this.projectsRepo.findOne({ where: { id: pid } });
    if (!project) throw new NotFoundException(`Project ${pid} not found`);

    assertAssignmentWithinProjectDates(
      project.startDate,
      project.endDate,
      woStart,
      woEnd,
    );
  }

  private buildSchedulingSnapshot(
    current: WorkOrder,
    allRows: WorkOrder[],
  ): ComputeAssignmentStatusInput['allWorkOrdersForScheduling'] {
    const hasCurrent = allRows.some((w) => w.id === current.id);
    const base = hasCurrent ? allRows : [...allRows, current];
    return base.map((w) =>
      w.id === current.id
        ? {
            id: current.id,
            status: current.status,
            shifts: current.shifts as Record<string, unknown>[],
          }
        : {
            id: w.id,
            status: w.status,
            shifts: w.shifts as Record<string, unknown>[],
          },
    );
  }

  private async applyAutoAssignmentStatus(
    entity: WorkOrder,
    previousStatus: string | undefined,
    dtoStatusLane: string | undefined,
  ) {
    try {
      const [allRows, equipmentRows, workerRows, settingsRow] =
        await Promise.all([
          this.workOrdersRepo.find(),
          this.equipmentRepo.find(),
          this.workerRepo.find({
            relations: { workerCertifications: true },
          }),
          this.companySettingsRepo.find({
            order: { updatedAt: 'DESC' },
            take: 1,
          }),
        ]);

      const rules = parseAssignmentAutoStatusRules(
        settingsRow[0]?.assignmentAutoStatus ?? null,
      );
      const equipmentStatusById = new Map(
        equipmentRows.map((e) => [e.id, e.status]),
      );
      const workerCertExpiryDates = new Map<
        string,
        (string | null | undefined)[]
      >();
      for (const w of workerRows) {
        workerCertExpiryDates.set(
          w.id,
          (w.workerCertifications ?? []).map((wc) => wc.expirationDate),
        );
      }

      const allForScheduling = this.buildSchedulingSnapshot(entity, allRows);
      const completedWorkOrderShiftKeys =
        await this.resolveCompletedMobileShiftKeys(
          allRows.some((row) => row.id === entity.id) ? allRows : [...allRows, entity],
        );

      const { status } = computeAssignmentStatus({
        workOrderId: entity.id,
        previousStatus,
        dtoStatus: dtoStatusLane,
        startDate: entity.startDate,
        endDate: entity.endDate,
        shifts: entity.shifts as Record<string, unknown>[],
        allWorkOrdersForScheduling: allForScheduling,
        equipmentStatusById,
        workerCertExpiryDates,
        completedWorkOrderShiftKeys,
        rules,
        now: new Date(),
      });
      entity.status = status;
    } catch (err) {
      this.logger.warn(
        `Auto assignment status failed for ${entity.id}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      entity.status = 'pending';
    }
  }

  private async refreshAutoAssignmentStatuses(rows: WorkOrder[]) {
    if (rows.length === 0) return rows;

    try {
      const [equipmentRows, workerRows, settingsRow] = await Promise.all([
        this.equipmentRepo.find(),
        this.workerRepo.find({
          relations: { workerCertifications: true },
        }),
        this.companySettingsRepo.find({
          order: { updatedAt: 'DESC' },
          take: 1,
        }),
      ]);

      const rules = parseAssignmentAutoStatusRules(
        settingsRow[0]?.assignmentAutoStatus ?? null,
      );
      const equipmentStatusById = new Map(
        equipmentRows.map((e) => [e.id, e.status]),
      );
      const workerCertExpiryDates = new Map<
        string,
        (string | null | undefined)[]
      >();
      for (const w of workerRows) {
        workerCertExpiryDates.set(
          w.id,
          (w.workerCertifications ?? []).map((wc) => wc.expirationDate),
        );
      }
      const completedWorkOrderShiftKeys =
        await this.resolveCompletedMobileShiftKeys(rows);

      const changed: WorkOrder[] = [];
      for (const row of rows) {
        const previousStatus = row.status;
        const { status } = computeAssignmentStatus({
          workOrderId: row.id,
          previousStatus,
          dtoStatus: undefined,
          startDate: row.startDate,
          endDate: row.endDate,
          shifts: row.shifts as Record<string, unknown>[],
          allWorkOrdersForScheduling: this.buildSchedulingSnapshot(row, rows),
          equipmentStatusById,
          workerCertExpiryDates,
          completedWorkOrderShiftKeys,
          rules,
          now: new Date(),
        });

        if (status !== previousStatus) {
          row.status = status;
          changed.push(row);
        }
      }

      if (changed.length > 0) {
        await this.workOrdersRepo.save(changed);
        this.realtime.emitTableUpdated('work_orders');
        this.logger.log(
          `Auto assignment statuses refreshed. updated=${changed.length}`,
        );
      }
    } catch (err) {
      this.logger.warn(
        `Auto assignment status refresh failed: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }

    return rows;
  }

  private normalizeTextArray(value: string[] | undefined) {
    if (!Array.isArray(value)) return [];
    const seen = new Set<string>();
    return value
      .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
      .filter((entry) => {
        if (!entry || seen.has(entry)) return false;
        seen.add(entry);
        return true;
      });
  }
}
