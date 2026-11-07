export interface ReportTimesheet {
  id: string;
  workerId: string;
  projectId: string;
  workOrderId: string;
  shiftId: string;
  date: string;
  clockIn: string;
  status: string;
  regularHours: number | string;
  overtimeHours: number | string;
  doubleTimeHours: number | string;
}
export interface ReportWorker {
  id: string;
  firstName: string;
  lastName: string;
  status: string;
  type: string;
  hourlyRate: number | string;
}
export interface ReportProject {
  id: string;
  number: string;
  name: string;
  status: string;
  city?: string;
}
export interface ReportShift {
  id: string;
  date: string;
  shiftName?: string;
  startTime?: string;
  defaultRoleStartTime?: string | null;
}
export interface ReportWorkOrder {
  id: string;
  projectId: string;
  startDate?: string;
  endDate?: string;
  shifts: ReportShift[];
}
export interface OperationsReportInput {
  timesheets: ReportTimesheet[];
  workers: ReportWorker[];
  projects: ReportProject[];
  workOrders: ReportWorkOrder[];
  dateRange: { start: string; end: string };
  settings: {
    overtimeRules: {
      overtimeMultiplier: number;
      doubleTimeMultiplier: number;
      nightShiftPremium?: number;
      overtimeNightPremium?: number;
      doubleTimeNightPremium?: number;
    };
  };
}
// Preserve Reports' existing JavaScript addition for decimal strings from the worker API.
// This intentionally does not replace Reports with the different PM-approved payroll calculation.
function addReportPremium(
  rate: number | string,
  premium: number,
): number | string {
  return typeof rate === 'string' ? rate + premium : rate + premium;
}
function numericHours(value: unknown) {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function clockMinutes(value?: string) {
  const match =
    value?.trim().match(/^(\d{1,2}):(\d{2})\s*([AP])\.?M\.?$/i) ??
    value?.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  let hours = Number(match[1]);
  if (match[3]?.toUpperCase() === 'A' && hours === 12) hours = 0;
  if (match[3]?.toUpperCase() === 'P' && hours !== 12) hours += 12;
  return hours * 60 + Number(match[2]);
}

function dateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function dateKey(value?: string) {
  if (!value) return '';
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? '' : dateInputValue(parsed);
}

function isDateInRange(
  value: string | undefined,
  range: { start: string; end: string },
) {
  const key = dateKey(value);
  if (!key) return false;
  return key >= range.start && key <= range.end;
}

function workOrderOverlapsRange(
  workOrder: {
    startDate?: string;
    endDate?: string;
    shifts?: Array<{ date?: string }>;
  },
  range: { start: string; end: string },
) {
  const start = dateKey(workOrder.startDate);
  const end = dateKey(workOrder.endDate || workOrder.startDate);
  if (start && end && start <= range.end && end >= range.start) return true;
  return (workOrder.shifts || []).some((shift) =>
    isDateInRange(shift.date, range),
  );
}

export function calculateOperationsReport(input: OperationsReportInput) {
  const { timesheets, workers, projects, workOrders, dateRange, settings } =
    input;
  const byWorker = new Map(workers.map((worker) => [worker.id, worker]));
  const shiftsByOrder = new Map(
    workOrders.map((order) => [
      order.id,
      new Map(order.shifts.map((shift) => [shift.id, shift])),
    ]),
  );
  const getWorkerById = (id: string) => byWorker.get(id);
  const overtimeMultiplier = settings.overtimeRules.overtimeMultiplier || 1;
  const doubleTimeMultiplier = settings.overtimeRules.doubleTimeMultiplier || 1;
  const timesheetPay = (
    timesheet: (typeof timesheets)[number],
    hourlyRate: number | string,
  ) => {
    const shift = shiftsByOrder
      .get(timesheet.workOrderId)
      ?.get(timesheet.shiftId);
    const start = clockMinutes(
      shift?.defaultRoleStartTime || shift?.startTime || timesheet.clockIn,
    );
    const isNight =
      Boolean(shift?.shiftName?.toLowerCase().includes('night')) ||
      (start !== null && (start >= 17 * 60 || start < 5 * 60));
    const regularRate = addReportPremium(
      hourlyRate,
      isNight ? (settings.overtimeRules.nightShiftPremium ?? 3) : 0,
    );
    const overtimeRate =
      Number(hourlyRate) * overtimeMultiplier +
      (isNight ? (settings.overtimeRules.overtimeNightPremium ?? 4.5) : 0);
    const doubleTimeRate =
      Number(hourlyRate) * doubleTimeMultiplier +
      (isNight ? (settings.overtimeRules.doubleTimeNightPremium ?? 6) : 0);
    return (
      numericHours(timesheet.regularHours) * Number(regularRate) +
      numericHours(timesheet.overtimeHours) * overtimeRate +
      numericHours(timesheet.doubleTimeHours) * doubleTimeRate
    );
  };
  const filteredTimesheets = timesheets.filter((timesheet) =>
    isDateInRange(timesheet.date, dateRange),
  );
  const filteredWorkOrders = workOrders.filter((workOrder) =>
    workOrderOverlapsRange(workOrder, dateRange),
  );
  const workerTimesheets = new Map<string, ReportTimesheet[]>(),
    projectTimesheets = new Map<string, ReportTimesheet[]>(),
    projectOrders = new Map<string, ReportWorkOrder[]>();
  for (const row of filteredTimesheets) {
    if (!workerTimesheets.has(row.workerId))
      workerTimesheets.set(row.workerId, []);
    workerTimesheets.get(row.workerId)!.push(row);
    if (!projectTimesheets.has(row.projectId))
      projectTimesheets.set(row.projectId, []);
    projectTimesheets.get(row.projectId)!.push(row);
  }
  for (const order of filteredWorkOrders) {
    if (!projectOrders.has(order.projectId))
      projectOrders.set(order.projectId, []);
    projectOrders.get(order.projectId)!.push(order);
  }
  const activeWorkerIdsInRange = new Set(
    filteredTimesheets.map((timesheet) => timesheet.workerId),
  );

  const activeWorkers = workers.filter(
    (w) => w.status === 'active' && activeWorkerIdsInRange.has(w.id),
  ).length;
  const totalHours = filteredTimesheets.reduce(
    (acc, t) =>
      acc +
      numericHours(t.regularHours) +
      numericHours(t.overtimeHours) +
      numericHours(t.doubleTimeHours),
    0,
  );
  const totalOT = filteredTimesheets.reduce(
    (acc, t) => acc + numericHours(t.overtimeHours),
    0,
  );
  const activeJobs = filteredWorkOrders.length;

  const workerHours = workers
    .filter((w) => w.status === 'active')
    .map((w) => {
      const wTimesheets = workerTimesheets.get(w.id) || [];
      const regular = wTimesheets.reduce(
        (a, t) => a + numericHours(t.regularHours),
        0,
      );
      const ot = wTimesheets.reduce(
        (a, t) => a + numericHours(t.overtimeHours),
        0,
      );
      const dt = wTimesheets.reduce(
        (a, t) => a + numericHours(t.doubleTimeHours),
        0,
      );
      const total = regular + ot + dt;
      const pay = wTimesheets.reduce(
        (sum, timesheet) => sum + timesheetPay(timesheet, w.hourlyRate),
        0,
      );
      return { worker: w, regular, ot, total, pay };
    })
    .filter((wh) => wh.total > 0)
    .sort((a, b) => b.total - a.total);
  const maxWorkerHours = workerHours.reduce(
    (maximum, row) => Math.max(maximum, row.total),
    1,
  );

  const projectSummary = projects
    .map((p) => {
      const pWorkOrders = projectOrders.get(p.id) || [];
      const pTimesheets = projectTimesheets.get(p.id) || [];
      const hours = pTimesheets.reduce(
        (a, t) =>
          a +
          numericHours(t.regularHours) +
          numericHours(t.overtimeHours) +
          numericHours(t.doubleTimeHours),
        0,
      );
      const cost = pTimesheets.reduce((a, t) => {
        const w = getWorkerById(t.workerId);
        return a + (w ? timesheetPay(t, w.hourlyRate) : 0);
      }, 0);
      return { project: p, orders: pWorkOrders.length, hours, cost };
    })
    .filter((ps) => ps.hours > 0);

  return {
    activeWorkers,
    totalHours,
    totalOT,
    activeJobs,
    workerHours,
    projectSummary,
    maxWorkerHours,
    timesheetCount: filteredTimesheets.length,
    timesheetStatusCounts: Object.fromEntries(
      ['pending', 'approved', 'rejected'].map((status) => [
        status,
        filteredTimesheets.filter((row) => row.status === status).length,
      ]),
    ),
    workerTotals: workerHours.reduce(
      (sum, row) => ({
        regular: sum.regular + row.regular,
        ot: sum.ot + row.ot,
        total: sum.total + row.total,
        pay: sum.pay + row.pay,
      }),
      { regular: 0, ot: 0, total: 0, pay: 0 },
    ),
  };
}
