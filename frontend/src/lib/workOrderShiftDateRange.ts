import type { Project, WorkOrder } from '@/lib/types';

export function workOrderHasAssignmentDateRange(
  wo: Pick<WorkOrder, 'startDate' | 'endDate'>,
): boolean {
  const s = (wo.startDate ?? '').toString().trim();
  const e = (wo.endDate ?? '').toString().trim();
  return Boolean(s && e);
}

export function isShiftDateWithinAssignmentRange(
  shiftDate: string,
  wo: Pick<WorkOrder, 'startDate' | 'endDate'>,
): boolean {
  if (!workOrderHasAssignmentDateRange(wo)) return true;
  const start = (wo.startDate ?? '').toString().trim();
  const end = (wo.endDate ?? '').toString().trim();
  return shiftDate >= start && shiftDate <= end;
}

export function assignmentDateRangeLabel(
  wo: Pick<WorkOrder | Project, 'startDate' | 'endDate'>,
): string {
  return `${(wo.startDate ?? '').toString().trim()} – ${(wo.endDate ?? '').toString().trim()}`;
}

export function formatAssignmentDateRangeShort(
  wo: Pick<WorkOrder, 'startDate' | 'endDate'>,
  locale = 'en-US',
): string {
  const s = (wo.startDate ?? '').toString().trim();
  const e = (wo.endDate ?? '').toString().trim();
  if (!s && !e) return '—';
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
  const fmt = (ymd: string) =>
    new Date(`${ymd}T12:00:00`).toLocaleDateString(locale, opts);
  if (!s) return fmt(e);
  if (!e) return fmt(s);
  if (s === e) return fmt(s);
  return `${fmt(s)} – ${fmt(e)}`;
}

export function projectHasScheduleBounds(
  project: Pick<Project, 'startDate' | 'endDate'>,
): boolean {
  return workOrderHasAssignmentDateRange(project);
}

export function isAssignmentRangeWithinProject(
  wo: Pick<WorkOrder, 'startDate' | 'endDate'>,
  project: Pick<Project, 'startDate' | 'endDate'>,
): boolean {
  if (
    !projectHasScheduleBounds(project) ||
    !workOrderHasAssignmentDateRange(wo)
  )
    return false;
  const ws = (wo.startDate ?? '').toString().trim();
  const we = (wo.endDate ?? '').toString().trim();
  const ps = (project.startDate ?? '').toString().trim();
  const pe = (project.endDate ?? '').toString().trim();
  return ws >= ps && we <= pe;
}

export function assignmentDateRangeFromShifts(
  shifts: Array<{ date?: string }>,
): { startDate: string; endDate: string } | null {
  const dates = shifts
    .map((s) => (s.date ?? '').toString().trim())
    .filter(Boolean)
    .sort();
  if (dates.length === 0) return null;
  const first = dates[0];
  const last = dates[dates.length - 1];
  if (!first || !last) return null;
  return { startDate: first, endDate: last };
}
