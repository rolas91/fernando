/**
 * Pure assignment (work order) auto-status: signals + precedence.
 * Keep in sync with frontend/src/lib/assignmentAutoStatus.ts
 */

export type AutoAssignmentStatus =
  | 'pending'
  | 'confirmed'
  | 'at_risk'
  | 'critical'
  | 'in_progress'
  | 'completed'
  | 'cancelled';

export interface AssignmentAutoStatusRules {
  /** Below this coverage ratio (0–1) ⇒ critical (when other conditions apply). */
  coverageCritical: number;
  /** Below this coverage ratio (0–1), if not critical ⇒ at_risk. */
  coverageAtRisk: number;
  /** First shift starting within this many hours + staffing/equipment gaps ⇒ critical. */
  startsSoonHours: number;
  /** This many distinct shifts with unfilled slots ⇒ contributes to critical. */
  shiftsUnfilledCriticalCount: number;
  /** Total scheduled hours (all active assignments) above this for an assigned worker ⇒ at_risk. */
  weeklyHoursRisk: number;
}

export const DEFAULT_ASSIGNMENT_AUTO_STATUS_RULES: AssignmentAutoStatusRules =
  {
    coverageCritical: 0.6,
    coverageAtRisk: 0.85,
    startsSoonHours: 48,
    shiftsUnfilledCriticalCount: 2,
    weeklyHoursRisk: 40,
  };

export interface AssignmentStatusSignals {
  totalRequired: number;
  totalAssignedWorkers: number;
  coverageRatio: number;
  missingSlotsTotal: number;
  shiftsUnfilledCount: number;
  allShiftsFullyStaffed: boolean;
  /** True if every shift that has ≥1 assigned worker has all confirmations confirmed. */
  allAssignedWorkersConfirmed: boolean;
  anyDeclined: boolean;
  awaitingConfirmationWithFullStaff: boolean;
  equipmentIssueSlots: number;
  equipmentOk: boolean;
  hasScheduleConflict: boolean;
  assignedWorkerWeeklyOvertimeRisk: boolean;
  assignedWorkerCertExpiringRisk: boolean;
  allWorkOrderShiftFormsSubmitted: boolean;
  minShiftStartInHours: number | null;
  operationalShiftCount: number;
  anyShiftInProgress: boolean;
}

export interface ComputeAssignmentStatusInput {
  workOrderId: string;
  /** Current merged entity status before recompute (sticky cancelled). */
  previousStatus?: string;
  /** Request DTO status — used for cancel / uncancel. */
  dtoStatus?: string;
  startDate: string | null | undefined;
  endDate: string | null | undefined;
  shifts: Record<string, unknown>[];
  /** All work orders (for conflicts + weekly hours). Exclude completed/cancelled in caller. */
  allWorkOrdersForScheduling: Array<{
    id: string;
    status: string;
    shifts: Record<string, unknown>[];
  }>;
  equipmentStatusById: ReadonlyMap<string, string>;
  /** Worker id → list of certification expiry YYYY-MM-DD or null. */
  workerCertExpiryDates: ReadonlyMap<string, (string | null | undefined)[]>;
  completedWorkOrderShiftKeys?: ReadonlySet<string>;
  rules: AssignmentAutoStatusRules;
  now: Date;
}

export interface ComputeAssignmentStatusResult {
  status: AutoAssignmentStatus;
  signals: AssignmentStatusSignals;
}

function pad(n: number) {
  return `${n}`.padStart(2, '0');
}

/** YYYY-MM-DD for "today" in local timezone. */
export function localDateISO(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const x of v) {
    if (typeof x !== 'string') continue;
    const t = x.trim();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

function asRoleList(shift: Record<string, unknown>): Record<string, unknown>[] {
  const roles = shift.roles;
  if (!Array.isArray(roles)) return [];
  return roles.filter((r) => r && typeof r === 'object') as Record<
    string,
    unknown
  >[];
}

function requiredCount(role: Record<string, unknown>): number {
  const v = role.requiredCount;
  if (typeof v === 'number' && Number.isFinite(v)) return Math.max(0, Math.floor(v));
  if (typeof v === 'string') {
    const p = Number.parseInt(v, 10);
    if (Number.isFinite(p)) return Math.max(0, p);
  }
  return 0;
}

function shiftTimeOnDate(dateStr: string, timeStr: string): Date {
  const [h, m] = (timeStr || '00:00').split(':').map(Number);
  const [y, mo, d] = dateStr.split('-').map(Number);
  return new Date(y, (mo || 1) - 1, d || 1, h || 0, m || 0, 0, 0);
}

function shiftDurationHours(
  dateStr: string,
  start: string,
  end: string,
): number {
  const a = shiftTimeOnDate(dateStr, start).getTime();
  const b = shiftTimeOnDate(dateStr, end).getTime();
  const diff = (b - a) / 3_600_000;
  return diff > 0 ? diff : diff + 24;
}

function shiftEndOnDate(dateStr: string, start: string, end: string): Date {
  const startDate = shiftTimeOnDate(dateStr, start);
  const endDate = shiftTimeOnDate(dateStr, end);
  if (endDate.getTime() <= startDate.getTime()) {
    endDate.setDate(endDate.getDate() + 1);
  }
  return endDate;
}

function isOperationalShift(shift: Record<string, unknown>, now: Date): boolean {
  const times = parseShiftTimes(shift);
  if (!times) return false;
  return shiftEndOnDate(times.date, times.start, times.end).getTime() > now.getTime();
}

function isShiftInProgress(shift: Record<string, unknown>, now: Date): boolean {
  const times = parseShiftTimes(shift);
  if (!times) return false;
  const start = shiftTimeOnDate(times.date, times.start).getTime();
  const end = shiftEndOnDate(times.date, times.start, times.end).getTime();
  const current = now.getTime();
  return start <= current && current < end;
}

type ConfirmationStatus = 'pending' | 'confirmed' | 'declined';

function confirmationForWorker(
  role: Record<string, unknown>,
  workerId: string,
): ConfirmationStatus {
  const list = role.workerConfirmations;
  if (!Array.isArray(list)) return 'pending';
  for (const entry of list) {
    if (!entry || typeof entry !== 'object') continue;
    const r = entry as Record<string, unknown>;
    if (r.workerId !== workerId) continue;
    const s =
      typeof r.status === 'string' ? r.status.trim().toLowerCase() : 'pending';
    if (s === 'confirmed' || s === 'declined')
      return s as ConfirmationStatus;
    return 'pending';
  }
  return 'pending';
}

function shiftConfirmationRollup(shift: Record<string, unknown>): {
  assigned: number;
  confirmed: number;
  pending: number;
  declined: number;
} {
  let assigned = 0;
  let confirmed = 0;
  let pending = 0;
  let declined = 0;
  for (const role of asRoleList(shift)) {
    const workers = asStringArray(role.assignedWorkers);
    assigned += workers.length;
    for (const wid of workers) {
      const st = confirmationForWorker(role, wid);
      if (st === 'confirmed') confirmed += 1;
      else if (st === 'declined') declined += 1;
      else pending += 1;
    }
  }
  return { assigned, confirmed, pending, declined };
}

function missingSlotsOnShift(shift: Record<string, unknown>): number {
  let m = 0;
  for (const role of asRoleList(shift)) {
    const req = requiredCount(role);
    const have = asStringArray(role.assignedWorkers).length;
    m += Math.max(0, req - have);
  }
  return m;
}

function parseShiftTimes(shift: Record<string, unknown>): {
  date: string;
  start: string;
  end: string;
} | null {
  const date =
    typeof shift.date === 'string' ? shift.date.trim().split('T')[0] : '';
  if (!date) return null;
  const start =
    typeof shift.startTime === 'string'
      ? shift.startTime.trim()
      : typeof shift.defaultRoleStartTime === 'string'
        ? shift.defaultRoleStartTime.trim()
        : '07:00';
  const end =
    typeof shift.endTime === 'string' ? shift.endTime.trim() : '16:00';
  return { date, start, end };
}

/** Workers assigned on this work order (any shift). */
export function collectAssignedWorkerIds(
  shifts: Record<string, unknown>[],
): Set<string> {
  const ids = new Set<string>();
  for (const shift of shifts) {
    for (const role of asRoleList(shift)) {
      asStringArray(role.assignedWorkers).forEach((id) => ids.add(id));
    }
  }
  return ids;
}

function weekStartISO(dateStr: string): string {
  const [y, mo, d] = dateStr.split('-').map(Number);
  const value = new Date(y, (mo || 1) - 1, d || 1);
  value.setHours(0, 0, 0, 0);
  value.setDate(value.getDate() - value.getDay());
  return localDateISO(value);
}

function collectAssignedWorkerWeekKeys(
  shifts: Record<string, unknown>[],
): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();
  for (const shift of shifts) {
    const times = parseShiftTimes(shift);
    if (!times) continue;
    const weekKey = weekStartISO(times.date);
    for (const role of asRoleList(shift)) {
      for (const wid of asStringArray(role.assignedWorkers)) {
        if (!map.has(wid)) map.set(wid, new Set<string>());
        map.get(wid)!.add(weekKey);
      }
    }
  }
  return map;
}

export function computeAssignmentSignals(
  input: Omit<
    ComputeAssignmentStatusInput,
    'previousStatus' | 'dtoStatus' | 'rules' | 'now'
  > & { rules: AssignmentAutoStatusRules; now: Date },
): AssignmentStatusSignals {
  const {
    workOrderId,
    shifts,
    allWorkOrdersForScheduling,
    equipmentStatusById,
    workerCertExpiryDates,
    completedWorkOrderShiftKeys,
    rules,
    now,
  } = input;
  const safeShifts = Array.isArray(shifts) ? shifts : [];
  const operationalShifts = safeShifts.filter((shift) => isOperationalShift(shift, now));
  const anyShiftInProgress = safeShifts.some((shift) => isShiftInProgress(shift, now));

  let totalRequired = 0;
  let totalAssignedWorkers = 0;
  let missingSlotsTotal = 0;
  let shiftsUnfilledCount = 0;
  let allAssignedWorkersConfirmed = true;
  let anyDeclined = false;
  let awaitingConfirmationWithFullStaff = false;
  let equipmentIssueSlots = 0;
  let minShiftStartInHours: number | null = null;

  const msNow = now.getTime();

  for (const shift of operationalShifts) {
    const times = parseShiftTimes(shift);
    if (times) {
      const startDt = shiftTimeOnDate(times.date, times.start);
      const diffH = (startDt.getTime() - msNow) / 3_600_000;
      if (diffH >= 0) {
        minShiftStartInHours =
          minShiftStartInHours === null
            ? diffH
            : Math.min(minShiftStartInHours, diffH);
      }
    }

    const miss = missingSlotsOnShift(shift);
    if (miss > 0) shiftsUnfilledCount += 1;
    missingSlotsTotal += miss;

    const rollup = shiftConfirmationRollup(shift);
    if (rollup.assigned > 0) {
      if (rollup.declined > 0) anyDeclined = true;
      if (rollup.confirmed !== rollup.assigned) {
        allAssignedWorkersConfirmed = false;
        if (miss === 0) awaitingConfirmationWithFullStaff = true;
      }
    }

    for (const role of asRoleList(shift)) {
      const req = requiredCount(role);
      totalRequired += req;
      const workers = asStringArray(role.assignedWorkers);
      totalAssignedWorkers += workers.length;

      const equipIds = asStringArray(role.assignedEquipment);
      for (const eid of equipIds) {
        const st = equipmentStatusById.get(eid)?.toLowerCase() ?? '';
        if (st === 'maintenance' || st === 'retired') equipmentIssueSlots += 1;
      }
    }
  }

  const coverageRatio =
    totalRequired > 0
      ? Math.min(1, totalAssignedWorkers / totalRequired)
      : 1;

  const allShiftsFullyStaffed = missingSlotsTotal === 0;
  const allWorkOrderShiftFormsSubmitted =
    shifts.length > 0 &&
    shifts.every((shift) => {
      const shiftId = typeof shift.id === 'string' ? shift.id.trim() : '';
      return Boolean(shiftId && completedWorkOrderShiftKeys?.has(`${workOrderId}:${shiftId}`));
    });

  const assignedHere = collectAssignedWorkerIds(operationalShifts);

  const hasScheduleConflict = detectConflictForWorkOrder(
    workOrderId,
    allWorkOrdersForScheduling,
    now,
  );

  const activeWos = allWorkOrdersForScheduling.filter(
    (w) => w.status !== 'completed' && w.status !== 'cancelled',
  );

  const weeklyHours = computeWorkerWeeklyHoursScheduled(activeWos);
  const assignedWeeksHere = collectAssignedWorkerWeekKeys(operationalShifts);
  let assignedWorkerWeeklyOvertimeRisk = false;
  assignedWeeksHere.forEach((weekKeys, wid) => {
    const workerHoursByWeek = weeklyHours.get(wid);
    if (!workerHoursByWeek) return;
    weekKeys.forEach((weekKey) => {
      const h = workerHoursByWeek.get(weekKey) ?? 0;
      if (h > rules.weeklyHoursRisk) assignedWorkerWeeklyOvertimeRisk = true;
    });
  });

  const today = localDateISO(now);
  const thirtyDays = new Date(now);
  thirtyDays.setDate(thirtyDays.getDate() + 30);
  const thirtyEnd = localDateISO(thirtyDays);

  let assignedWorkerCertExpiringRisk = false;
  assignedHere.forEach((wid) => {
    const dates = workerCertExpiryDates.get(wid);
    if (!dates?.length) return;
    for (const exp of dates) {
      if (!exp || typeof exp !== 'string') continue;
      const e = exp.trim().split('T')[0];
      if (!e) continue;
      if (e > today && e <= thirtyEnd) {
        assignedWorkerCertExpiringRisk = true;
        return;
      }
    }
  });

  return {
    totalRequired,
    totalAssignedWorkers,
    coverageRatio,
    missingSlotsTotal,
    shiftsUnfilledCount,
    allShiftsFullyStaffed,
    allAssignedWorkersConfirmed,
    anyDeclined,
    awaitingConfirmationWithFullStaff,
    equipmentIssueSlots,
    equipmentOk: equipmentIssueSlots === 0,
    hasScheduleConflict,
    assignedWorkerWeeklyOvertimeRisk,
    assignedWorkerCertExpiringRisk,
    allWorkOrderShiftFormsSubmitted,
    minShiftStartInHours,
    operationalShiftCount: operationalShifts.length,
    anyShiftInProgress,
  };
}

function computeWorkerWeeklyHoursScheduled(
  workOrders: Array<{ shifts: Record<string, unknown>[] }>,
): Map<string, Map<string, number>> {
  const map = new Map<string, Map<string, number>>();
  for (const wo of workOrders) {
    for (const shift of wo.shifts || []) {
      const times = parseShiftTimes(shift);
      if (!times) continue;
      const weekKey = weekStartISO(times.date);
      const hrs = shiftDurationHours(times.date, times.start, times.end);
      for (const role of asRoleList(shift)) {
        for (const wid of asStringArray(role.assignedWorkers)) {
          if (!map.has(wid)) map.set(wid, new Map<string, number>());
          const workerHoursByWeek = map.get(wid)!;
          workerHoursByWeek.set(weekKey, (workerHoursByWeek.get(weekKey) || 0) + hrs);
        }
      }
    }
  }
  return map;
}

function detectConflictForWorkOrder(
  workOrderId: string,
  allWorkOrders: Array<{ id: string; status: string; shifts: unknown[] }>,
  now: Date,
): boolean {
  const active = allWorkOrders.filter(
    (w) => w.status !== 'completed' && w.status !== 'cancelled',
  );
  type Entry = { woId: string; date: string; start: string; end: string };
  const byWorker = new Map<string, Entry[]>();
  for (const wo of active) {
    const wid = wo.id;
    const shifts = Array.isArray(wo.shifts) ? wo.shifts : [];
    for (const s of shifts) {
      if (!s || typeof s !== 'object') continue;
      const shift = s as Record<string, unknown>;
      if (!isOperationalShift(shift, now)) continue;
      const times = parseShiftTimes(shift);
      if (!times) continue;
      for (const role of asRoleList(shift)) {
        for (const workerId of asStringArray(role.assignedWorkers)) {
          if (!byWorker.has(workerId)) byWorker.set(workerId, []);
          byWorker.get(workerId)!.push({
            woId: wid,
            date: times.date,
            start: times.start,
            end: times.end,
          });
        }
      }
    }
  }

  for (const [, entries] of byWorker) {
    const byDate = new Map<string, Entry[]>();
    for (const e of entries) {
      if (!byDate.has(e.date)) byDate.set(e.date, []);
      byDate.get(e.date)!.push(e);
    }
    for (const [, dayList] of byDate) {
      if (dayList.length < 2) continue;
      for (let i = 0; i < dayList.length; i++) {
        for (let j = i + 1; j < dayList.length; j++) {
          const a = dayList[i];
          const b = dayList[j];
          if (a.start < b.end && a.end > b.start) {
            if (a.woId === workOrderId || b.woId === workOrderId) return true;
          }
        }
      }
    }
  }
  return false;
}

function mergeRules(
  partial: Record<string, unknown> | null | undefined,
): AssignmentAutoStatusRules {
  const d = DEFAULT_ASSIGNMENT_AUTO_STATUS_RULES;
  if (!partial || typeof partial !== 'object') return { ...d };
  const n = (k: keyof AssignmentAutoStatusRules, fallback: number) => {
    const v = partial[k as string];
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string') {
      const p = Number.parseFloat(v);
      if (Number.isFinite(p)) return p;
    }
    return fallback;
  };
  return {
    coverageCritical: n('coverageCritical', d.coverageCritical),
    coverageAtRisk: n('coverageAtRisk', d.coverageAtRisk),
    startsSoonHours: n('startsSoonHours', d.startsSoonHours),
    shiftsUnfilledCriticalCount: Math.max(
      1,
      Math.floor(n('shiftsUnfilledCriticalCount', d.shiftsUnfilledCriticalCount)),
    ),
    weeklyHoursRisk: n('weeklyHoursRisk', d.weeklyHoursRisk),
  };
}

export function parseAssignmentAutoStatusRules(
  raw: Record<string, unknown> | null | undefined,
): AssignmentAutoStatusRules {
  return mergeRules(raw);
}

export function resolveStickyCancelled(
  previousStatus: string | undefined,
  dtoStatus: string | undefined,
): boolean {
  if (previousStatus !== 'cancelled') return false;
  if (dtoStatus === undefined) return true;
  if (dtoStatus === 'cancelled') return true;
  return false;
}

export function computeAssignmentStatus(
  input: ComputeAssignmentStatusInput,
): ComputeAssignmentStatusResult {
  const { previousStatus, dtoStatus, rules } = input;

  if (dtoStatus === 'cancelled') {
    const signals = computeAssignmentSignals(input);
    return { status: 'cancelled', signals };
  }

  if (resolveStickyCancelled(previousStatus, dtoStatus)) {
    const signals = computeAssignmentSignals(input);
    return { status: 'cancelled', signals };
  }

  const signals = computeAssignmentSignals(input);
  if (signals.allWorkOrderShiftFormsSubmitted) {
    return { status: 'completed', signals };
  }

  const criticalIssues =
    signals.equipmentIssueSlots > 0 ||
    signals.anyDeclined ||
    signals.hasScheduleConflict ||
    signals.shiftsUnfilledCount >= rules.shiftsUnfilledCriticalCount ||
    (signals.totalRequired > 0 &&
      signals.coverageRatio < rules.coverageCritical);

  const startsSoon =
    signals.minShiftStartInHours !== null &&
    signals.minShiftStartInHours <= rules.startsSoonHours;
  const criticalSoon =
    startsSoon &&
    (signals.missingSlotsTotal > 0 || !signals.equipmentOk);

  if (criticalIssues || criticalSoon) {
    return { status: 'critical', signals };
  }

  const atRiskIssues =
    (signals.totalRequired > 0 &&
      signals.coverageRatio < rules.coverageAtRisk) ||
    signals.assignedWorkerWeeklyOvertimeRisk ||
    signals.assignedWorkerCertExpiringRisk;

  if (atRiskIssues) {
    return { status: 'at_risk', signals };
  }

  if (signals.anyShiftInProgress) {
    return { status: 'in_progress', signals };
  }

  const noCriticalOrRiskLayer =
    !criticalIssues &&
    !criticalSoon &&
    !atRiskIssues;

  if (
    noCriticalOrRiskLayer &&
    signals.allShiftsFullyStaffed &&
    signals.allAssignedWorkersConfirmed &&
    signals.equipmentOk &&
    signals.operationalShiftCount > 0
  ) {
    return { status: 'confirmed', signals };
  }

  return { status: 'pending', signals };
}
