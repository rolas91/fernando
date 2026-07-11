import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Not, Repository } from 'typeorm';
import { Client } from '../../../entities/client.entity';
import { CompanySettings } from '../../../entities/company-settings.entity';
import { Equipment } from '../../../entities/equipment.entity';
import { FormSubmission } from '../../../entities/form-submission.entity';
import { FormTemplate } from '../../../entities/form-template.entity';
import { Material } from '../../../entities/material.entity';
import { Project } from '../../../entities/project.entity';
import { Shift as ShiftCatalog } from '../../../entities/shift.entity';
import { Worker } from '../../../entities/worker.entity';
import { WorkOrder } from '../../../entities/work-order.entity';
import { RealtimeGateway } from '../../realtime/realtime.gateway';
import { CreateWorkOrderDto } from '../dto/create-work-order.dto';
import { UpdateWorkOrderDto } from '../dto/update-work-order.dto';
import { BulkCreateShiftsDto } from '../dto/bulk-create-shifts.dto';
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
  preserveOtherWorkerConfirmations,
  snapshotWorkerConfirmations,
  updateShiftWorkerConfirmation,
  type ShiftConfirmationStatus,
} from '../utils/work-order-shifts.util';
import {
  WorkOrderShiftsWriteService,
  type ShiftWriteInput,
} from './work-order-shifts-write.service';
import { ShiftsQueryService } from './shifts-query.service';
import { SpacesStorageService } from './spaces-storage.service';
import { NumberingService } from './numbering.service';
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

type MobileShiftCompletion = {
  completedShiftKeys: Set<string>;
  completedTemplateIdsByShift: Map<string, Set<string>>;
};

export function countsTowardShiftCompletion(
  submission: Pick<FormSubmission, 'shiftId' | 'status' | 'pdfUrl'>,
) {
  return submission.status === 'submitted' && Boolean(submission.shiftId);
}

function mobileClockMinutes(value: unknown) {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  const twelveHour = normalized.match(/^(\d{1,2}):(\d{2})\s*([AP])\.?M\.?$/i);
  if (twelveHour) {
    let hours = Number(twelveHour[1]);
    const minutes = Number(twelveHour[2]);
    if (hours < 1 || hours > 12 || minutes < 0 || minutes > 59) return null;
    if (twelveHour[3].toUpperCase() === 'A' && hours === 12) hours = 0;
    if (twelveHour[3].toUpperCase() === 'P' && hours !== 12) hours += 12;
    return hours * 60 + minutes;
  }
  const twentyFourHour = normalized.match(/^(\d{1,2}):(\d{2})$/);
  if (!twentyFourHour) return null;
  const hours = Number(twentyFourHour[1]);
  const minutes = Number(twentyFourHour[2]);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function mobileShiftEndTime(startTime: string, template?: ShiftCatalog) {
  const templateStart = mobileClockMinutes(template?.startTime);
  const templateEnd = mobileClockMinutes(template?.endTime);
  const shiftStart = mobileClockMinutes(startTime);
  if (templateStart === null || templateEnd === null || shiftStart === null) return '';
  const duration =
    templateEnd > templateStart
      ? templateEnd - templateStart
      : templateEnd - templateStart + 24 * 60;
  const end = (shiftStart + duration) % (24 * 60);
  return `${String(Math.floor(end / 60)).padStart(2, '0')}:${String(end % 60).padStart(2, '0')}`;
}

@Injectable()
export class WorkOrdersService {
  private readonly logger = new Logger(WorkOrdersService.name);

  constructor(
    @InjectRepository(WorkOrder)
    private readonly workOrdersRepo: Repository<WorkOrder>,
    @InjectRepository(Project)
    private readonly projectsRepo: Repository<Project>,
    @InjectRepository(Client)
    private readonly clientsRepo: Repository<Client>,
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
    @InjectRepository(ShiftCatalog)
    private readonly shiftCatalogRepo: Repository<ShiftCatalog>,
    private readonly realtime: RealtimeGateway,
    private readonly spacesStorage: SpacesStorageService,
    private readonly shiftsWrite: WorkOrderShiftsWriteService,
    private readonly shiftsQuery: ShiftsQueryService,
    private readonly numbering: NumberingService,
  ) {}

  async findAll() {
    const rows = await this.workOrdersRepo.find({ order: { startDate: 'ASC' } });
    const withShifts = await this.mergeShiftsWithRelational(rows);
    const refreshed = await this.refreshAutoAssignmentStatuses(withShifts);
    return refreshed;
  }

  /** Dedicated read contract for the Shifts module. */
  async findShiftOverview() {
    const workOrders = await this.findAll();
    const shiftTimestamp = (shift: Record<string, unknown>) =>
      `${typeof shift.date === 'string' ? shift.date : ''}T${typeof shift.startTime === 'string' ? shift.startTime : '00:00'}`;
    const latestShiftTimestamp = (workOrder: WorkOrder) => {
      const shifts = Array.isArray(workOrder.shifts)
        ? (workOrder.shifts as Record<string, unknown>[])
        : [];
      return shifts.reduce(
        (latest, shift) => {
          const value = shiftTimestamp(shift);
          return value > latest ? value : latest;
        },
        '',
      );
    };

    return workOrders
      .map((workOrder) => {
        const shifts = Array.isArray(workOrder.shifts)
          ? [...(workOrder.shifts as Record<string, unknown>[])]
          : [];
        shifts.sort((a, b) => shiftTimestamp(b).localeCompare(shiftTimestamp(a)));
        workOrder.shifts = shifts;
        return workOrder;
      })
      .sort((a, b) => {
        const byLatestShift = latestShiftTimestamp(b).localeCompare(latestShiftTimestamp(a));
        if (byLatestShift !== 0) return byLatestShift;
        return String(b.startDate || '').localeCompare(String(a.startDate || ''));
      });
  }

  async findMobileAssignmentsForUser(
    actor: UserAccessContext | undefined,
    query: MobileAssignmentQuery,
  ) {
    const worker = await this.resolveWorkerForMobileUser(actor);
    const search = (query.search || '').trim().toLowerCase();
    const status = (query.status || 'active').trim().toLowerCase();
    const assignments = await this.refreshAutoAssignmentStatuses(
      await this.mergeShiftsWithRelational(
        await this.workOrdersRepo.find({
          order: { createdAt: 'DESC', startDate: 'DESC', id: 'DESC' },
        }),
      ),
    );
    const assigned = assignments.filter((wo) =>
      this.workOrderHasAssignedWorker(wo, worker.id),
    );
    const projectIds = [...new Set(assigned.map((wo) => wo.projectId).filter(Boolean))];
    const projects =
      projectIds.length > 0
        ? await this.projectsRepo.find({ where: { id: In(projectIds) } })
        : [];
    const projectById = new Map(projects.map((project) => [project.id, project]));
    const shiftTemplates = await this.shiftCatalogRepo.find({
      where: { status: 'active' },
    });
    const shiftTemplateById = new Map(
      shiftTemplates.map((shiftTemplate) => [shiftTemplate.id, shiftTemplate]),
    );
    const shiftCompletion = await this.resolveMobileShiftCompletion(assigned);
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
          shiftCompletion.completedShiftKeys,
          shiftCompletion.completedTemplateIdsByShift,
          quickAccessMaps,
          shiftTemplateById,
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
    const shifts = normalizeWorkOrderShifts(workOrder.shifts, workOrder.shifts);
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

    const confirmationSnapshot = snapshotWorkerConfirmations(shifts);
    let updated = updateShiftWorkerConfirmation(
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
    updated = preserveOtherWorkerConfirmations(
      updated,
      confirmationSnapshot,
      { shiftId, roleId, workerId: worker.id },
    );
    workOrder.shifts = updated;
    const saved = await this.workOrdersRepo.save(workOrder);
    this.realtime.emitTableUpdated('work_orders');
    await this.shiftsWrite.updateWorkerConfirmation({
      workOrderId: workOrderId,
      shiftId,
      roleId,
      workerId: worker.id,
      status,
      respondedAt: new Date().toISOString(),
    });
    await this.refreshShifts(saved);
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
    const shifts = normalizeWorkOrderShifts(workOrder.shifts, workOrder.shifts);
    let updatedCount = 0;
    const touchedShifts: string[] = [];
    const respondedAt = new Date().toISOString();

    this.logger.log(
      `[mobile-confirmation] assignment request workOrder=${workOrderId} worker=${worker.id} email=${worker.email} status=${status}`,
    );

    const confirmationSnapshot = snapshotWorkerConfirmations(shifts);
    const touchedTargets: Array<{ shiftId: string; roleId: string }> = [];
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

        touchedTargets.push({ shiftId, roleId });

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

    /** Defensive pass: re-apply every other worker's confirmation from the pre-mutation snapshot. */
    const targets: Array<{ shiftId: string; roleId: string; workerId: string }> = [];
    for (const shift of nextShifts) {
      const shiftId = typeof (shift as { id?: unknown }).id === 'string'
        ? (shift as { id: string }).id
        : '';
      if (!shiftId) continue;
      const roles = Array.isArray((shift as { roles?: unknown }).roles)
        ? (shift as { roles: Record<string, unknown>[] }).roles
        : [];
      for (const role of roles) {
        const roleId = typeof role.id === 'string' ? role.id : '';
        if (!roleId) continue;
        const assignedWorkers = Array.isArray(role.assignedWorkers)
          ? (role.assignedWorkers as string[])
          : [];
        for (const wid of assignedWorkers) {
          targets.push({ shiftId, roleId, workerId: wid });
        }
      }
    }
    let guarded = nextShifts as Record<string, unknown>[];
    for (const t of targets) {
      guarded = preserveOtherWorkerConfirmations(guarded, confirmationSnapshot, t);
    }
    workOrder.shifts = guarded;
    const saved = await this.workOrdersRepo.save(workOrder);
    this.realtime.emitTableUpdated('work_orders');
    for (const t of touchedTargets) {
      await this.shiftsWrite.updateWorkerConfirmation({
        workOrderId: workOrderId,
        shiftId: t.shiftId,
        roleId: t.roleId,
        workerId: worker.id,
        status,
        respondedAt,
      });
    }
    await this.refreshShifts(saved);
    this.logger.log(
      `[mobile-confirmation] assignment saved workOrder=${workOrderId} worker=${worker.id} status=${status} updatedCount=${updatedCount} shifts=${touchedShifts.join(',')}`,
    );
    return this.serializeMobileAssignment(saved, worker.id);
  }

  async findOne(id: string) {
    const workOrder = await this.workOrdersRepo.findOne({ where: { id } });
    if (!workOrder) throw new NotFoundException(`Assignment ${id} not found`);
    const [merged] = await this.mergeShiftsWithRelational([workOrder]);
    return merged;
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

  private async resolveMobileShiftCompletion(
    workOrders: WorkOrder[],
  ): Promise<MobileShiftCompletion> {
    const workOrderIds = [...new Set(workOrders.map((wo) => wo.id).filter(Boolean))];
    if (workOrderIds.length === 0) {
      return {
        completedShiftKeys: new Set<string>(),
        completedTemplateIdsByShift: new Map<string, Set<string>>(),
      };
    }

    const [submissions, templates] = await Promise.all([
      this.formSubmissionsRepo.find({
        where: {
          workOrderId: In(workOrderIds),
          status: 'submitted',
        },
      }),
      this.formTemplatesRepo.find(),
    ]);
    const eligibleSubmissions = submissions.filter(countsTowardShiftCompletion);
    const submittedKeys = new Set(
      eligibleSubmissions
        .map((submission) => `${submission.workOrderId}:${submission.shiftId}:${submission.templateId}`),
    );
    const completedShiftKeys = new Set<string>();
    const completedTemplateIdsByShift = new Map<string, Set<string>>();
    const completedTimesheetWorkersByShift = new Map<string, Set<string>>();

    for (const submission of eligibleSubmissions) {
      const shiftKey = `${submission.workOrderId}:${submission.shiftId}`;
      const completedWorkers =
        completedTimesheetWorkersByShift.get(shiftKey) ?? new Set<string>();
      for (const row of this.findTimesheetRows(submission.data ?? {})) {
        const workerId =
          typeof row.workerId === 'string' ? row.workerId.trim() : '';
        const rowStatus =
          typeof row.status === 'string' ? row.status.trim().toLowerCase() : '';
        if (
          workerId &&
          ['completed', 'submitted', 'done', 'approved'].includes(rowStatus)
        ) {
          completedWorkers.add(workerId);
        }
      }
      completedTimesheetWorkersByShift.set(shiftKey, completedWorkers);
    }

    for (const workOrder of workOrders) {
      const pickedTemplateIds = new Set((workOrder.formTemplateIds || []).filter(Boolean));
      const workOrderTemplates = templates.filter((template) => {
        if (!this.isWorkOrderTemplate(template)) return false;
        return pickedTemplateIds.size === 0 || pickedTemplateIds.has(template.id);
      });
      const requiredTemplates =
        workOrderTemplates.length > 0
          ? workOrderTemplates
          : templates.filter((template) => {
              if (template.isRequired === false) return false;
              if (this.isIncidentTemplate(template)) return false;
              if (this.isTimesheetTemplate(template)) return false;
              return pickedTemplateIds.size === 0 || pickedTemplateIds.has(template.id);
            });
      if (requiredTemplates.length === 0) continue;
      const shifts = Array.isArray(workOrder.shifts) ? workOrder.shifts : [];
      for (const shift of shifts) {
        const record = shift as Record<string, unknown>;
        const shiftId = typeof record.id === 'string' ? record.id : '';
        if (!shiftId) continue;
        const shiftKey = `${workOrder.id}:${shiftId}`;
        const assignedWorkerIds = this.assignedWorkerIdsForShift(record);
        const completedTimesheetWorkers =
          completedTimesheetWorkersByShift.get(shiftKey) ?? new Set<string>();
        const completedTemplateIds = new Set<string>();
        for (const template of requiredTemplates) {
          const hasDirectSubmission = submittedKeys.has(
            `${shiftKey}:${template.id}`,
          );
          const hasSharedTimesheets =
            this.isTimesheetTemplate(template) &&
            assignedWorkerIds.size > 0 &&
            [...assignedWorkerIds].every((workerId) =>
              completedTimesheetWorkers.has(workerId),
            );
          if (hasDirectSubmission || hasSharedTimesheets) {
            completedTemplateIds.add(template.id);
          }
        }
        completedTemplateIdsByShift.set(shiftKey, completedTemplateIds);
        const hasEveryRequired = requiredTemplates.every((template) =>
          completedTemplateIds.has(template.id),
        );
        if (hasEveryRequired) completedShiftKeys.add(`${workOrder.id}:${shiftId}`);
      }
    }

    return { completedShiftKeys, completedTemplateIdsByShift };
  }

  private async resolveCompletedMobileShiftKeys(workOrders: WorkOrder[]) {
    return (await this.resolveMobileShiftCompletion(workOrders)).completedShiftKeys;
  }

  private isTimesheetTemplate(template: FormTemplate) {
    return [template.category, template.name]
      .filter(Boolean)
      .some((value) =>
        String(value).toLowerCase().replace(/\s+/g, '').includes('timesheet'),
      );
  }

  private isWorkOrderTemplate(template: FormTemplate) {
    const text = [template.category, template.name]
      .filter(Boolean)
      .map((value) => String(value).toLowerCase())
      .join(' ');
    return text.includes('work order') || /\bwo\b/.test(text);
  }

  private isIncidentTemplate(template: FormTemplate) {
    return [template.category, template.name]
      .filter(Boolean)
      .some((value) =>
        String(value).toLowerCase().replace(/\s+/g, '').includes('incident'),
      );
  }

  private findTimesheetRows(data: Record<string, unknown>) {
    const rows: Record<string, unknown>[] = [];
    for (const value of Object.values(data)) {
      if (!Array.isArray(value)) continue;
      for (const entry of value) {
        if (
          typeof entry === 'object' &&
          entry !== null &&
          typeof (entry as Record<string, unknown>).workerId === 'string'
        ) {
          rows.push(entry as Record<string, unknown>);
        }
      }
    }
    return rows;
  }

  private assignedWorkerIdsForShift(shift: Record<string, unknown>) {
    const workerIds = new Set<string>();
    const roles = Array.isArray(shift.roles) ? shift.roles : [];
    for (const rawRole of roles) {
      if (!rawRole || typeof rawRole !== 'object') continue;
      const role = rawRole as Record<string, unknown>;
      const assignedWorkers = Array.isArray(role.assignedWorkers)
        ? role.assignedWorkers
        : [];
      for (const workerId of assignedWorkers) {
        if (typeof workerId === 'string' && workerId.trim()) {
          workerIds.add(workerId.trim());
        }
      }
    }
    return workerIds;
  }

  private serializeMobileAssignment(
    workOrder: WorkOrder,
    workerId: string,
    project?: Project,
    completedShiftKeys = new Set<string>(),
    completedTemplateIdsByShift = new Map<string, Set<string>>(),
    quickAccessMaps?: {
      workerById: Map<string, Worker>;
      equipmentById: Map<string, Equipment>;
      materialById: Map<string, Material>;
      clientById: Map<string, Client>;
      pdfSubmissionsByWorkOrderId: Map<string, FormSubmission[]>;
    },
    shiftTemplateById = new Map<string, ShiftCatalog>(),
  ) {
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
        const shiftTemplateId =
          typeof record.shiftTemplateId === 'string'
            ? record.shiftTemplateId
            : '';
        const shiftTemplate = shiftTemplateById.get(shiftTemplateId);
        const startTime =
          typeof role.startTime === 'string'
            ? role.startTime
            : typeof record.defaultRoleStartTime === 'string'
              ? record.defaultRoleStartTime
              : typeof record.startTime === 'string'
                ? record.startTime
                : '';
        const resolvedShiftTemplate =
          shiftTemplate ??
          [...shiftTemplateById.values()].find(
            (candidate) =>
              mobileClockMinutes(candidate.startTime) === mobileClockMinutes(startTime),
          );
        return {
          id: typeof record.id === 'string' ? record.id : '',
          date: typeof record.date === 'string' ? record.date : '',
          shiftTypeName: resolvedShiftTemplate?.name || '',
          startTime,
          endTime:
            mobileShiftEndTime(startTime, resolvedShiftTemplate) ||
            (typeof record.endTime === 'string' ? record.endTime : ''),
          roleId: typeof role.id === 'string' ? role.id : '',
          roleName: typeof role.roleName === 'string' ? role.roleName : '',
          confirmationStatus:
            confirmation?.status === 'confirmed' || confirmation?.status === 'declined'
              ? confirmation.status
              : 'pending',
          completed: completedShiftKeys.has(
            `${workOrder.id}:${typeof record.id === 'string' ? record.id : ''}`,
          ),
          completedFormTemplateIds: [
            ...(completedTemplateIdsByShift.get(
              `${workOrder.id}:${typeof record.id === 'string' ? record.id : ''}`,
            ) ?? new Set<string>()),
          ],
        };
      })
      .filter((shift): shift is NonNullable<typeof shift> => Boolean(shift))
      .sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime));
    const visibleShiftIds = new Set(workerShifts.map((shift) => shift.id).filter(Boolean));
    const quickAccess = this.buildMobileQuickAccess(
      workOrder,
      project,
      quickAccessMaps,
      visibleShiftIds,
    );

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
    const projectIds = new Set<string>();
    const workOrderIds = new Set<string>();
    for (const workOrder of workOrders) {
      const ids = this.collectMobileQuickAccessIds(workOrder);
      ids.workerIds.forEach((id) => workerIds.add(id));
      ids.equipmentIds.forEach((id) => equipmentIds.add(id));
      ids.materialIds.forEach((id) => materialIds.add(id));
      if (workOrder.projectId) projectIds.add(workOrder.projectId);
      if (workOrder.id) workOrderIds.add(workOrder.id);
    }

    const projects = projectIds.size > 0
      ? await this.projectsRepo.find({ where: { id: In([...projectIds]) } })
      : [];
    const clientIds = [
      ...new Set(projects.map((project) => project.clientId).filter(Boolean)),
    ];

    const [workers, equipment, materials, clients, pdfSubmissions]: [
      Worker[],
      Equipment[],
      Material[],
      Client[],
      FormSubmission[],
    ] = await Promise.all([
      workerIds.size > 0 ? this.workerRepo.find({ where: { id: In([...workerIds]) } }) : Promise.resolve([]),
      equipmentIds.size > 0 ? this.equipmentRepo.find({ where: { id: In([...equipmentIds]) } }) : Promise.resolve([]),
      materialIds.size > 0 ? this.materialsRepo.find({ where: { id: In([...materialIds]) } }) : Promise.resolve([]),
      clientIds.length > 0 ? this.clientsRepo.find({ where: { id: In(clientIds) } }) : Promise.resolve([]),
      workOrderIds.size > 0
        ? this.formSubmissionsRepo.find({ where: { workOrderId: In([...workOrderIds]), status: 'submitted' } })
        : Promise.resolve([]),
    ]);
    const pdfSubmissionsByWorkOrderId = new Map<string, FormSubmission[]>();
    pdfSubmissions
      .filter((submission) => submission.pdfUrl?.trim())
      .forEach((submission) => {
        const rows = pdfSubmissionsByWorkOrderId.get(submission.workOrderId) || [];
        rows.push(submission);
        pdfSubmissionsByWorkOrderId.set(submission.workOrderId, rows);
      });

    return {
      workerById: new Map<string, Worker>(workers.map((item) => [item.id, item])),
      equipmentById: new Map<string, Equipment>(equipment.map((item) => [item.id, item])),
      materialById: new Map<string, Material>(materials.map((item) => [item.id, item])),
      clientById: new Map<string, Client>(clients.map((item) => [item.id, item])),
      pdfSubmissionsByWorkOrderId,
    };
  }

  private collectMobileQuickAccessIds(workOrder: WorkOrder, visibleShiftIds?: Set<string>) {
    const workerIds = new Set<string>();
    const equipmentIds = new Set<string>();
    const materialIds = new Set<string>();
    for (const shift of Array.isArray(workOrder.shifts) ? workOrder.shifts : []) {
      const shiftId = typeof (shift as Record<string, unknown>).id === 'string'
        ? String((shift as Record<string, unknown>).id)
        : '';
      if (visibleShiftIds && (!shiftId || !visibleShiftIds.has(shiftId))) continue;
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
      clientById: Map<string, Client>;
      pdfSubmissionsByWorkOrderId: Map<string, FormSubmission[]>;
    },
    visibleShiftIds?: Set<string>,
  ) {
    const visibleDocumentTypes = new Set<string>();
    const visibleShiftNotes: { id: string; title: string; body: string }[] = [];
    for (const rawShift of Array.isArray(workOrder.shifts) ? workOrder.shifts : []) {
      const shift = rawShift as unknown as Record<string, unknown>;
      const shiftId = typeof shift.id === 'string' ? shift.id : '';
      if (visibleShiftIds && (!shiftId || !visibleShiftIds.has(shiftId))) continue;
      const selected = Array.isArray(shift.visibleDocumentTypes)
        ? shift.visibleDocumentTypes.filter((item): item is string => typeof item === 'string')
        : [];
      selected.forEach((item) => visibleDocumentTypes.add(item));
      if (selected.includes('Other Notes') && typeof shift.notes === 'string' && shift.notes.trim()) {
        visibleShiftNotes.push({ id: `shift_note_${shiftId}`, title: 'Shift Notes', body: shift.notes.trim() });
      }
    }
    const { workerIds, equipmentIds, materialIds } = this.collectMobileQuickAccessIds(
      workOrder,
      visibleShiftIds,
    );
    const crew = [...workerIds].map((id) => {
      const worker = maps?.workerById.get(id);
      const name = worker
        ? `${worker.firstName} ${worker.lastName}`.trim() || worker.email || worker.id
        : id;
      const allShiftRoles = this.shiftRolesForWorker(workOrder, id);
      const shiftRoles = visibleShiftIds
        ? Object.fromEntries(
            Object.entries(allShiftRoles).filter(([shiftId]) =>
              visibleShiftIds.has(shiftId),
            ),
          )
        : allShiftRoles;
      const shiftIds = Object.keys(shiftRoles);
      const roleNames = [...new Set(Object.values(shiftRoles).flat())];
      return {
        id,
        name,
        initials: this.initialsFromName(name),
        roleLine: roleNames.join(', ') || worker?.role || worker?.type || 'Assigned crew',
        badge: worker?.type || worker?.role || 'Crew',
        phone: worker?.phone || '',
        shiftIds,
        shiftRoles,
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
      ...visibleShiftNotes,
      ...(visibleDocumentTypes.has('Other Notes') ? [
      workOrder.dispatchNote?.trim()
        ? { id: 'dispatchNote', title: 'Dispatch Note', body: workOrder.dispatchNote.trim() }
        : null,
      workOrder.notes?.trim()
        ? { id: 'notes', title: 'Notes', body: workOrder.notes.trim() }
        : null,
      ] : []),
    ].filter((item): item is { id: string; title: string; body: string } => Boolean(item));
    const allDocuments = [
      ...(maps?.pdfSubmissionsByWorkOrderId.get(workOrder.id) || []).map((submission, index) => ({
        id: `generated_pdf_${submission.id || index}`,
        title: this.generatedPdfTitle(submission, index),
        url: submission.pdfUrl,
        tag: 'Generated PDF',
      })),
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
    const documents = allDocuments.filter((document) =>
      this.mobileDocumentIsVisible(document.title, document.id, visibleDocumentTypes),
    );
    const client = project?.clientId?.trim()
      ? maps?.clientById.get(project.clientId) ?? null
      : null;

    return {
      crewCount: crew.length,
      equipmentCount: equipment.length,
      hasClient: Boolean(client),
      hasNotes: notes.length > 0,
      documentCount: documents.length,
      crew,
      equipment,
      client: client
        ? {
            id: client.id,
            name: client.name,
            contactName: client.contactName,
            email: client.email,
            phone: client.phone,
            website: client.website,
            address: [client.address, client.city, client.state, client.zipCode, client.country]
              .map((item) => item?.trim())
              .filter(Boolean)
              .join(', '),
            projectNumber: project?.number || '',
            projectManager: project?.projectManager || '',
            projectManagerEmail: project?.projectManagerEmail || '',
          }
        : null,
      notes,
      documents,
    };
  }

  private mobileDocumentIsVisible(title: string, id: string, allowed: Set<string>) {
    const key = `${title} ${id}`.toLowerCase();
    if (key.includes('timesheet')) return allowed.has('Timesheet');
    if (key.includes('incident')) return allowed.has('Incident Report');
    if (key.includes('site map') || key.includes('sitemap') || key.includes('site-map')) return allowed.has('Site Map');
    if (key.includes('safety')) return allowed.has('Safety Plan');
    return allowed.has('Work Order');
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

  private shiftRolesForWorker(workOrder: WorkOrder, workerId: string) {
    const rolesByShift: Record<string, string[]> = {};
    for (const shift of Array.isArray(workOrder.shifts) ? workOrder.shifts : []) {
      const shiftRecord = shift as Record<string, unknown>;
      const shiftId = typeof shiftRecord.id === 'string' ? shiftRecord.id : '';
      if (!shiftId) continue;
      const roleNames = new Set<string>();
      const roles = Array.isArray(shiftRecord.roles)
        ? (shiftRecord.roles as Record<string, unknown>[])
        : [];
      for (const role of roles) {
        const assignedWorkers = Array.isArray(role.assignedWorkers) ? role.assignedWorkers : [];
        if (!assignedWorkers.includes(workerId)) continue;
        if (typeof role.roleName === 'string' && role.roleName.trim()) {
          roleNames.add(role.roleName.trim());
        }
      }
      if (roleNames.size > 0) {
        rolesByShift[shiftId] = [...roleNames];
      }
    }
    return rolesByShift;
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

  private generatedPdfTitle(submission: FormSubmission, index: number) {
    const submittedAt = submission.submittedAt
      ? new Date(submission.submittedAt).toISOString().slice(0, 10)
      : '';
    return [
      `Generated PDF ${index + 1}`,
      submittedAt,
    ].filter(Boolean).join(' - ');
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
    const orderNumber = (dto.orderNumber?.trim())
      || (await this.numbering.nextWorkOrderNumber());
    const entity = this.workOrdersRepo.create({
      ...dtoWithoutDeclaredStatus,
      orderNumber,
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

    return this.workOrdersRepo.save(entity).then(async (saved) => {
      this.realtime.emitTableUpdated('work_orders');
      await this.shiftsWrite.replaceShiftsForWorkOrder(
        saved.id,
        WorkOrderShiftsWriteService.fromJson(saved.id, saved.shifts),
      );
      await this.refreshShifts(saved);
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
    if (dto.shifts !== undefined) {
      await this.shiftsWrite.replaceShiftsForWorkOrder(
        saved.id,
        WorkOrderShiftsWriteService.fromJson(saved.id, saved.shifts),
      );
    }
    await this.refreshShifts(saved);
    return saved;
  }

  /**
   * Creates multiple shifts for a work order in one transaction.
   * Used by the scheduler to repeat a shift for several days of the week.
   */
  async bulkCreateShifts(
    workOrderId: string,
    payload: BulkCreateShiftsDto,
  ) {
    const workOrder = await this.findOne(workOrderId);

    if (!Array.isArray(payload.dates) || payload.dates.length === 0) {
      throw new BadRequestException('At least one date is required.');
    }
    if (!Array.isArray(payload.roles) || payload.roles.length === 0) {
      throw new BadRequestException('At least one role is required.');
    }

    const seen = new Set<string>();
    const uniqueDates = payload.dates.filter((d) => {
      if (typeof d !== 'string' || !d.trim()) return false;
      if (seen.has(d)) return false;
      seen.add(d);
      return true;
    });
    if (uniqueDates.length === 0) {
      throw new BadRequestException('No valid dates provided.');
    }

    /** Pre-validation: every date must fall within the assignment range. */
    assertShiftsWithinAssignmentDateRange(
      workOrder.startDate,
      workOrder.endDate,
      uniqueDates.map((date) => ({ date })),
    );

    const existingShifts = Array.isArray(workOrder.shifts)
      ? (workOrder.shifts as Record<string, unknown>[])
      : [];
    const skipDuplicates = payload.skipDuplicates !== false;

    /** Returns true if a shift already exists for that date with the same startTime. */
    const hasConflictingShift = (date: string) =>
      existingShifts.some((s) => {
        if (!s || typeof s !== 'object') return false;
        const row = s as { date?: unknown; startTime?: unknown; endTime?: unknown };
        if (typeof row.date !== 'string' || row.date !== date) return false;
        if (typeof row.startTime === 'string' && row.startTime === payload.startTime) {
          return true;
        }
        return false;
      });

    const created: Record<string, unknown>[] = [];
    const skipped: string[] = [];
    const nowId = Date.now();

    for (const date of uniqueDates) {
      if (skipDuplicates && hasConflictingShift(date)) {
        skipped.push(date);
        continue;
      }
      created.push({
        id: `s_bulk_${nowId}_${date.replace(/-/g, '')}`,
        workOrderId,
        shiftTemplateId: payload.shiftTemplateId || undefined,
        defaultRoleStartTime: payload.defaultRoleStartTime || payload.startTime,
        date,
        startTime: payload.startTime,
        endTime: payload.endTime,
        status: payload.status,
        createdByUserId: payload.createdByUserId,
        requesterUserId: payload.requesterUserId,
        address: payload.address,
        addressLatitude: payload.addressLatitude,
        addressLongitude: payload.addressLongitude,
        addressCity: payload.addressCity,
        addressState: payload.addressState,
        addressZipCode: payload.addressZipCode,
        addressCountry: payload.addressCountry,
        requesterName: payload.requesterName,
        visibleDocumentTypes: payload.visibleDocumentTypes || [],
        notes: payload.notes,
        roles: payload.roles.map((role, roleIdx) => ({
          id: `sr_bulk_${nowId}_${date.replace(/-/g, '')}_${roleIdx}`,
          roleName: role.roleName,
          requiredCount: role.requiredCount,
          startTime: role.startTime || payload.startTime,
          requiredCertificationIds: role.requiredCertificationIds || [],
          requiredSkillIds: role.requiredSkillIds || [],
          assignedWorkers: role.assignedWorkers || [],
          assignedEquipment: role.assignedEquipment || [],
          assignedMaterials: role.assignedMaterials || [],
        })),
      });
    }

    if (created.length === 0) {
      return { workOrder, created: [], skipped };
    }

    workOrder.shifts = [...existingShifts, ...created];
    const saved = await this.workOrdersRepo.save(workOrder);
    this.realtime.emitTableUpdated('work_orders');
    if (created.length > 0) {
      const existingRelational =
        (await this.shiftsQuery.loadShiftsForWorkOrder(saved.id)) ?? [];
      const existingWriteInputs = WorkOrderShiftsWriteService.fromJson(
        saved.id,
        existingRelational,
      );
      const newWriteInputs = WorkOrderShiftsWriteService.fromJson(
        saved.id,
        created,
      );
      await this.shiftsWrite.replaceShiftsForWorkOrder(saved.id, [
        ...existingWriteInputs,
        ...newWriteInputs,
      ]);
    }
    await this.refreshShifts(saved);
    return { workOrder: saved, created, skipped };
  }

  async remove(id: string) {
    const workOrder = await this.findOne(id);
    await this.workOrdersRepo.softRemove(workOrder);
    this.realtime.emitTableUpdated('work_orders');
    return { success: true, trashed: true };
  }

  findTrash() {
    return this.workOrdersRepo.find({
      withDeleted: true,
      where: { deletedAt: Not(IsNull()) },
      order: { deletedAt: 'DESC' },
    });
  }

  async restore(id: string) {
    const workOrder = await this.workOrdersRepo.findOne({
      withDeleted: true,
      where: { id },
    });
    if (!workOrder || !workOrder.deletedAt) {
      throw new NotFoundException(`Deleted assignment ${id} not found`);
    }
    await this.workOrdersRepo.restore(id);
    const restored = await this.findOne(id);
    this.realtime.emitTableUpdated('work_orders');
    return restored;
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

  /**
   * Reads shifts from the relational tables for the given work orders and
   * overwrites each row's `shifts` with the result. Work orders with no
   * rows in the new tables get `shifts: []`. The legacy `work_orders.shifts`
   * JSON is no longer consulted by findOne/findAll.
   */
  private async mergeShiftsWithRelational<T extends WorkOrder>(rows: T[]): Promise<T[]> {
    if (rows.length === 0) return rows;
    try {
      const ids = rows.map((r) => r.id);
      const shiftsByWorkOrder =
        await this.shiftsQuery.loadShiftsForWorkOrders(ids);
      for (const row of rows) {
        const relational = shiftsByWorkOrder.get(row.id);
        (row as unknown as { shifts: unknown }).shifts = relational ?? [];
      }
    } catch (err) {
      if (process.env.NODE_ENV !== 'test') {
        this.logger.warn(
          `[shifts-merge] failed to load relational shifts: ${(err as Error).message}`,
        );
      }
      for (const row of rows) {
        (row as unknown as { shifts: unknown }).shifts = [];
      }
    }
    return rows;
  }

  /**
   * Re-applies the shifts merge on a single work order after a write.
   * The relational tables are the source of truth, so the in-memory
   * `shifts` must be refreshed after every mutation.
   */
  private async refreshShifts<T extends WorkOrder>(row: T): Promise<T> {
    const [refreshed] = await this.mergeShiftsWithRelational([row]);
    return refreshed;
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
