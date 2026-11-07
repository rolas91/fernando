export interface PayrollTimesheet {
  id: string;
  workerId: string;
  projectId: string;
  workOrderId: string;
  shiftId: string;
  variant: string;
  date: string;
  clockIn: string;
  clockOut: string;
  regularHours: string | number;
  overtimeHours: string | number;
  doubleTimeHours: string | number;
  lunchTaken: boolean;
}
export interface Shift {
  id: string;
  date: string;
  shiftName: string;
  shiftTemplateId?: string | null;
  startTime?: string | null;
  defaultRoleStartTime?: string | null;
  pmApprovedAt?: string | Date | null;
  status?: string | null;
  roles: Array<{ startTime?: string | null; assignedWorkers: string[] }>;
}
export interface ShiftTemplate {
  id: string;
  name: string;
  startTime?: string | null;
}
export interface PayrollInput {
  timesheets: PayrollTimesheet[];
  workers: Array<{
    id: string;
    firstName: string;
    lastName: string;
    hourlyRate?: string | number;
  }>;
  projects: Array<{ id: string; name: string; number?: string }>;
  workOrders: Array<{ id: string; orderNumber?: string; shifts: Shift[] }>;
  shiftCatalog: ShiftTemplate[];
  settings: {
    overtimeRules: {
      overtimeMultiplier: unknown;
      doubleTimeMultiplier: unknown;
      nightShiftPremium?: unknown;
      overtimeNightPremium?: unknown;
      doubleTimeNightPremium?: unknown;
    };
  };
  allBounds?: { allStart: string; allEnd: string };
  today: string;
  rangeMode: string;
  customStartDate: string;
  customEndDate: string;
  projectFilter: string;
  workerFilter: string;
  page: number;
}

const clockMinutes = (value?: string | null) => {
  const match =
    value?.trim().match(/^(\d{1,2}):(\d{2})\s*([AP])\.?M\.?$/i) ??
    value?.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  let hours = Number(match[1]);
  const minutes = Number(match[2]);
  const period = match[3]?.toUpperCase();
  if (period === 'A' && hours === 12) hours = 0;
  if (period === 'P' && hours !== 12) hours += 12;
  return hours * 60 + minutes;
};

const formatClock = (value?: string | null) => {
  const minutes = clockMinutes(value);
  if (minutes === null) return '-';
  const hours = Math.floor(minutes / 60);
  return `${hours % 12 || 12}:${String(minutes % 60).padStart(2, '0')} ${hours >= 12 ? 'PM' : 'AM'}`;
};

const resolveShiftType = (shift: Shift, catalog: ShiftTemplate[]) => {
  const linked = catalog.find((item) => item.id === shift.shiftTemplateId);
  if (linked) return linked;

  const named = catalog.find(
    (item) =>
      item.name.trim().toLowerCase() === shift.shiftName?.trim().toLowerCase(),
  );
  if (named) return named;

  const date = new Date(`${shift.date}T12:00:00`);
  const weekday = Number.isNaN(date.getTime()) ? -1 : date.getDay();
  const dayQualifier =
    weekday === 6 ? 'saturday' : weekday === 0 ? 'sunday' : '';
  const start = clockMinutes(shift.defaultRoleStartTime || shift.startTime);
  const periodQualifier =
    start !== null && (start >= 17 * 60 || start < 5 * 60) ? 'night' : 'day';
  const sameStart = catalog.filter(
    (item) => clockMinutes(item.startTime) === start,
  );
  const qualified = dayQualifier
    ? sameStart.find((item) => item.name.toLowerCase().includes(dayQualifier))
    : sameStart.find((item) => !/saturday|sunday/i.test(item.name));
  const semantic = catalog.find((item) => {
    const name = item.name.toLowerCase();
    const correctDay = dayQualifier
      ? name.includes(dayQualifier)
      : !/saturday|sunday/i.test(name);
    return correctDay && name.includes(periodQualifier);
  });
  return qualified ?? semantic ?? sameStart[0] ?? null;
};

export function calculatePayroll(input: PayrollInput) {
  const {
    timesheets,
    workers,
    projects,
    workOrders,
    shiftCatalog,
    settings,
    rangeMode,
    customStartDate,
    customEndDate,
    projectFilter,
    workerFilter,
    page,
  } = input;
  const shiftsByOrder = new Map(
    workOrders.map((order) => [
      order.id,
      new Map(order.shifts.map((shift) => [shift.id, shift])),
    ]),
  );
  const rowsPerPage = 7;

  const workersById = new Map(workers.map((row) => [row.id, row]));
  const projectsById = new Map(projects.map((row) => [row.id, row]));
  const getWorkerById = (id: string) => workersById.get(id);
  const getProjectById = (id: string) => projectsById.get(id);
  const allPayrollTimesheets = (() =>
    timesheets.filter((timesheet) => {
      if (timesheet.variant !== 'internal') return false;
      const shift = shiftsByOrder
        .get(timesheet.workOrderId)
        ?.get(timesheet.shiftId);
      return Boolean(shift?.pmApprovedAt || shift?.status === 'pm_approved');
    }))();

  const parseTimesheetDate = (value?: string) => {
    if (!value) return null;
    const isoMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (isoMatch) {
      const [, year, month, day] = isoMatch;
      return new Date(Number(year), Number(month) - 1, Number(day), 12);
    }
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  };

  const toInputDate = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const dateBounds = (() => {
    const dates = allPayrollTimesheets
      .map((timesheet) => parseTimesheetDate(timesheet.date))
      .filter((date): date is Date => Boolean(date))
      .sort((a, b) => a.getTime() - b.getTime());

    const today = new Date(input.today + 'T12:00:00');
    const todayAtNoon = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate(),
      12,
    );

    const startOfWeek = new Date(todayAtNoon);
    startOfWeek.setDate(todayAtNoon.getDate() - todayAtNoon.getDay());
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);

    const startOfLastWeek = new Date(startOfWeek);
    startOfLastWeek.setDate(startOfWeek.getDate() - 7);
    const endOfLastWeek = new Date(startOfWeek);
    endOfLastWeek.setDate(startOfWeek.getDate() - 1);

    return {
      allStart: dates[0] ? toInputDate(dates[0]) : '',
      allEnd: dates[dates.length - 1]
        ? toInputDate(dates[dates.length - 1])
        : '',
      weekStart: toInputDate(startOfWeek),
      weekEnd: toInputDate(endOfWeek),
      lastWeekStart: toInputDate(startOfLastWeek),
      lastWeekEnd: toInputDate(endOfLastWeek),
    };
  })();

  if (input.allBounds) Object.assign(dateBounds, input.allBounds);

  const selectedRange = (() => {
    if (rangeMode === 'week')
      return { start: dateBounds.weekStart, end: dateBounds.weekEnd };
    if (rangeMode === 'last_week')
      return { start: dateBounds.lastWeekStart, end: dateBounds.lastWeekEnd };
    if (rangeMode === 'custom')
      return { start: customStartDate, end: customEndDate };
    return { start: dateBounds.allStart, end: dateBounds.allEnd };
  })();

  const payrollTimesheets = (() => {
    const start = parseTimesheetDate(selectedRange.start)?.getTime();
    const end = parseTimesheetDate(selectedRange.end)?.getTime();
    return allPayrollTimesheets.filter((timesheet) => {
      const date = parseTimesheetDate(timesheet.date)?.getTime();
      if (!date) return false;
      if (start && date < start) return false;
      if (end && date > end) return false;
      return true;
    });
  })();

  const filteredPayrollTimesheets = (() =>
    payrollTimesheets.filter((timesheet) => {
      if (projectFilter && timesheet.projectId !== projectFilter) return false;
      if (workerFilter && timesheet.workerId !== workerFilter) return false;
      return true;
    }))();

  const toNumber = (value: unknown) => {
    if (typeof value === 'string') {
      const cleaned = value.replace(/,/g, '').trim();
      const numeric = Number(cleaned);
      return Number.isFinite(numeric) ? numeric : 0;
    }
    const numeric = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(numeric) ? numeric : 0;
  };

  const getTimesheetHours = (timesheet: (typeof timesheets)[0]) => {
    const raw = timesheet as (typeof timesheets)[0] & {
      regular_hours?: unknown;
      overtime_hours?: unknown;
      double_time_hours?: unknown;
    };
    const regularHours = toNumber(raw.regularHours ?? raw.regular_hours);
    const overtimeHours = toNumber(raw.overtimeHours ?? raw.overtime_hours);
    const doubleTimeHours = toNumber(
      raw.doubleTimeHours ?? raw.double_time_hours,
    );
    return {
      regularHours,
      overtimeHours,
      doubleTimeHours,
      totalHours: regularHours + overtimeHours + doubleTimeHours,
    };
  };

  const calculatePay = (timesheet: (typeof timesheets)[0]) => {
    const worker = getWorkerById(timesheet.workerId);
    const rate = toNumber(worker?.hourlyRate);
    const hours = getTimesheetHours(timesheet);
    const shift = shiftsByOrder
      .get(timesheet.workOrderId)
      ?.get(timesheet.shiftId);
    const shiftType = shift ? resolveShiftType(shift, shiftCatalog) : null;
    const start = clockMinutes(
      shiftType?.startTime ||
        shift?.defaultRoleStartTime ||
        shift?.startTime ||
        timesheet.clockIn,
    );
    const isNight =
      Boolean(shiftType?.name.toLowerCase().includes('night')) ||
      (start !== null && (start >= 17 * 60 || start < 5 * 60));
    const regularPremium = isNight
      ? toNumber(settings.overtimeRules.nightShiftPremium ?? 3)
      : 0;
    const overtimePremium = isNight
      ? toNumber(settings.overtimeRules.overtimeNightPremium ?? 4.5)
      : 0;
    const doubleTimePremium = isNight
      ? toNumber(settings.overtimeRules.doubleTimeNightPremium ?? 6)
      : 0;
    const regular = hours.regularHours * (rate + regularPremium);
    const overtime =
      hours.overtimeHours *
      (rate * toNumber(settings.overtimeRules.overtimeMultiplier) +
        overtimePremium);
    const doubleTime =
      hours.doubleTimeHours *
      (rate * toNumber(settings.overtimeRules.doubleTimeMultiplier) +
        doubleTimePremium);
    return {
      regular,
      overtime,
      doubleTime,
      total: regular + overtime + doubleTime,
    };
  };

  const timesheetDisplayKey = (timesheet: (typeof timesheets)[0]) =>
    [
      timesheet.workerId,
      timesheet.workOrderId || timesheet.id,
      timesheet.date || '',
    ].join('|');

  const workerSummaries = (() => {
    const summaries = new Map<
      string,
      {
        workerId: string;
        workerName: string;
        initials: string;
        projectIds: Set<string>;
        timesheets: number;
        assignments: number;
        regularHours: number;
        overtimeHours: number;
        doubleTimeHours: number;
        totalHours: number;
        grossPay: number;
        hourlyRate: number;
        projectBreakdown: Map<
          string,
          {
            projectId: string;
            projectName: string;
            hours: number;
            grossPay: number;
          }
        >;
        recentTimesheets: typeof timesheets;
        timesheetKeys: Set<string>;
      }
    >();

    filteredPayrollTimesheets.forEach((timesheet) => {
      const worker = getWorkerById(timesheet.workerId);
      const project = getProjectById(timesheet.projectId);
      const workerName = worker
        ? `${worker.firstName} ${worker.lastName}`
        : 'Unknown Worker';
      const initials = worker
        ? `${worker.firstName[0] || ''}${worker.lastName[0] || ''}`
        : '??';
      const pay = calculatePay(timesheet);
      const {
        regularHours,
        overtimeHours,
        doubleTimeHours,
        totalHours: rowHours,
      } = getTimesheetHours(timesheet);
      const current: NonNullable<ReturnType<typeof summaries.get>> =
        summaries.get(timesheet.workerId) || {
          workerId: timesheet.workerId,
          workerName,
          initials,
          projectIds: new Set<string>(),
          timesheets: 0,
          assignments: 0,
          regularHours: 0,
          overtimeHours: 0,
          doubleTimeHours: 0,
          totalHours: 0,
          grossPay: 0,
          hourlyRate: toNumber(worker?.hourlyRate),
          projectBreakdown: new Map(),
          recentTimesheets: [],
          timesheetKeys: new Set<string>(),
        };

      const displayKey = timesheetDisplayKey(timesheet);
      current.projectIds.add(timesheet.projectId);
      const newDisplayKey = !current.timesheetKeys.has(displayKey);
      current.timesheetKeys.add(displayKey);
      current.regularHours += regularHours;
      current.overtimeHours += overtimeHours;
      current.doubleTimeHours += doubleTimeHours;
      current.totalHours += rowHours;
      current.grossPay += pay.total;
      if (newDisplayKey) {
        current.recentTimesheets.push(timesheet);
      }

      const projectKey = timesheet.projectId || 'unknown';
      const breakdown = current.projectBreakdown.get(projectKey) || {
        projectId: projectKey,
        projectName: project?.name || 'Unassigned Project',
        hours: 0,
        grossPay: 0,
      };
      breakdown.hours += rowHours;
      breakdown.grossPay += pay.total;
      current.projectBreakdown.set(projectKey, breakdown);

      summaries.set(timesheet.workerId, current);
    });

    summaries.forEach((summary) => {
      summary.timesheets = summary.timesheetKeys.size;
      const assignmentIds = new Set(
        summary.recentTimesheets
          .map((timesheet) => timesheet.workOrderId)
          .filter(Boolean),
      );
      summary.assignments = assignmentIds.size || summary.projectIds.size;
    });

    return Array.from(summaries.values()).sort((a, b) =>
      a.workerName.localeCompare(b.workerName),
    );
  })();

  const availableProjects = (() => {
    const projectIds = new Set<string>();
    payrollTimesheets.forEach((timesheet) =>
      projectIds.add(timesheet.projectId),
    );
    return projects.filter((project) => projectIds.has(project.id));
  })();

  const availableWorkers = (() => {
    const workerIds = new Set(
      payrollTimesheets.map((timesheet) => timesheet.workerId),
    );
    return workers.filter((worker) => workerIds.has(worker.id));
  })();

  const filteredSummaries = workerSummaries;

  const detailedRows = (() =>
    filteredPayrollTimesheets
      .map((timesheet) => {
        const worker = getWorkerById(timesheet.workerId);
        const project = getProjectById(timesheet.projectId);
        const shift = shiftsByOrder
          .get(timesheet.workOrderId)
          ?.get(timesheet.shiftId);
        const template = shift ? resolveShiftType(shift, shiftCatalog) : null;
        const workerRole = shift?.roles.find((role) =>
          role.assignedWorkers.includes(timesheet.workerId),
        );
        const shiftStartTime =
          workerRole?.startTime ||
          shift?.defaultRoleStartTime ||
          shift?.startTime;
        const inferredShiftType =
          (clockMinutes(shiftStartTime) ?? 0) >= 17 * 60 ||
          (clockMinutes(shiftStartTime) ?? 0) < 5 * 60
            ? 'Night Shift'
            : 'Day Shift';
        const hours = getTimesheetHours(timesheet);
        const pay = calculatePay(timesheet);
        return {
          id: timesheet.id,
          workerId: timesheet.workerId,
          workerName: worker
            ? `${worker.firstName} ${worker.lastName}`
            : 'Unknown Worker',
          initials: worker
            ? `${worker.firstName[0] || ''}${worker.lastName[0] || ''}`
            : '??',
          date: timesheet.date,
          lunchAndBreakTaken: timesheet.lunchTaken === true ? 'Yes' : 'No',
          projectLabel:
            [project?.number, project?.name].filter(Boolean).join(' - ') ||
            'Unassigned Project',
          shiftType: template?.name || inferredShiftType,
          shiftTime: `${formatClock(timesheet.clockIn)} - ${formatClock(timesheet.clockOut)}`,
          ...hours,
          grossPay: pay.total,
        };
      })
      .sort(
        (a, b) =>
          b.date.localeCompare(a.date) ||
          a.workerName.localeCompare(b.workerName),
      ))();
  const totalPages = Math.max(1, Math.ceil(detailedRows.length / rowsPerPage));
  const pageRows = detailedRows.slice(
    (page - 1) * rowsPerPage,
    page * rowsPerPage,
  );
  const totals = filteredSummaries.reduce(
    (acc, summary) => {
      acc.workers += 1;
      acc.timesheets += summary.timesheets;
      acc.hours += toNumber(summary.totalHours);
      acc.regularHours += toNumber(summary.regularHours);
      acc.overtimeHours += toNumber(summary.overtimeHours);
      acc.doubleTimeHours += toNumber(summary.doubleTimeHours);
      acc.grossPay += toNumber(summary.grossPay);
      return acc;
    },
    {
      workers: 0,
      timesheets: 0,
      hours: 0,
      regularHours: 0,
      overtimeHours: 0,
      doubleTimeHours: 0,
      grossPay: 0,
    },
  );

  const averageHourlyRate =
    totals.hours > 0 ? totals.grossPay / totals.hours : 0;

  return {
    detailedRows,
    pageRows,
    totalPages,
    totalRecords: detailedRows.length,
    workerSummaries: workerSummaries.map(
      ({
        projectIds,
        projectBreakdown,
        timesheetKeys,
        recentTimesheets,
        ...summary
      }) => ({
        ...summary,
        timesheets: timesheetKeys.size,
        projectIds: [...projectIds],
        projectBreakdown: [...projectBreakdown.values()],
        recentTimesheets: recentTimesheets
          .slice(0, 3)
          .map(({ id, projectId, workOrderId, date }) => ({
            id,
            projectId,
            workOrderId,
            date,
          })),
      }),
    ),
    availableProjects,
    availableWorkers: availableWorkers.map(({ id, firstName, lastName }) => ({
      id,
      firstName,
      lastName,
    })),
    dateBounds,
    selectedRange,
    totals,
    averageHourlyRate,
  };
}
