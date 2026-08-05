/**
 * Shift status computation.
 *
 * A shift has one of seven statuses drawn from `status_catalog`:
 *
 *   Manual (the user picks them in the shift form):
 *     - customer_pending  (orange)
 *     - dispatch_pending  (yellow)
 *     - ready_to_notify   (blue)
 *
 *   Automatic (computed here from confirmation_status + form submissions):
 *     - awaiting_response  (violet)
 *     - workers_confirmed  (green)
 *     - shift_cancelled    (red)
 *     - shift_completed    (slate)
 *
 * The precedence of automatic states is:
 *   shift_cancelled   > shift_completed > workers_confirmed > awaiting_response
 *
 * If none of the automatic states apply, the user-picked `status` (from
 * `work_order_shifts.status`) is returned.
 */

export type ManualShiftStatus =
  | 'customer_pending'
  | 'dispatch_pending'
  | 'ready_to_notify';

export type AutomaticShiftStatus =
  | 'awaiting_response'
  | 'workers_confirmed'
  | 'shift_cancelled'
  | 'shift_completed'
  | 'pm_approved';

export type ShiftStatusValue = ManualShiftStatus | AutomaticShiftStatus;

export const ALL_SHIFT_STATUSES: ShiftStatusValue[] = [
  'customer_pending',
  'dispatch_pending',
  'ready_to_notify',
  'awaiting_response',
  'workers_confirmed',
  'shift_cancelled',
  'shift_completed',
  'pm_approved',
];

export const MANUAL_SHIFT_STATUSES: ManualShiftStatus[] = [
  'customer_pending',
  'dispatch_pending',
  'ready_to_notify',
];

export const AUTOMATIC_SHIFT_STATUSES: AutomaticShiftStatus[] = [
  'awaiting_response',
  'workers_confirmed',
  'shift_cancelled',
  'shift_completed',
  'pm_approved',
];

export type ShiftWorkerConfirmationStatus = 'pending' | 'confirmed' | 'declined';

export interface ShiftWorkerConfirmationLike {
  workerId?: unknown;
  status?: unknown;
  requestedAt?: unknown;
  notificationChannel?: unknown;
}

interface ShiftRoleLike {
  id?: unknown;
  requiredCount?: unknown;
  assignedWorkers?: unknown;
  workerConfirmations?: unknown;
  [key: string]: unknown;
}

export interface ShiftLike {
  id?: unknown;
  date?: unknown;
  status?: unknown;
  cancelled?: unknown;
  pmApprovedAt?: unknown;
  roles?: unknown;
  [key: string]: unknown;
}

export interface ShiftCompletionLookup {
  /**
   * Returns true if the (workOrderId, shiftId) tuple has every required
   * form submission marked as `submitted`.  Mirrors the
   * `buildCompletedWorkOrderShiftKeys` set that the frontend used to build
   * locally.
   */
  isShiftCompleted(workOrderId: string, shiftId: string): boolean;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const result: string[] = [];
  const seen = new Set<string>();
  for (const entry of value) {
    if (typeof entry !== 'string') continue;
    const trimmed = entry.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    result.push(trimmed);
  }
  return result;
}

function asPositiveInt(value: unknown, fallback = 1): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(1, Math.floor(value));
  }
  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed)) return Math.max(1, parsed);
  }
  return fallback;
}

function normalizeConfirmation(
  entry: unknown,
): ShiftWorkerConfirmationLike | null {
  if (!entry || typeof entry !== 'object') return null;
  const record = entry as Record<string, unknown>;
  const workerId =
    typeof record.workerId === 'string' ? record.workerId.trim() : '';
  if (!workerId) return null;
  return {
    workerId,
    status: record.status,
    requestedAt: record.requestedAt,
    notificationChannel: record.notificationChannel,
  };
}

function asShiftRole(role: unknown): ShiftRoleLike | null {
  if (!role || typeof role !== 'object') return null;
  return role as ShiftRoleLike;
}

function confirmationStatusOf(
  role: ShiftRoleLike,
  workerId: string,
): ShiftWorkerConfirmationStatus {
  const list = Array.isArray(role.workerConfirmations)
    ? (role.workerConfirmations as unknown[])
    : [];
  for (const entry of list) {
    const parsed = normalizeConfirmation(entry);
    if (!parsed || parsed.workerId !== workerId) continue;
    const raw = typeof parsed.status === 'string'
      ? parsed.status.trim().toLowerCase()
      : 'pending';
    if (raw === 'confirmed' || raw === 'declined') return raw;
    return 'pending';
  }
  return 'pending';
}

function isAwaitingResponse(
  role: ShiftRoleLike,
  workerId: string,
): boolean {
  if (confirmationStatusOf(role, workerId) !== 'pending') return false;
  const list = Array.isArray(role.workerConfirmations)
    ? (role.workerConfirmations as unknown[])
    : [];
  for (const entry of list) {
    const parsed = normalizeConfirmation(entry);
    if (!parsed || parsed.workerId !== workerId) continue;
    return Boolean(
      (typeof parsed.requestedAt === 'string' && parsed.requestedAt.trim()) ||
        (typeof parsed.notificationChannel === 'string' &&
          parsed.notificationChannel.trim()),
    );
  }
  return false;
}

export interface ShiftComputedStatus {
  /** The final status value, either manual or automatic. */
  status: ShiftStatusValue | null;
  /** True if the status is automatic (derived). */
  automatic: boolean;
  /** Reason / explanation, useful for debugging or UI tooltips. */
  reason?: string;
}

export interface ComputeShiftStatusInput {
  workOrderId: string;
  shift: ShiftLike;
  completion: ShiftCompletionLookup;
  /** When the work order itself is cancelled, every shift is cancelled. */
  workOrderCancelled?: boolean;
}

/**
 * Compute the final status of a single shift.
 *
 * Precedence (highest wins):
 *   1. workOrderCancelled    → shift_cancelled
 *   2. shift.cancelled flag  → shift_cancelled
 *   3. completion.isCompleted → shift_completed
 *   4. all assigned workers confirmed → workers_confirmed
 *   5. at least one worker awaiting response (notified but not answered) → awaiting_response
 *   6. otherwise fall back to the user-picked manual `status`.
 */
export function computeShiftStatus(
  input: ComputeShiftStatusInput,
): ShiftComputedStatus {
  const { workOrderId, shift, completion, workOrderCancelled } = input;
  const shiftId =
    typeof shift.id === 'string' ? shift.id.trim() : '';
  const manualStatus = typeof shift.status === 'string'
    ? shift.status.trim().toLowerCase()
    : '';
  const automaticLifecycleEnabled = manualStatus === 'ready_to_notify';

  // 1. Work-order cancellation wins over everything.
  if (workOrderCancelled) {
    return {
      status: 'shift_cancelled',
      automatic: true,
      reason: 'work-order cancelled',
    };
  }

  // 2. Explicit cancel flag on the shift.
  if (shift.cancelled === true) {
    return {
      status: 'shift_cancelled',
      automatic: true,
      reason: 'shift cancelled manually',
    };
  }

  if (
    typeof shift.pmApprovedAt === 'string' &&
    Boolean(shift.pmApprovedAt.trim())
  ) {
    return {
      status: 'pm_approved',
      automatic: true,
      reason: 'approved by project manager',
    };
  }

  // 3. Completion (form submissions).
  if (
    automaticLifecycleEnabled &&
    shiftId &&
    completion.isShiftCompleted(workOrderId, shiftId)
  ) {
    return {
      status: 'shift_completed',
      automatic: true,
      reason: 'all forms submitted',
    };
  }

  // 4 + 5. Walk the roles to gather confirmation roll-up.
  const roles = Array.isArray(shift.roles) ? shift.roles : [];
  let totalAssigned = 0;
  let totalConfirmed = 0;
  let totalAwaiting = 0;
  for (const raw of roles) {
    const role = asShiftRole(raw);
    if (!role) continue;
    const workers = asStringArray(role.assignedWorkers);
    if (workers.length === 0) continue;
    for (const wid of workers) {
      totalAssigned += 1;
      const status = confirmationStatusOf(role, wid);
      if (status === 'confirmed') totalConfirmed += 1;
      else if (isAwaitingResponse(role, wid)) totalAwaiting += 1;
    }
  }

  if (automaticLifecycleEnabled && totalAssigned > 0 && totalConfirmed === totalAssigned) {
    return {
      status: 'workers_confirmed',
      automatic: true,
      reason: 'all workers confirmed',
    };
  }

  if (automaticLifecycleEnabled && totalAwaiting > 0) {
    return {
      status: 'awaiting_response',
      automatic: true,
      reason: `${totalAwaiting} worker(s) awaiting response`,
    };
  }

  // 6. Fall back to manual status.
  const fallback = MANUAL_SHIFT_STATUSES.includes(manualStatus as ManualShiftStatus)
    ? (manualStatus as ManualShiftStatus)
    : null;
  return { status: fallback, automatic: false };
}

export interface ShiftAggregateCounters {
  totalShifts: number;
  customerPending: number;
  dispatchPending: number;
  readyToNotify: number;
  awaitingResponse: number;
  workersConfirmed: number;
  shiftCancelled: number;
  shiftCompleted: number;
  pmApproved: number;
  /** Convenience: sum of the three manual statuses. */
  pending: number;
  /** Convenience: shifts with at least one missing required worker. */
  workersMissing: number;
}

export interface AggregateShiftsInput {
  workOrderId: string;
  shifts: ShiftLike[];
  completion: ShiftCompletionLookup;
  workOrderCancelled?: boolean;
}

export function aggregateShiftStatuses(
  input: AggregateShiftsInput,
): ShiftAggregateCounters {
  const counters: ShiftAggregateCounters = {
    totalShifts: 0,
    customerPending: 0,
    dispatchPending: 0,
    readyToNotify: 0,
    awaitingResponse: 0,
    workersConfirmed: 0,
    shiftCancelled: 0,
    shiftCompleted: 0,
    pmApproved: 0,
    pending: 0,
    workersMissing: 0,
  };

  for (const shift of input.shifts) {
    counters.totalShifts += 1;
    counters.workersMissing += computeMissingSlots(shift);

    const result = computeShiftStatus({
      workOrderId: input.workOrderId,
      shift,
      completion: input.completion,
      workOrderCancelled: input.workOrderCancelled,
    });

    switch (result.status) {
      case 'customer_pending':
        counters.customerPending += 1;
        counters.pending += 1;
        break;
      case 'dispatch_pending':
        counters.dispatchPending += 1;
        counters.pending += 1;
        break;
      case 'ready_to_notify':
        counters.readyToNotify += 1;
        counters.pending += 1;
        break;
      case 'awaiting_response':
        counters.awaitingResponse += 1;
        break;
      case 'workers_confirmed':
        counters.workersConfirmed += 1;
        break;
      case 'shift_cancelled':
        counters.shiftCancelled += 1;
        break;
      case 'shift_completed':
        counters.shiftCompleted += 1;
        break;
      case 'pm_approved':
        counters.pmApproved += 1;
        break;
    }
  }

  return counters;
}

function computeMissingSlots(shift: ShiftLike): number {
  const roles = Array.isArray(shift.roles) ? shift.roles : [];
  let total = 0;
  for (const raw of roles) {
    const role = asShiftRole(raw);
    if (!role) continue;
    const required = asPositiveInt(role.requiredCount);
    const have = asStringArray(role.assignedWorkers).length;
    total += Math.max(0, required - have);
  }
  return total;
}

/**
 * Convenience in-memory completion lookup.  Pass the same shape that the
 * frontend builds with `buildCompletedWorkOrderShiftKeys`.
 */
export class InMemoryShiftCompletionLookup implements ShiftCompletionLookup {
  private readonly completed = new Set<string>();

  constructor(keys: Iterable<string> = []) {
    for (const k of keys) this.completed.add(k);
  }

  add(workOrderId: string, shiftId: string): void {
    this.completed.add(`${workOrderId}:${shiftId}`);
  }

  isShiftCompleted(workOrderId: string, shiftId: string): boolean {
    return this.completed.has(`${workOrderId}:${shiftId}`);
  }
}
