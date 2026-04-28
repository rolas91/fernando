export type ShiftConfirmationStatus = 'pending' | 'confirmed' | 'declined';

export interface ShiftWorkerConfirmation {
  workerId: string;
  status: ShiftConfirmationStatus;
  requestedAt?: string;
  respondedAt?: string;
  notificationChannel?: string;
}

type ShiftRoleLike = {
  id?: string;
  assignedWorkers?: unknown;
  workerConfirmations?: unknown;
  [key: string]: unknown;
};

type ShiftLike = {
  id?: string;
  roles?: unknown;
  [key: string]: unknown;
};

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? ({ ...value } as Record<string, unknown>)
    : {};
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  value.forEach((entry) => {
    if (typeof entry !== 'string') return;
    const trimmed = entry.trim();
    if (!trimmed || seen.has(trimmed)) return;
    seen.add(trimmed);
    result.push(trimmed);
  });
  return result;
}

function sanitizeConfirmation(
  value: unknown,
): ShiftWorkerConfirmation | null {
  const record = asObject(value);
  const workerId = typeof record.workerId === 'string' ? record.workerId.trim() : '';
  if (!workerId) return null;

  const rawStatus =
    typeof record.status === 'string' ? record.status.trim().toLowerCase() : 'pending';
  const status: ShiftConfirmationStatus =
    rawStatus === 'confirmed' || rawStatus === 'declined'
      ? (rawStatus as ShiftConfirmationStatus)
      : 'pending';

  const next: ShiftWorkerConfirmation = { workerId, status };
  if (typeof record.requestedAt === 'string' && record.requestedAt.trim()) {
    next.requestedAt = record.requestedAt;
  }
  if (typeof record.respondedAt === 'string' && record.respondedAt.trim()) {
    next.respondedAt = record.respondedAt;
  }
  if (
    typeof record.notificationChannel === 'string' &&
    record.notificationChannel.trim()
  ) {
    next.notificationChannel = record.notificationChannel;
  }
  return next;
}

function buildPendingConfirmation(workerId: string): ShiftWorkerConfirmation {
  return { workerId, status: 'pending' };
}

export function normalizeWorkOrderShifts(
  incomingShifts: unknown,
  previousShifts: unknown = [],
): Record<string, unknown>[] {
  const nextShifts = Array.isArray(incomingShifts) ? incomingShifts : [];
  const previousList = Array.isArray(previousShifts) ? previousShifts : [];

  const previousByShiftId = new Map<string, ShiftLike>();
  previousList.forEach((shift) => {
    const parsed = asObject(shift) as ShiftLike;
    if (typeof parsed.id === 'string' && parsed.id.trim()) {
      previousByShiftId.set(parsed.id, parsed);
    }
  });

  return nextShifts.map((shift) => {
    const shiftRecord = asObject(shift) as ShiftLike;
    const shiftId =
      typeof shiftRecord.id === 'string' ? shiftRecord.id.trim() : '';
    const previousShift = shiftId ? previousByShiftId.get(shiftId) : undefined;
    const previousRoles = Array.isArray(previousShift?.roles)
      ? (previousShift?.roles as ShiftRoleLike[])
      : [];
    const previousRoleById = new Map<string, ShiftRoleLike>();

    previousRoles.forEach((role) => {
      if (typeof role?.id === 'string' && role.id.trim()) {
        previousRoleById.set(role.id, role);
      }
    });

    const nextRoles = Array.isArray(shiftRecord.roles) ? shiftRecord.roles : [];
    const normalizedRoles = nextRoles.map((role) => {
      const roleRecord = asObject(role) as ShiftRoleLike;
      const roleId =
        typeof roleRecord.id === 'string' ? roleRecord.id.trim() : '';
      const assignedWorkers = asStringArray(roleRecord.assignedWorkers);
      const previousRole = roleId ? previousRoleById.get(roleId) : undefined;
      const existingConfirmations = Array.isArray(previousRole?.workerConfirmations)
        ? previousRole?.workerConfirmations
        : Array.isArray(roleRecord.workerConfirmations)
          ? roleRecord.workerConfirmations
          : [];

      const confirmationsByWorker = new Map<string, ShiftWorkerConfirmation>();
      existingConfirmations.forEach((entry) => {
        const parsed = sanitizeConfirmation(entry);
        if (parsed) confirmationsByWorker.set(parsed.workerId, parsed);
      });

      const isNewShift = !previousShift;
      const workerConfirmations = assignedWorkers.map((workerId) => {
        if (isNewShift) return buildPendingConfirmation(workerId);
        return confirmationsByWorker.get(workerId) || buildPendingConfirmation(workerId);
      });

      return {
        ...roleRecord,
        assignedWorkers,
        workerConfirmations,
      };
    });

    return {
      ...shiftRecord,
      roles: normalizedRoles,
    };
  });
}

export function updateShiftWorkerConfirmation(
  shifts: unknown,
  target: {
    shiftId: string;
    roleId: string;
    workerId: string;
  },
  updates: Partial<ShiftWorkerConfirmation>,
): Record<string, unknown>[] {
  const normalized = normalizeWorkOrderShifts(shifts);

  return normalized.map((shift) => {
    if (shift.id !== target.shiftId || !Array.isArray(shift.roles)) return shift;

    return {
      ...shift,
      roles: shift.roles.map((role) => {
        const roleRecord = asObject(role);
        if (roleRecord.id !== target.roleId) return roleRecord;

        const assignedWorkers = asStringArray(roleRecord.assignedWorkers);
        if (!assignedWorkers.includes(target.workerId)) return roleRecord;

        const workerConfirmations = Array.isArray(roleRecord.workerConfirmations)
          ? roleRecord.workerConfirmations
          : [];

        const nextConfirmations = workerConfirmations.map((entry) => {
          const parsed = sanitizeConfirmation(entry);
          if (!parsed || parsed.workerId !== target.workerId) return parsed || entry;
          return {
            ...parsed,
            ...updates,
            workerId: target.workerId,
          };
        });

        return {
          ...roleRecord,
          workerConfirmations: nextConfirmations,
        };
      }),
    };
  });
}
