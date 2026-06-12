import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Client } from '../../../entities/client.entity';
import { FormTemplate } from '../../../entities/form-template.entity';
import { Equipment } from '../../../entities/equipment.entity';
import { Material } from '../../../entities/material.entity';
import { Project } from '../../../entities/project.entity';
import { Shift as ShiftCatalog } from '../../../entities/shift.entity';
import { Timesheet } from '../../../entities/timesheet.entity';
import { Worker } from '../../../entities/worker.entity';
import { WorkOrder } from '../../../entities/work-order.entity';
import { FORM_DATA_BINDING_PATHS } from '../utils/form-data-binding.registry';
import type { UserAccessContext } from '../../access/ports/access.port';
import {
  DynamicFormField,
  FORM_CONTRACT_VERSION,
  normalizeFormFields,
} from '../utils/form-contract.util';
import { ClientsService } from './clients.service';
import { FormTemplatesService } from './form-templates.service';
import { ProjectTypesService } from './project-types.service';
import { WorkOrderTypesService } from './work-order-types.service';
import { WorkOrdersService } from './work-orders.service';
import { ProjectsService } from './projects.service';

type ShiftLike = Record<string, unknown>;
type TimesheetScope = 'own' | 'all';

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === 'object' && input !== null && !Array.isArray(input);
}

function asShiftArray(shifts: unknown): ShiftLike[] {
  if (!Array.isArray(shifts)) return [];
  return shifts.filter(isRecord) as ShiftLike[];
}

function findShiftById(
  workOrder: WorkOrder,
  shiftId: string,
): ShiftLike | null {
  const target = shiftId.trim();
  if (!target) return null;
  for (const s of asShiftArray(workOrder.shifts)) {
    const sid = typeof s.id === 'string' ? s.id : '';
    if (sid === target) return s;
  }
  return null;
}

function collectRoleIds(
  shift: ShiftLike,
  key: 'assignedWorkers' | 'assignedEquipment' | 'assignedMaterials',
): string[] {
  const roles = shift.roles;
  if (!Array.isArray(roles)) return [];
  const out = new Set<string>();
  for (const r of roles) {
    if (!isRecord(r)) continue;
    const arr = r[key];
    if (!Array.isArray(arr)) continue;
    for (const x of arr) {
      if (typeof x === 'string' && x.trim()) out.add(x.trim());
    }
  }
  return [...out];
}

function collectAllIdsAcrossShifts(
  workOrder: WorkOrder,
  key: 'assignedWorkers' | 'assignedEquipment' | 'assignedMaterials',
): string[] {
  const out = new Set<string>();
  for (const shift of asShiftArray(workOrder.shifts)) {
    for (const id of collectRoleIds(shift, key)) out.add(id);
  }
  return [...out];
}

function joinLabels(
  ids: string[],
  labels: Map<string, string>,
  emptyFallback = '',
) {
  if (ids.length === 0) return emptyFallback;
  const parts = ids
    .map((id) => labels.get(id))
    .filter((x): x is string => typeof x === 'string' && x.length > 0);
  return parts.length ? parts.join(', ') : emptyFallback;
}

function formatEquipment(e: Equipment): string {
  const id = (e.identifier ?? '').trim();
  const name = (e.name ?? '').trim();
  if (id && name) return `${id} — ${name}`;
  return name || id || e.id;
}

function formatMaterial(m: Material): string {
  const id = (m.identifier ?? '').trim();
  const name = (m.name ?? '').trim();
  if (id && name) return `${id} — ${name}`;
  return name || id || m.id;
}

function rolesSummary(shift: ShiftLike): string {
  const roles = shift.roles;
  if (!Array.isArray(roles)) return '';
  const parts: string[] = [];
  for (const r of roles) {
    if (!isRecord(r)) continue;
    const roleName =
      typeof r.roleName === 'string' ? r.roleName.trim() : 'Role';
    const req = typeof r.requiredCount === 'number' ? r.requiredCount : 0;
    const assigned = Array.isArray(r.assignedWorkers) ? r.assignedWorkers.length : 0;
    const count = req > 0 ? req : assigned;
    if (roleName) parts.push(`${roleName} ×${count || assigned || 1}`);
  }
  return parts.join(', ');
}

function workerRoleNames(shift: ShiftLike, workerId: string): string[] {
  const roles = shift.roles;
  if (!Array.isArray(roles)) return [];
  const names = new Set<string>();
  for (const r of roles) {
    if (!isRecord(r)) continue;
    const assignedWorkers = Array.isArray(r.assignedWorkers) ? r.assignedWorkers : [];
    if (!assignedWorkers.includes(workerId)) continue;
    const roleName = typeof r.roleName === 'string' ? r.roleName.trim() : '';
    if (roleName) names.add(roleName);
  }
  return [...names];
}

function workerRoleStartTime(shift: ShiftLike, workerId: string): string {
  const roles = shift.roles;
  if (!Array.isArray(roles)) return shiftString(shift, 'startTime');
  for (const role of roles) {
    if (!isRecord(role)) continue;
    const assignedWorkers = Array.isArray(role.assignedWorkers)
      ? role.assignedWorkers
      : [];
    if (!assignedWorkers.includes(workerId)) continue;
    if (typeof role.startTime === 'string' && role.startTime.trim()) {
      return role.startTime;
    }
  }
  return shiftString(shift, 'defaultRoleStartTime') || shiftString(shift, 'startTime');
}

function clockMinutes(value: string) {
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

function validExistingClockIn(
  value: string | null | undefined,
  scheduledStartTime: string,
  scheduledEndTime: string,
) {
  if (!value) return false;
  const start = clockMinutes(value);
  const scheduledStart = clockMinutes(scheduledStartTime);
  const scheduledEnd = clockMinutes(scheduledEndTime);
  if (start === null || scheduledStart === null) return false;
  if (scheduledEnd !== null && scheduledEnd <= scheduledStart && start <= scheduledEnd) {
    return true;
  }
  return start >= scheduledStart;
}

function addMinutesToClock(value: string, minutesToAdd: number) {
  const start = clockMinutes(value);
  if (start === null) return '';
  const normalized = (start + minutesToAdd) % (24 * 60);
  const hours = String(Math.floor(normalized / 60)).padStart(2, '0');
  const minutes = String(normalized % 60).padStart(2, '0');
  return `${hours}:${minutes}`;
}

function catalogClock(value: string) {
  const minutes = clockMinutes(value);
  if (minutes === null) return '';
  const hours = String(Math.floor(minutes / 60)).padStart(2, '0');
  const remainder = String(minutes % 60).padStart(2, '0');
  return `${hours}:${remainder}`;
}

function shiftDurationMinutes(template: ShiftCatalog | null) {
  const start = clockMinutes(template?.startTime || '');
  const end = clockMinutes(template?.endTime || '');
  if (start !== null && end !== null) {
    const difference = end - start;
    return difference > 0 ? difference : difference + 24 * 60;
  }
  if (template?.durationHours && template.durationHours > 0) {
    return template.durationHours * 60;
  }
  return null;
}

function hasTimesheetSupervisorRole(roleNames: string[]) {
  return roleNames.some((roleName) =>
    /\b(lead|foreman|supervisor|manager|superintendent)\b/i.test(roleName),
  );
}

function normalizedTemplateText(value: string | undefined) {
  return (value || '').trim().toLowerCase().replace(/[_\s-]+/g, ' ');
}

function isTimesheetTemplate(template: FormTemplate) {
  const key = normalizedTemplateText(template.category);
  const name = normalizedTemplateText(template.name);
  if (key.includes('work order') || key.includes('workorder')) return false;
  if (key.includes('timesheet') || key.includes('time sheet')) return true;
  return name.includes('timesheet') || name.includes('time sheet');
}

function isViewerRole(actor?: UserAccessContext) {
  return (actor?.role || '').trim().toLowerCase() === 'viewer';
}

function canSubmitFinalMobileTimesheets(actor?: UserAccessContext) {
  const permissions = actor?.permissions ?? [];
  const role = (actor?.role || '').trim().toLowerCase();
  return (
    ['scheduler', 'manager', 'admin'].includes(role) ||
    permissions.includes('form-submissions.write') ||
    permissions.includes('timesheets.write') ||
    permissions.includes('work-orders.write') ||
    permissions.includes('mobile.work-orders.submit')
  );
}

function shiftString(shift: ShiftLike, key: string): string {
  const value = shift[key];
  return typeof value === 'string' ? value : '';
}

function parseJsonValue(value: string): unknown {
  if (!value.trim().startsWith('{')) return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function formatTimesheetClockLabel(value: string) {
  const normalized = value.trim();
  if (!normalized) return '';
  if (/^\d{1,2}:\d{2}\s*[AP]\.?M\.?$/i.test(normalized)) return normalized.toUpperCase().replace(/\s+/, ' ');
  const match = normalized.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return normalized;
  let hours = Number(match[1]);
  const minutes = match[2];
  if (!Number.isInteger(hours) || hours < 0 || hours > 23) return normalized;
  const period = hours >= 12 ? 'PM' : 'AM';
  if (hours === 0) hours = 12;
  if (hours > 12) hours -= 12;
  return `${hours}:${minutes} ${period}`;
}

@Injectable()
export class FormContextResolutionService {
  constructor(
    private readonly formTemplates: FormTemplatesService,
    private readonly workOrders: WorkOrdersService,
    private readonly projects: ProjectsService,
    private readonly clients: ClientsService,
    private readonly workOrderTypes: WorkOrderTypesService,
    private readonly projectTypes: ProjectTypesService,
    @InjectRepository(Worker)
    private readonly workerRepo: Repository<Worker>,
    @InjectRepository(Equipment)
    private readonly equipmentRepo: Repository<Equipment>,
    @InjectRepository(Material)
    private readonly materialRepo: Repository<Material>,
    @InjectRepository(Timesheet)
    private readonly timesheetRepo: Repository<Timesheet>,
    @InjectRepository(ShiftCatalog)
    private readonly shiftCatalogRepo: Repository<ShiftCatalog>,
  ) {}

  /**
   * Resuelve valores sugeridos para cada campo del template según assignment (work order)
   * y opcionalmente un shift concreto embebido en la assignment.
   */
  async previewTemplateForWorkOrder(
    templateId: string,
    workOrderId: string,
    shiftId?: string,
    actor?: UserAccessContext,
    options?: { timesheetScope?: TimesheetScope },
  ) {
    const template = await this.formTemplates.findOne(templateId);
    const fields = normalizeFormFields(template.fields) as DynamicFormField[];
    const workOrder = await this.workOrders.findOne(workOrderId);

    const project =
      workOrder.projectId.trim() !== ''
        ? await this.projects
            .findOne(workOrder.projectId)
            .catch(() => null)
        : null;

    let client: Client | null = null;
    if (project?.clientId?.trim()) {
      try {
        client = await this.clients.findOne(project.clientId.trim());
      } catch {
        client = null;
      }
    }

    let workOrderTypeName = '';
    if (workOrder.workOrderTypeId?.trim()) {
      try {
        const wot = await this.workOrderTypes.findOne(
          workOrder.workOrderTypeId.trim(),
        );
        workOrderTypeName = wot.name ?? '';
      } catch {
        workOrderTypeName = '';
      }
    }

    let projectTypeName = '';
    if (project?.projectTypeId?.trim()) {
      try {
        const pt = await this.projectTypes.findOne(project.projectTypeId.trim());
        projectTypeName = pt.name ?? '';
      } catch {
        projectTypeName = '';
      }
    }

    const shift =
      shiftId && shiftId.trim()
        ? findShiftById(workOrder, shiftId.trim())
        : null;

    if (shiftId?.trim() && !shift) {
      throw new BadRequestException(
        `Shift ${shiftId} not found on assignment ${workOrderId}`,
      );
    }

    const workerIds = new Set(collectAllIdsAcrossShifts(workOrder, 'assignedWorkers'));
    if (shift) {
      for (const id of collectRoleIds(shift, 'assignedWorkers')) {
        workerIds.add(id);
      }
    }

    const equipmentIds = new Set(collectAllIdsAcrossShifts(workOrder, 'assignedEquipment'));
    if (shift) {
      for (const id of collectRoleIds(shift, 'assignedEquipment')) {
        equipmentIds.add(id);
      }
    }

    const materialIds = new Set(collectAllIdsAcrossShifts(workOrder, 'assignedMaterials'));
    if (shift) {
      for (const id of collectRoleIds(shift, 'assignedMaterials')) {
        materialIds.add(id);
      }
    }

    const workerLabelById = await this.loadWorkerLabels([...workerIds]);
    const equipmentLabelById = await this.loadEquipmentLabels([...equipmentIds]);
    const materialLabelById = await this.loadMaterialLabels([...materialIds]);

    const ctx = {
      workOrder,
      project: project ?? undefined,
      client: client ?? undefined,
      workOrderTypeName,
      projectTypeName,
      shift: shift ?? undefined,
      workerLabelById,
      equipmentLabelById,
      materialLabelById,
      workerTimesheetByShiftId: shift
        ? await this.loadWorkerTimesheetRows(workOrder, shift, template, actor, options?.timesheetScope)
        : [],
    };

    const fieldPreviews = fields.map((field) => {
      const binding = field.dataBinding?.path;
      if (!binding) {
        return {
          fieldId: field.id,
          bindingPath: null as string | null,
          resolved: false,
          value: null as string | number | boolean | null,
          hint: 'No dataBinding on field',
        };
      }

      try {
        const value = this.resolvePath(ctx, binding);
        const resolved = value !== null && value !== undefined && String(value).trim() !== '';
        return {
          fieldId: field.id,
          bindingPath: binding,
          resolved,
          value: value as string | number | boolean | null,
        };
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        return {
          fieldId: field.id,
          bindingPath: binding,
          resolved: false,
          value: null as string | number | boolean | null,
          hint: message,
        };
      }
    });

    const suggestedData: Record<string, unknown> = {};
    for (const preview of fieldPreviews) {
      if ('value' in preview && preview.resolved && preview.value !== null && preview.value !== undefined) {
        suggestedData[preview.fieldId] = preview.value;
      }
    }

    return {
      templateId: template.id,
      templateName: template.name,
      contractVersion: FORM_CONTRACT_VERSION,
      workOrderId: workOrder.id,
      shiftId: shift?.id && typeof shift.id === 'string' ? shift.id : shiftId?.trim() ?? null,
      catalogRevision: '2026-05-12',
      availablePaths: FORM_DATA_BINDING_PATHS,
      fieldPreviews,
      suggestedData,
    };
  }

  private async loadWorkerLabels(ids: string[]): Promise<Map<string, string>> {
    const map = new Map<string, string>();
    if (ids.length === 0) return map;
    const rows = await this.workerRepo.find({ where: { id: In(ids) } });
    for (const w of rows) {
      const label = `${w.firstName} ${w.lastName}`.trim();
      map.set(w.id, label || w.email || w.id);
    }
    return map;
  }

  private async loadEquipmentLabels(ids: string[]): Promise<Map<string, string>> {
    const map = new Map<string, string>();
    if (ids.length === 0) return map;
    const rows = await this.equipmentRepo.find({ where: { id: In(ids) } });
    for (const e of rows) {
      map.set(e.id, formatEquipment(e));
    }
    return map;
  }

  private async loadMaterialLabels(ids: string[]): Promise<Map<string, string>> {
    const map = new Map<string, string>();
    if (ids.length === 0) return map;
    const rows = await this.materialRepo.find({ where: { id: In(ids) } });
    for (const m of rows) {
      map.set(m.id, formatMaterial(m));
    }
    return map;
  }

  private resolvePath(
    ctx: {
      workOrder: WorkOrder;
      project?: Project;
      client?: Client;
      workOrderTypeName: string;
      projectTypeName: string;
      shift?: ShiftLike;
      workerLabelById: Map<string, string>;
      equipmentLabelById: Map<string, string>;
      materialLabelById: Map<string, string>;
      workerTimesheetByShiftId: Record<string, unknown>[];
    },
    path: string,
  ): unknown {
    const p = path.trim();
    const wo = ctx.workOrder;
    const requiresShift = p.startsWith('shift.');

    if (requiresShift && !ctx.shift) {
      throw new BadRequestException(
        `Binding "${path}" requires shiftId query parameter`,
      );
    }

    if (p.startsWith('workOrder.')) {
      const key = p.slice('workOrder.'.length);
      switch (key) {
        case 'id':
          return wo.id;
        case 'title':
          return wo.title ?? '';
        case 'orderNumber':
          return wo.orderNumber ?? '';
        case 'status':
          return wo.status ?? '';
        case 'startDate':
          return wo.startDate ?? '';
        case 'endDate':
          return wo.endDate ?? '';
        case 'requesterName':
          return wo.requesterName ?? '';
        case 'contactEmail':
          return wo.contactEmail ?? '';
        case 'contactPhoneNumber':
          return wo.contactPhoneNumber ?? '';
        case 'assignmentAddress':
          return wo.assignmentAddress ?? '';
        case 'assignmentCity':
          return wo.assignmentCity ?? '';
        case 'assignmentState':
          return wo.assignmentState ?? '';
        case 'assignmentZipCode':
          return wo.assignmentZipCode ?? '';
        case 'assignmentCountry':
          return wo.assignmentCountry ?? '';
        case 'notes':
          return wo.notes ?? '';
        case 'dispatchNote':
          return wo.dispatchNote ?? '';
        case 'allWorkerNames': {
          const ids = collectAllIdsAcrossShifts(wo, 'assignedWorkers');
          return joinLabels(ids, ctx.workerLabelById, '');
        }
        case 'allEquipmentSummary': {
          const ids = collectAllIdsAcrossShifts(wo, 'assignedEquipment');
          return joinLabels(ids, ctx.equipmentLabelById, '');
        }
        case 'allMaterialsSummary': {
          const ids = collectAllIdsAcrossShifts(wo, 'assignedMaterials');
          return joinLabels(ids, ctx.materialLabelById, '');
        }
        default:
          return null;
      }
    }

    if (p.startsWith('project.') && ctx.project) {
      const key = p.slice('project.'.length);
      const proj = ctx.project as unknown as Record<string, unknown>;
      const v = proj[key];
      return v ?? null;
    }

    if (p.startsWith('client.') && ctx.client) {
      const key = p.slice('client.'.length);
      const cl = ctx.client as unknown as Record<string, unknown>;
      return cl[key] ?? null;
    }

    if (p === 'workOrderType.name') {
      return ctx.workOrderTypeName || null;
    }

    if (p === 'projectType.name') {
      return ctx.projectTypeName || null;
    }

    if (p.startsWith('shift.') && ctx.shift) {
      const key = p.slice('shift.'.length);
      const s = ctx.shift;
      switch (key) {
        case 'id':
          return typeof s.id === 'string' ? s.id : null;
        case 'date':
          return typeof s.date === 'string' ? s.date : null;
        case 'startTime':
          return typeof s.startTime === 'string' ? s.startTime : null;
        case 'endTime':
          return typeof s.endTime === 'string' ? s.endTime : null;
        case 'workerNames': {
          const ids = collectRoleIds(s, 'assignedWorkers');
          return joinLabels(ids, ctx.workerLabelById, '');
        }
        case 'timesheetWorkers':
          return ctx.workerTimesheetByShiftId;
        case 'equipmentSummary': {
          const ids = collectRoleIds(s, 'assignedEquipment');
          return joinLabels(ids, ctx.equipmentLabelById, '');
        }
        case 'materialsSummary': {
          const ids = collectRoleIds(s, 'assignedMaterials');
          return joinLabels(ids, ctx.materialLabelById, '');
        }
        case 'rolesSummary':
          return rolesSummary(s);
        default:
          return null;
      }
    }

    return null;
  }

  private async loadWorkerTimesheetRows(
    workOrder: WorkOrder,
    shift: ShiftLike,
    template: FormTemplate,
    actor?: UserAccessContext,
    timesheetScope?: TimesheetScope,
  ): Promise<Record<string, unknown>[]> {
    let workerIds = collectRoleIds(shift, 'assignedWorkers');
    const workerIdForActor = await this.resolveWorkerIdForActor(actor);
    const actorRoleNames = workerIdForActor ? workerRoleNames(shift, workerIdForActor) : [];
    const forcedSelfTimesheet = timesheetScope === 'own';
    const forcedAllTimesheets = timesheetScope === 'all';
    const isMobileSelfTimesheet =
      !forcedAllTimesheets &&
      isTimesheetTemplate(template) &&
      (forcedSelfTimesheet || isViewerRole(actor)) &&
      !canSubmitFinalMobileTimesheets(actor) &&
      actor?.permissions.includes('mobile.timesheets.submit') &&
      !actor?.permissions.includes('form-submissions.write') &&
      !hasTimesheetSupervisorRole(actorRoleNames);
    if (isMobileSelfTimesheet && workerIdForActor) {
      workerIds = workerIds.filter((workerId) => workerId === workerIdForActor);
    }
    if (workerIds.length === 0) return [];
    const rows = await this.workerRepo.find({ where: { id: In(workerIds) } });
    const workerById = new Map(rows.map((worker) => [worker.id, worker]));
    const shiftId = shiftString(shift, 'id');
    const existingTimesheets = shiftId
      ? await this.timesheetRepo.find({
          where: { workOrderId: workOrder.id, shiftId },
        })
      : [];
    const timesheetByWorkerId = new Map(
      existingTimesheets.map((timesheet) => [timesheet.workerId, timesheet]),
    );
    const shiftTemplateId = shiftString(shift, 'shiftTemplateId');
    const shiftStartTime =
      shiftString(shift, 'defaultRoleStartTime') || shiftString(shift, 'startTime');
    let shiftTemplate = shiftTemplateId
      ? await this.shiftCatalogRepo.findOne({ where: { id: shiftTemplateId } })
      : null;
    if (!shiftTemplate) {
      const catalogStartTime = catalogClock(shiftStartTime);
      shiftTemplate = catalogStartTime
        ? await this.shiftCatalogRepo.findOne({
            where: { startTime: catalogStartTime, status: 'active' },
          })
        : null;
    }
    const durationMinutes = shiftDurationMinutes(shiftTemplate);
    return workerIds.map((workerId, index) => {
      const worker = workerById.get(workerId);
      const timesheet = timesheetByWorkerId.get(workerId);
      const workerName = worker
        ? `${worker.firstName} ${worker.lastName}`.trim() || worker.email || worker.id
        : workerId;
      const scheduledStartTime = formatTimesheetClockLabel(
        workerRoleStartTime(shift, workerId),
      );
      const scheduledEndTime = formatTimesheetClockLabel(
        durationMinutes !== null
          ? addMinutesToClock(workerRoleStartTime(shift, workerId), durationMinutes)
          : shiftString(shift, 'endTime'),
      );
      const existingClockIn = validExistingClockIn(
        timesheet?.clockIn,
        scheduledStartTime,
        scheduledEndTime,
      )
        ? timesheet?.clockIn
        : '';
      return {
        workerId,
        workerName,
        employeeLabel: `Employee #${index + 1}`,
        roleNames: workerRoleNames(shift, workerId),
        workOrderId: workOrder.id,
        projectId: workOrder.projectId ?? '',
        workOrderNumber: workOrder.orderNumber ?? '',
        workOrderTitle: workOrder.title ?? '',
        shiftId,
        shiftDate: timesheet?.date || shiftString(shift, 'date'),
        scheduledStartTime,
        scheduledEndTime,
        startTime: existingClockIn || scheduledStartTime,
        endTime:
          timesheet?.status === 'completed' && timesheet.clockOut
            ? timesheet.clockOut
            : scheduledEndTime,
        st: Number(timesheet?.regularHours ?? 0),
        ot: Number(timesheet?.overtimeHours ?? 0),
        dt: Number(timesheet?.doubleTimeHours ?? 0),
        total:
          Number(timesheet?.regularHours ?? 0) +
          Number(timesheet?.overtimeHours ?? 0) +
          Number(timesheet?.doubleTimeHours ?? 0),
        lunchTaken: timesheet?.lunchTaken ?? false,
        employeeNote: timesheet?.employeeNote ?? '',
        signature: timesheet?.signature ? parseJsonValue(timesheet.signature) : '',
        status: timesheet?.status || 'pending',
      };
    });
  }

  private async resolveWorkerIdForActor(actor?: UserAccessContext) {
    const email = actor?.email?.trim().toLowerCase();
    if (!email) return '';
    const worker = await this.workerRepo.findOne({ where: { email } });
    return worker?.id || '';
  }
}
