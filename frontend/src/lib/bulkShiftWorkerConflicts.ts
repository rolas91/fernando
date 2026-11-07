type ScheduledShift = {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  cancelled?: boolean;
  status?: string;
  roles: { startTime?: string; assignedWorkers: string[] }[];
};

type WorkerInterval = {
  workerId: string;
  shiftId: string;
  date: string;
  startTime: string;
  start: number;
  end: number;
};

function clockMinutes(value: string) {
  const match = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(value);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  return hours < 24 && minutes < 60 ? hours * 60 + minutes : null;
}

function workerIntervals(shift: ScheduledShift): WorkerInterval[] {
  if (shift.cancelled || shift.status === 'shift_cancelled') return [];
  const start = clockMinutes(shift.startTime);
  const end = clockMinutes(shift.endTime);
  const day = Date.parse(`${shift.date}T00:00:00Z`) / 60_000;
  if (start === null || end === null || !Number.isFinite(day)) return [];
  const duration = end > start ? end - start : end - start + 1440;
  return shift.roles.flatMap((role) => {
    const roleStart = clockMinutes(role.startTime || shift.startTime);
    if (roleStart === null) return [];

    const offset = end <= start && roleStart < start ? 1440 : 0;
    return [...new Set(role.assignedWorkers)].map((workerId) => ({
      workerId,
      shiftId: shift.id,
      date: shift.date,
      startTime: role.startTime || shift.startTime,
      start: day + offset + roleStart,
      end: day + offset + roleStart + duration,
    }));
  });
}

export function findBulkShiftWorkerConflicts(
  candidates: ScheduledShift[],
  existing: ScheduledShift[],
) {
  const previous = existing.flatMap(workerIntervals);
  const conflicts: {
    workerId: string;
    date: string;
    startTime: string;
    endTime: string;
    otherDate: string;
    otherStartTime: string;
    otherEndTime: string;
  }[] = [];
  const seen = new Set<string>();
  for (const candidate of candidates) {
    const intervals = workerIntervals(candidate);
    for (const next of intervals) {
      for (const other of previous) {
        if (next.workerId !== other.workerId || next.shiftId === other.shiftId)
          continue;
        if (next.start >= other.end || next.end <= other.start) continue;
        const key = `${next.workerId}:${next.shiftId}:${other.shiftId}`;
        if (seen.has(key)) continue;
        seen.add(key);
        conflicts.push({
          workerId: next.workerId,
          date: next.date,
          startTime: next.startTime,
          endTime: new Date(next.end * 60_000).toISOString().slice(11, 16),
          otherDate: other.date,
          otherStartTime: other.startTime,
          otherEndTime: new Date(other.end * 60_000)
            .toISOString()
            .slice(11, 16),
        });
      }
    }
    previous.push(...intervals);
  }
  return conflicts;
}
