import { BadRequestException } from '@nestjs/common';

function trimDate(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value.trim();
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().split('T')[0];
  }
  return String(value).trim();
}

/** When both start and end are set, every shift with a `date` must fall within the range (YYYY-MM-DD inclusive). */
export function assertShiftsWithinAssignmentDateRange(
  startDate: unknown,
  endDate: unknown,
  shifts: Record<string, unknown>[],
): void {
  const start = trimDate(startDate);
  const end = trimDate(endDate);
  if (!start || !end) return;

  for (let i = 0; i < shifts.length; i++) {
    const row = shifts[i];
    const raw = row?.date;
    const d = trimDate(raw);
    if (!d) continue;
    if (d < start || d > end) {
      throw new BadRequestException(
        `Shift date "${d}" is outside the assignment range ${start} – ${end}.`,
      );
    }
  }
}

/**
 * When both project start and end are set, assignment start/end must be set and lie within
 * [projectStart, projectEnd] inclusive (YYYY-MM-DD). If either project bound is missing, no-op.
 */
export function assertAssignmentWithinProjectDates(
  projectStart: unknown,
  projectEnd: unknown,
  woStart: unknown,
  woEnd: unknown,
): void {
  const ps = trimDate(projectStart);
  const pe = trimDate(projectEnd);
  const ws = trimDate(woStart);
  const we = trimDate(woEnd);
  if (!ps || !pe) return;

  if (!ws || !we) {
    throw new BadRequestException(
      `Assignment must have start and end dates within the project schedule (${ps} – ${pe}).`,
    );
  }
  if (ws > we) {
    throw new BadRequestException('Assignment end date cannot be earlier than start date.');
  }
  if (ws < ps || we > pe) {
    throw new BadRequestException(
      `Assignment dates (${ws} – ${we}) must fall within project dates (${ps} – ${pe}).`,
    );
  }
}
