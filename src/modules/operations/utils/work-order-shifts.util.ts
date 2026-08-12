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
  requiredCount?: unknown;
  startTime?: unknown;
  requiredCertificationIds?: unknown;
  requiredSkillIds?: unknown;
  assignedWorkers?: unknown;
  workerConfirmations?: unknown;
  [key: string]: unknown;
};

type ShiftLike = {
  id?: string;
  defaultRoleStartTime?: unknown;
  workOrderTypes?: unknown;
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

function asOptionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

function asPositiveInt(value: unknown, fallback = 1): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(1, Math.floor(value));
  }
  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed)) {
      return Math.max(1, parsed);
    }
  }
  return fallback;
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
      delete roleRecord.assignedEquipment;
      delete roleRecord.assignedMaterials;
      delete roleRecord.equipmentTypes;
      delete roleRecord.materialTypes;
      const roleId =
        typeof roleRecord.id === 'string' ? roleRecord.id.trim() : '';
      const requiredCount = asPositiveInt(roleRecord.requiredCount);
      const assignedWorkers = asStringArray(roleRecord.assignedWorkers).slice(
        0,
        requiredCount,
      );
      const requiredCertificationIds = asStringArray(
        roleRecord.requiredCertificationIds ?? roleRecord.requiredSkillIds,
      );
      const requiredSkillIds = asStringArray(roleRecord.requiredSkillIds);

      /**
       * Resolve the previous role so we can preserve workerConfirmations across
       * edits. Match by id first, then fall back to (roleName + assignedWorkers
       * intersection) when the frontend regenerates role ids. This protects
       * confirmation state from being silently reset by re-id'd roles.
       */
      const previousRole = roleId ? previousRoleById.get(roleId) : undefined;
      let resolvedPrevious = previousRole;
      if (!resolvedPrevious && typeof roleRecord.roleName === 'string') {
        const incomingName = roleRecord.roleName.trim().toLowerCase();
        const incomingWorkerSet = new Set(assignedWorkers);
        const fallback = previousRoles.find((pr) => {
          if (!pr || typeof pr !== 'object') return false;
          const name = (pr as { roleName?: unknown }).roleName;
          if (typeof name !== 'string' || name.trim().toLowerCase() !== incomingName) {
            return false;
          }
          const prevWorkers = asStringArray(
            (pr as { assignedWorkers?: unknown }).assignedWorkers,
          );
          const overlap = prevWorkers.some((wid) => incomingWorkerSet.has(wid));
          return overlap;
        });
        if (fallback) resolvedPrevious = fallback as ShiftRoleLike;
      }

      const existingConfirmations = Array.isArray(resolvedPrevious?.workerConfirmations)
        ? resolvedPrevious?.workerConfirmations
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
      void resolvedPrevious;

      return {
        ...roleRecord,
        requiredCount,
        startTime: asOptionalString(roleRecord.startTime),
        requiredCertificationIds,
        requiredSkillIds,
        assignedWorkers,
        workerConfirmations,
      };
    });

    return {
      ...shiftRecord,
      defaultRoleStartTime: asOptionalString(shiftRecord.defaultRoleStartTime),
      workOrderTypes: asStringArray(shiftRecord.workOrderTypes),
      roles: normalizedRoles,
    };
  });
}

/**
 * A date change makes every earlier worker response stale. Reset the full
 * confirmation request/response history so the normal status calculation
 * returns Ready to Notify until dispatch sends the updated shift again.
 */
export function invalidateConfirmationsForChangedShiftDates(
  shifts: unknown,
  previousShifts: unknown,
): Record<string, unknown>[] {
  const normalized = normalizeWorkOrderShifts(shifts, previousShifts);
  const previousById = new Map<string, Record<string, unknown>>();
  (Array.isArray(previousShifts) ? previousShifts : []).forEach((value) => {
    const shift = asObject(value);
    const id = typeof shift.id === 'string' ? shift.id.trim() : '';
    if (id) previousById.set(id, shift);
  });

  return normalized.map((shift) => {
    const shiftId = typeof shift.id === 'string' ? shift.id.trim() : '';
    const previous = shiftId ? previousById.get(shiftId) : undefined;
    if (!previous) return shift;

    const previousDate =
      typeof previous.date === 'string' ? previous.date.trim() : '';
    const nextDate = typeof shift.date === 'string' ? shift.date.trim() : '';
    const dateChanged = Boolean(
      previousDate && nextDate && previousDate !== nextDate,
    );
    if (!dateChanged) {
      return {
        ...shift,
        confirmationResetReason:
          shift.confirmationResetReason ?? previous.confirmationResetReason,
      };
    }

    const roles = Array.isArray(shift.roles)
      ? (shift.roles as Record<string, unknown>[])
      : [];
    const hasAssignedWorkers = roles.some(
      (role) => asStringArray(role.assignedWorkers).length > 0,
    );

    return {
      ...shift,
      ...(hasAssignedWorkers ? { status: 'ready_to_notify' } : {}),
      confirmationResetReason: 'date_changed',
      roles: roles.map((role) => ({
        ...role,
        workerConfirmations: asStringArray(role.assignedWorkers).map(
          buildPendingConfirmation,
        ),
      })),
    };
  });
}

/** Places newly-created shifts before existing shifts on the same date. */
export function placeNewShiftsFirstWithinDates(
  shifts: Record<string, unknown>[],
  previousShifts: unknown,
): Record<string, unknown>[] {
  const previousIds = new Set(
    (Array.isArray(previousShifts) ? previousShifts : [])
      .map((value) => asObject(value).id)
      .filter((id): id is string => typeof id === 'string' && Boolean(id)),
  );
  if (previousIds.size === 0) return shifts;

  const groups = new Map<
    string,
    { newlyCreated: Record<string, unknown>[]; existing: Record<string, unknown>[] }
  >();
  shifts.forEach((shift) => {
    const date = typeof shift.date === 'string' ? shift.date : '';
    const group = groups.get(date) ?? { newlyCreated: [], existing: [] };
    const id = typeof shift.id === 'string' ? shift.id : '';
    (id && previousIds.has(id) ? group.existing : group.newlyCreated).push(
      shift,
    );
    groups.set(date, group);
  });

  return [...groups.values()].flatMap((group) => [
    ...group.newlyCreated,
    ...group.existing,
  ]);
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
  const normalized = normalizeWorkOrderShifts(shifts, shifts);

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

export function preserveOtherWorkerConfirmations(
  shifts: unknown,
  snapshot: Map<string, Map<string, Map<string, ShiftWorkerConfirmation>>>,
  target: { shiftId: string; roleId: string; workerId: string },
): Record<string, unknown>[] {
  const list = Array.isArray(shifts) ? (shifts as Record<string, unknown>[]) : [];
  return list.map((shift) => {
    const shiftId = typeof shift.id === 'string' ? shift.id : '';
    if (shiftId !== target.shiftId || !Array.isArray(shift.roles)) return shift;
    return {
      ...shift,
      roles: (shift.roles as Record<string, unknown>[]).map((role) => {
        const roleRecord = asObject(role);
        const roleId = typeof roleRecord.id === 'string' ? roleRecord.id : '';
        if (roleId !== target.roleId) return roleRecord;
        const roleSnapshot = snapshot.get(target.shiftId)?.get(roleId);
        if (!roleSnapshot || roleSnapshot.size === 0) return roleRecord;

        const currentConfirmations = Array.isArray(roleRecord.workerConfirmations)
          ? (roleRecord.workerConfirmations as Record<string, unknown>[])
          : [];
        const currentByWorker = new Map<string, Record<string, unknown>>();
        for (const entry of currentConfirmations) {
          const wid = (entry as { workerId?: unknown })?.workerId;
          if (typeof wid === 'string') currentByWorker.set(wid, entry);
        }
        const merged: Record<string, unknown>[] = [];
        for (const [wid, snap] of roleSnapshot) {
          if (wid === target.workerId) continue;
          const current = currentByWorker.get(wid);
          if (current) {
            merged.push({ ...snap, ...current });
          } else {
            merged.push({ ...snap });
          }
        }
        for (const [wid, current] of currentByWorker) {
          if (wid === target.workerId) continue;
          if (!roleSnapshot.has(wid)) merged.push(current);
        }
        const targetEntry = currentByWorker.get(target.workerId);
        if (targetEntry) merged.push(targetEntry);

        return {
          ...roleRecord,
          workerConfirmations: merged,
        };
      }),
    };
  });
}

/**
 * Snapshot every confirmation for every role in the given shifts, keyed by
 * (shiftId, roleId, workerId). Use this BEFORE a mutation if you intend to call
 * {@link preserveOtherWorkerConfirmations} afterwards.
 */
export function snapshotWorkerConfirmations(
  shifts: unknown,
): Map<string, Map<string, Map<string, ShiftWorkerConfirmation>>> {
  const result = new Map<string, Map<string, Map<string, ShiftWorkerConfirmation>>>();
  const list = Array.isArray(shifts) ? (shifts as Record<string, unknown>[]) : [];
  for (const shift of list) {
    const shiftId = typeof shift.id === 'string' ? shift.id : '';
    if (!shiftId || !Array.isArray(shift.roles)) continue;
    const roleMap = new Map<string, Map<string, ShiftWorkerConfirmation>>();
    for (const role of shift.roles as Record<string, unknown>[]) {
      const roleId = typeof role.id === 'string' ? role.id : '';
      if (!roleId) continue;
      const confirmations = Array.isArray(role.workerConfirmations)
        ? (role.workerConfirmations as unknown[])
        : [];
      const workerMap = new Map<string, ShiftWorkerConfirmation>();
      for (const entry of confirmations) {
        const parsed = sanitizeConfirmation(entry);
        if (parsed) workerMap.set(parsed.workerId, parsed);
      }
      roleMap.set(roleId, workerMap);
    }
    result.set(shiftId, roleMap);
  }
  return result;
}
