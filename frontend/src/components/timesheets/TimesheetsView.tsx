import DataPagination from '@/components/shared/DataPagination';
import { usePaginationState } from '@/hooks/use-pagination-state';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { appDataKey, shouldRetryAppRead } from '@/lib/appDataQueries';
import { localDateKey } from '@/lib/appDataPages';
import { fetchPayrollReport, fetchPayrollExport } from '@/lib/db';
import CatalogQueryState from '@/components/shared/CatalogQueryState';
import React, { useEffect, useState, useMemo } from 'react';
import {
  X,
  DollarSign,
  Calendar,
  FileSpreadsheet,
  FileText,
  Users,
  ClipboardCheck,
  Timer,
  TrendingUp,
  Info,
} from 'lucide-react';
import SearchableSelect from '@/components/shared/SearchableSelect';

const TimesheetsView: React.FC = () => {
  const [projectFilter, setProjectFilter] = useState('');
  const [workerFilter, setWorkerFilter] = useState('');
  const [rangeMode, setRangeMode] = useState<
    'all' | 'week' | 'last_week' | 'custom'
  >('all');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [selectedWorkerId, setSelectedWorkerId] = useState('');
  const [exportingExcel, setExportingExcel] = useState(false);

  const { user } = useAuth();
  const { toast } = useToast();
  const filters = {
    today: localDateKey(),
    rangeMode,
    start: customStartDate,
    end: customEndDate,
    projectId: projectFilter,
    workerId: workerFilter,
  };
  const { page, setPage, pageSize: rowsPerPage, setPageSize } = usePaginationState(JSON.stringify([user?.id, filters]), undefined, 7);
  const query = useQuery({
    queryKey: [
      ...appDataKey(user?.id || 'guest', 'timesheets'),
      'payroll',
      filters,
      page,
      rowsPerPage,
    ],
    queryFn: ({ signal }) =>
      fetchPayrollReport({ ...filters, page: String(page), limit: String(rowsPerPage) }, signal),
    enabled: Boolean(user),
    staleTime: 30000,
    refetchOnWindowFocus: false,
    retry: shouldRetryAppRead,
  });
  const report = query.data;
  const availableProjects = report?.availableProjects || [];
  const availableWorkers = report?.availableWorkers || [];
  const selectedRange = report?.selectedRange || { start: '', end: '' };
  const filteredSummaries = useMemo(
    () =>
      (report?.workerSummaries || []).map((summary) => ({
        ...summary,
        projectIds: new Set(summary.projectIds),
        projectBreakdown: new Map(
          summary.projectBreakdown.map((row) => [row.projectId, row]),
        ),
      })),
    [report],
  );
  const selectedWorker =
    filteredSummaries.find(
      (summary) => summary.workerId === selectedWorkerId,
    ) || null;
  const pageRows = report?.pageRows || [];
  const totalPages = report?.totalPages || 1;
  const totalRecords = report?.totalRecords || 0;
  const totals = report?.totals || {
    workers: 0,
    timesheets: 0,
    hours: 0,
    regularHours: 0,
    overtimeHours: 0,
    doubleTimeHours: 0,
    grossPay: 0,
  };
  const averageHourlyRate = report?.averageHourlyRate || 0;
  const workOrders = report?.recentWorkOrders || [];
  const getProjectById = (id: string) =>
    availableProjects.find((project) => project.id === id);
  useEffect(() => {
    setPage(1);
  }, [projectFilter, workerFilter, rangeMode, customStartDate, customEndDate]);
  useEffect(() => {
    if (report && page > totalPages) setPage(totalPages);
  }, [report, page, totalPages]);
  useEffect(() => {
    if (
      report &&
      selectedWorkerId &&
      !report.workerSummaries.some(
        (summary) => summary.workerId === selectedWorkerId,
      )
    )
      setSelectedWorkerId('');
  }, [report, selectedWorkerId]);
  useEffect(() => {
    if (
      report &&
      projectFilter &&
      !report.availableProjects.some((project) => project.id === projectFilter)
    )
      setProjectFilter('');
    if (
      report &&
      workerFilter &&
      !report.availableWorkers.some((worker) => worker.id === workerFilter)
    )
      setWorkerFilter('');
  }, [report, projectFilter, workerFilter]);
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

  const toNumber = (value: unknown) => {
    if (typeof value === 'string') {
      const cleaned = value.replace(/,/g, '').trim();
      const numeric = Number(cleaned);
      return Number.isFinite(numeric) ? numeric : 0;
    }
    const numeric = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(numeric) ? numeric : 0;
  };

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(toNumber(value));

  const formatNumber = (value: number) =>
    new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(toNumber(value));

  const formatDate = (value?: string) => {
    if (!value) return '-';
    const date = parseTimesheetDate(value);
    if (!date) return '-';
    return `${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}/${date.getFullYear()}`;
  };

  const projectOptions = useMemo(
    () => [
      { value: '', label: 'All Projects' },
      ...availableProjects.map((project) => ({
        value: project.id,
        label: [project.number, project.name].filter(Boolean).join(' - '),
        searchText: `${project.number || ''} ${project.name || ''}`,
      })),
    ],
    [availableProjects],
  );

  const workerOptions = useMemo(
    () => [
      { value: '', label: 'All Workers' },
      ...availableWorkers.map((worker) => ({
        value: worker.id,
        label: `${worker.firstName} ${worker.lastName}`,
        searchText: `${worker.firstName} ${worker.lastName}`,
      })),
    ],
    [availableWorkers],
  );

  const toggleWorkerDetail = (workerId: string) => {
    setSelectedWorkerId((current) => (current === workerId ? '' : workerId));
  };

  const exportHeaders = [
    'Worker Name',
    'Date',
    'Lunch and Break Taken',
    'Project Number and Name',
    'Shift Type and Time',
    'ST Hours',
    'OT Hours',
    'DR Hours',
    'Total Hours',
    'Gross Pay',
  ];

  const handleExportCsv = async () => {
    let detailedRows;
    try {
      detailedRows = await fetchPayrollExport(filters);
    } catch (error) {
      toast({
        title: 'Could not export timesheets',
        description:
          error instanceof Error ? error.message : 'Please try again.',
        variant: 'destructive',
      });
      return;
    }
    const escapeCsv = (value: string | number) =>
      `"${String(value).replace(/"/g, '""')}"`;
    const rows = detailedRows.map((row) =>
      [
        row.workerName,
        formatDate(row.date),
        row.lunchAndBreakTaken,
        row.projectLabel,
        `${row.shiftType} - ${row.shiftTime}`,
        row.regularHours.toFixed(2),
        row.overtimeHours.toFixed(2),
        row.doubleTimeHours.toFixed(2),
        row.totalHours.toFixed(2),
        row.grossPay.toFixed(2),
      ]
        .map(escapeCsv)
        .join(','),
    );
    const csv = [exportHeaders.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'timesheets_summary.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportExcel = async () => {
    setExportingExcel(true);
    try {
      const detailedRows = await fetchPayrollExport(filters);
      const ExcelJS = await import('exceljs');
      const workbook = new ExcelJS.Workbook();
      workbook.creator = 'DR Traffic Control';
      workbook.created = new Date();
      const worksheet = workbook.addWorksheet('Timesheets', {
        views: [{ state: 'frozen', ySplit: 1, showGridLines: false }],
      });

      worksheet.columns = [
        { header: exportHeaders[0], key: 'workerName', width: 24 },
        { header: exportHeaders[1], key: 'date', width: 14 },
        { header: exportHeaders[2], key: 'lunchAndBreakTaken', width: 24 },
        { header: exportHeaders[3], key: 'project', width: 34 },
        { header: exportHeaders[4], key: 'shift', width: 30 },
        { header: exportHeaders[5], key: 'st', width: 12 },
        { header: exportHeaders[6], key: 'ot', width: 12 },
        { header: exportHeaders[7], key: 'dr', width: 12 },
        { header: exportHeaders[8], key: 'total', width: 14 },
        { header: exportHeaders[9], key: 'grossPay', width: 16 },
      ];

      detailedRows.forEach((row) => {
        worksheet.addRow({
          workerName: row.workerName,
          date: parseTimesheetDate(row.date),
          lunchAndBreakTaken: row.lunchAndBreakTaken,
          project: row.projectLabel,
          shift: `${row.shiftType} - ${row.shiftTime}`,
          st: row.regularHours,
          ot: row.overtimeHours,
          dr: row.doubleTimeHours,
          total: row.totalHours,
          grossPay: row.grossPay,
        });
      });

      const header = worksheet.getRow(1);
      header.height = 24;
      header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      header.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF1C2E4A' },
      };
      header.alignment = { vertical: 'middle' };
      worksheet.autoFilter = { from: 'A1', to: 'J1' };
      worksheet.getColumn('B').numFmt = 'mm/dd/yyyy';
      ['F', 'G', 'H', 'I'].forEach((column) => {
        worksheet.getColumn(column).numFmt = '0.00';
      });
      worksheet.getColumn('J').numFmt = '$#,##0.00';
      worksheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return;
        row.height = 21;
        row.alignment = { vertical: 'middle' };
        if (rowNumber % 2 === 0) {
          row.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFF8FAFC' },
          };
        }
      });

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'timesheets_summary.xlsx';
      anchor.click();
      URL.revokeObjectURL(url);
    } finally {
      setExportingExcel(false);
    }
  };

  const StatCard = ({
    icon: Icon,
    label,
    value,
    sublabel,
    tone,
  }: {
    icon: React.ElementType;
    label: string;
    value: string;
    sublabel: string;
    tone: string;
  }) => (
    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <div
          className={`flex h-11 w-11 items-center justify-center rounded-full ${tone}`}
        >
          <Icon size={23} />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-semibold text-gray-600">{label}</p>
          <p className="mt-2 text-2xl font-bold leading-none text-gray-950">
            {value}
          </p>
          <p className="mt-2 text-xs text-gray-500">{sublabel}</p>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-min-h-[calc(100dvh-64px)] lg:h-[calc(100dvh-64px)] bg-gray-50 p-5 text-gray-950">
      <CatalogQueryState
        loading={query.isPending}
        refreshing={query.isFetching && !query.isPending}
        error={query.error}
        retry={() => void query.refetch()}
      />
      <div className="mb-5 flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-2xl font-bold tracking-normal text-gray-950">
              Timesheets Summary
            </h2>
            <Info size={17} className="text-blue-600" />
          </div>
          <p className="mt-2 text-sm text-gray-600">
            Summary of timesheets and payroll totals by worker.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            disabled={exportingExcel}
            onClick={() => void handleExportExcel()}
            className="inline-flex h-10 items-center gap-2 rounded-md border border-gray-200 bg-white px-4 text-sm font-semibold text-gray-700 shadow-sm hover:bg-gray-50 disabled:cursor-wait disabled:opacity-60"
          >
            <FileSpreadsheet size={16} className="text-emerald-600" />{' '}
            {exportingExcel ? 'Exporting...' : 'Export Excel'}
          </button>
          <button
            onClick={handleExportCsv}
            className="inline-flex h-10 items-center gap-2 rounded-md border border-gray-200 bg-white px-4 text-sm font-semibold text-gray-700 shadow-sm hover:bg-gray-50"
          >
            <FileText size={16} /> Export CSV
          </button>
        </div>
      </div>

      <div
        className={`grid min-h-[calc(100vh-160px)] transition-[grid-template-columns,gap] duration-300 ease-out ${selectedWorker ? 'gap-5 xl:grid-cols-[minmax(0,1fr)_330px]' : 'gap-0 xl:grid-cols-[minmax(0,1fr)_0px]'}`}
      >
        <div className="min-w-0 space-y-4">
          <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
            <div className="grid gap-4 lg:grid-cols-[1.35fr_1fr_1fr]">
              <div>
                <p className="mb-2 text-xs font-bold uppercase text-gray-500">
                  Payroll Period
                </p>
                <div className="flex h-11 items-center justify-between gap-2 rounded-md border border-gray-200 bg-white px-3 text-sm font-semibold text-gray-700 flex-wrap gap-3">
                  <Calendar size={16} className="text-gray-500" />
                  <span>{formatDate(selectedRange.start)}</span>
                  <span className="text-gray-400">to</span>
                  <span>{formatDate(selectedRange.end)}</span>
                  <Calendar size={16} className="text-gray-500" />
                </div>
              </div>
              <div>
                <p className="mb-2 text-xs font-bold uppercase text-gray-500">
                  Project
                </p>
                <SearchableSelect
                  value={projectFilter}
                  onChange={setProjectFilter}
                  options={projectOptions}
                  placeholder="All Projects"
                  searchPlaceholder="Search projects..."
                  emptyMessage="No projects found."
                  buttonClassName="h-11 rounded-md border-gray-200 font-semibold text-gray-700"
                />
              </div>
              <div>
                <p className="mb-2 text-xs font-bold uppercase text-gray-500">
                  Worker
                </p>
                <SearchableSelect
                  value={workerFilter}
                  onChange={setWorkerFilter}
                  options={workerOptions}
                  placeholder="All Workers"
                  searchPlaceholder="Search workers..."
                  emptyMessage="No workers found."
                  buttonClassName="h-11 rounded-md border-gray-200 font-semibold text-gray-700"
                />
              </div>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-gray-100 pt-4">
              <span className="text-xs font-bold text-gray-700">
                Quick Range
              </span>
              <button
                onClick={() => setRangeMode('week')}
                className={`h-9 rounded-md border px-5 text-xs font-bold ${rangeMode === 'week' ? 'border-blue-200 bg-blue-50 text-blue-700' : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'}`}
              >
                This Week
              </button>
              <button
                onClick={() => setRangeMode('last_week')}
                className={`h-9 rounded-md border px-5 text-xs font-bold ${rangeMode === 'last_week' ? 'border-blue-200 bg-blue-50 text-blue-700' : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'}`}
              >
                Last Week
              </button>
              <button
                onClick={() => setRangeMode('all')}
                className={`h-9 rounded-md border px-5 text-xs font-bold ${rangeMode === 'all' ? 'border-blue-200 bg-blue-50 text-blue-700' : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'}`}
              >
                All Dates
              </button>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => setRangeMode('custom')}
                  className={`inline-flex h-9 items-center gap-2 rounded-md border px-4 text-xs font-bold ${rangeMode === 'custom' ? 'border-blue-200 bg-blue-50 text-blue-700' : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'}`}
                >
                  Custom <Calendar size={14} />
                </button>
                {rangeMode === 'custom' && (
                  <>
                    <input
                      type="date"
                      value={customStartDate}
                      onChange={(e) => setCustomStartDate(e.target.value)}
                      className="h-9 rounded-md border border-gray-200 px-2 text-xs font-semibold text-gray-700 outline-none focus:border-blue-500"
                    />
                    <input
                      type="date"
                      value={customEndDate}
                      onChange={(e) => setCustomEndDate(e.target.value)}
                      className="h-9 rounded-md border border-gray-200 px-2 text-xs font-semibold text-gray-700 outline-none focus:border-blue-500"
                    />
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <StatCard
              icon={Users}
              label="Total Workers"
              value={String(totals.workers)}
              sublabel="With timesheets"
              tone="bg-blue-50 text-blue-600"
            />
            <StatCard
              icon={ClipboardCheck}
              label="Total Timesheets"
              value={String(totals.timesheets)}
              sublabel="In selected range"
              tone="bg-emerald-50 text-emerald-600"
            />
            <StatCard
              icon={Timer}
              label="Total Hours"
              value={formatNumber(totals.hours)}
              sublabel={`ST: ${formatNumber(totals.regularHours)}   OT: ${formatNumber(totals.overtimeHours)}   DT: ${formatNumber(totals.doubleTimeHours)}`}
              tone="bg-sky-50 text-blue-600"
            />
            <StatCard
              icon={DollarSign}
              label="Total Gross Pay"
              value={formatCurrency(totals.grossPay)}
              sublabel="All projects"
              tone="bg-violet-50 text-violet-600"
            />
            <StatCard
              icon={TrendingUp}
              label="Avg. Hourly Rate"
              value={formatCurrency(averageHourlyRate)}
              sublabel="Blended average"
              tone="bg-orange-50 text-orange-600"
            />
          </div>

          <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1340px]">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50">
                    {[
                      'Worker Name',
                      'Date',
                      'Lunch and Break Taken',
                      'Project Number and Name',
                      'Shift Type and Time',
                      'ST Hours',
                      'OT Hours',
                      'DR Hours',
                      'Total Hours',
                      'Gross Pay',
                    ].map((header) => (
                      <th
                        key={header}
                        className="px-4 py-3 text-left text-[11px] font-bold uppercase text-gray-500"
                      >
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((row) => (
                    <tr
                      key={row.id}
                      onClick={() => toggleWorkerDetail(row.workerId)}
                      className={`cursor-pointer border-b border-gray-100 hover:bg-gray-50 ${selectedWorker?.workerId === row.workerId ? 'bg-blue-50/40' : ''}`}
                    >
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-3 text-left">
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">
                            {row.initials}
                          </span>
                          <span className="text-sm font-bold text-gray-900">
                            {row.workerName}
                          </span>
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-4 py-4 text-sm font-semibold text-gray-700">
                        {formatDate(row.date)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-4 text-sm font-semibold text-gray-700">
                        {row.lunchAndBreakTaken}
                      </td>
                      <td className="px-4 py-4 text-sm font-semibold text-gray-700">
                        {row.projectLabel}
                      </td>
                      <td className="px-4 py-4 text-sm text-gray-700">
                        <span className="font-bold">{row.shiftType}</span>
                        <span className="mt-1 block whitespace-nowrap text-xs text-gray-500">
                          {row.shiftTime}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-sm font-semibold text-gray-700">
                        {formatNumber(row.regularHours)}
                      </td>
                      <td className="px-4 py-4 text-sm font-bold text-rose-500">
                        {formatNumber(row.overtimeHours)}
                      </td>
                      <td className="px-4 py-4 text-sm font-semibold text-gray-700">
                        {formatNumber(row.doubleTimeHours)}
                      </td>
                      <td className="px-4 py-4 text-sm font-bold text-gray-950">
                        {formatNumber(row.totalHours)}
                      </td>
                      <td className="px-4 py-4 text-sm font-bold text-gray-950">
                        {formatCurrency(row.grossPay)}
                      </td>
                    </tr>
                  ))}
                  {pageRows.length === 0 && (
                    <tr>
                      <td
                        colSpan={10}
                        className="px-4 py-12 text-center text-sm text-gray-500"
                      >
                        No timesheets found for the selected filters.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <DataPagination page={page} total={report?.totalRecords} pageSize={rowsPerPage} onPage={setPage} onPageSize={setPageSize} busy={query.isFetching} itemLabel="timesheets" className="border-t border-gray-100 px-4" />
          </div>
        </div>

        <aside
          className={`overflow-hidden rounded-lg bg-white shadow-sm transition-all duration-300 ease-out xl:sticky xl:top-20 xl:h-[calc(100vh-100px)] xl:self-start ${selectedWorker ? 'translate-x-0 border border-gray-200 p-4 opacity-100' : 'pointer-events-none h-0 translate-x-3 border-0 p-0 opacity-0 xl:h-[calc(100vh-100px)]'}`}
        >
          {selectedWorker ? (
            <div className="flex h-full flex-col gap-4 overflow-y-auto pr-1">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-600 text-sm font-bold text-white">
                    {selectedWorker.initials}
                  </span>
                  <div>
                    <h3 className="text-lg font-bold text-gray-950">
                      {selectedWorker.workerName}
                    </h3>
                    <p className="text-xs font-semibold text-gray-500">
                      Payroll Period
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedWorkerId('')}
                  className="rounded-md p-1 text-gray-500 hover:bg-gray-50"
                >
                  <X size={17} />
                </button>
              </div>
              <div className="flex items-center justify-between rounded-md border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-700 flex-wrap gap-3">
                <span>
                  {formatDate(selectedRange.start)} -{' '}
                  {formatDate(selectedRange.end)}
                </span>
                <Calendar size={16} />
              </div>
              <div className="responsive-grid grid grid-cols-3 gap-3 border-b border-gray-100 pb-4">
                <div>
                  <p className="text-xs font-bold text-gray-500">Timesheets</p>
                  <p className="text-lg font-bold">
                    {selectedWorker.timesheets}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-bold text-gray-500">Projects</p>
                  <p className="text-lg font-bold">
                    {selectedWorker.projectIds.size}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-bold text-gray-500">Assignments</p>
                  <p className="text-lg font-bold">
                    {selectedWorker.assignments}
                  </p>
                </div>
              </div>
              <div className="responsive-grid grid grid-cols-3 gap-3">
                <div>
                  <p className="text-xs font-bold text-gray-500">ST Hours</p>
                  <p className="text-base font-bold">
                    {formatNumber(selectedWorker.regularHours)}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-bold text-gray-500">OT Hours</p>
                  <p className="text-base font-bold text-rose-500">
                    {formatNumber(selectedWorker.overtimeHours)}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-bold text-gray-500">DT Hours</p>
                  <p className="text-base font-bold">
                    {formatNumber(selectedWorker.doubleTimeHours)}
                  </p>
                </div>
              </div>
              <div className="responsive-grid grid grid-cols-2 gap-3">
                <div className="rounded-md border border-gray-200 bg-gray-50 p-3">
                  <p className="text-xs font-bold text-gray-500">Total Hours</p>
                  <p className="mt-2 text-xl font-bold">
                    {formatNumber(selectedWorker.totalHours)}
                  </p>
                </div>
                <div className="rounded-md border border-blue-100 bg-blue-50 p-3">
                  <p className="text-xs font-bold text-gray-500">Gross Pay</p>
                  <p className="mt-2 text-xl font-bold text-blue-700">
                    {formatCurrency(selectedWorker.grossPay)}
                  </p>
                </div>
              </div>
              <div>
                <p className="mb-3 text-xs font-bold text-gray-900">
                  Project Breakdown
                </p>
                <div className="space-y-2">
                  <div className="grid grid-cols-[1fr_64px_80px] text-[10px] font-bold uppercase text-gray-500">
                    <span>Project</span>
                    <span>Hours</span>
                    <span className="text-right">Gross Pay</span>
                  </div>
                  {Array.from(selectedWorker.projectBreakdown.values()).map(
                    (item) => (
                      <div
                        key={item.projectId}
                        className="grid grid-cols-[1fr_64px_80px] items-center text-xs"
                      >
                        <span className="truncate font-semibold text-gray-700">
                          {item.projectName}
                        </span>
                        <span className="font-semibold text-gray-700">
                          {formatNumber(item.hours)}
                        </span>
                        <span className="text-right font-semibold text-gray-700">
                          {formatCurrency(item.grossPay)}
                        </span>
                      </div>
                    ),
                  )}
                  <div className="grid grid-cols-[1fr_64px_80px] border-t border-gray-100 pt-2 text-xs font-bold">
                    <span>Total</span>
                    <span>{formatNumber(selectedWorker.totalHours)}</span>
                    <span className="text-right text-blue-700">
                      {formatCurrency(selectedWorker.grossPay)}
                    </span>
                  </div>
                </div>
              </div>
              <div>
                <div className="mb-3 flex items-center justify-between flex-wrap gap-3">
                  <p className="text-xs font-bold text-gray-900">
                    Recent Assignments
                  </p>
                </div>
                <div className="space-y-2">
                  {selectedWorker.recentTimesheets
                    .slice(0, 3)
                    .map((timesheet) => {
                      const project = getProjectById(timesheet.projectId);
                      const workOrder = workOrders.find(
                        (item) => item.id === timesheet.workOrderId,
                      );
                      return (
                        <div
                          key={timesheet.id}
                          className="flex items-center justify-between gap-2 text-xs flex-wrap gap-3"
                        >
                          <span className="min-w-0 truncate font-bold text-gray-800">
                            {workOrder?.orderNumber ||
                              timesheet.workOrderId ||
                              'Assignment'}{' '}
                            - {project?.name || 'Project'}
                          </span>
                          <span className="shrink-0 font-semibold text-gray-500">
                            {formatDate(timesheet.date)}
                          </span>
                        </div>
                      );
                    })}
                </div>
              </div>
            </div>
          ) : null}
        </aside>
      </div>
    </div>
  );
};

export default TimesheetsView;
