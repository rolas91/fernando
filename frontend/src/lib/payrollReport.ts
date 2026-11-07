export interface PayrollRow {
  id: string;
  workerId: string;
  workerName: string;
  initials: string;
  date: string;
  lunchAndBreakTaken: string;
  projectLabel: string;
  shiftType: string;
  shiftTime: string;
  regularHours: number;
  overtimeHours: number;
  doubleTimeHours: number;
  totalHours: number;
  grossPay: number;
}
export interface PayrollSummary {
  workerId: string;
  workerName: string;
  initials: string;
  projectIds: string[];
  timesheets: number;
  assignments: number;
  regularHours: number;
  overtimeHours: number;
  doubleTimeHours: number;
  totalHours: number;
  grossPay: number;
  hourlyRate: number;
  projectBreakdown: Array<{
    projectId: string;
    projectName: string;
    hours: number;
    grossPay: number;
  }>;
  recentTimesheets: Array<{
    id: string;
    projectId: string;
    workOrderId: string;
    date: string;
  }>;
}
export interface PayrollReport {
  pageRows: PayrollRow[];
  totalPages: number;
  totalRecords: number;
  workerSummaries: PayrollSummary[];
  availableProjects: Array<{ id: string; number?: string; name: string }>;
  availableWorkers: Array<{ id: string; firstName: string; lastName: string }>;
  dateBounds: {
    allStart: string;
    allEnd: string;
    weekStart: string;
    weekEnd: string;
    lastWeekStart: string;
    lastWeekEnd: string;
  };
  selectedRange: { start: string; end: string };
  totals: {
    workers: number;
    timesheets: number;
    hours: number;
    regularHours: number;
    overtimeHours: number;
    doubleTimeHours: number;
    grossPay: number;
  };
  averageHourlyRate: number;
  recentWorkOrders: Array<{ id: string; orderNumber?: string }>;
}
