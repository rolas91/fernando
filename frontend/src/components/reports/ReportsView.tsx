import React, { useState } from 'react';
import { useOperationsRead } from '@/hooks/use-summary-reads';
import type { ReportSection } from '@/lib/summaryReads';
import CatalogPagination from '@/components/shared/CatalogPagination';
import CatalogQueryState from '@/components/shared/CatalogQueryState';
import {
  BarChart3,
  Download,
  Calendar,
  Users,
  Truck,
  Clock,
  DollarSign,
  TrendingUp,
  FileText,
  AlertTriangle,
  Briefcase,
} from 'lucide-react';

function defaultDateRange() {
  const end = new Date();
  const start = new Date(end);
  start.setDate(end.getDate() - 29);
  return {
    start: dateInputValue(start),
    end: dateInputValue(end),
  };
}

function dateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function startOfWeek(date: Date) {
  const start = new Date(date);
  start.setDate(date.getDate() - date.getDay());
  return start;
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

const ReportsView: React.FC = () => {
  const [reportType, setReportType] = useState<ReportSection>('overview');
  const [dateRange, setDateRange] = useState(defaultDateRange);
  const [rangePreset, setRangePreset] = useState('last_30_days');
  const report = useOperationsRead(dateRange, reportType),
    data = report.query.data;
  const activeWorkers = data?.activeWorkers || 0,
    availableEquip = data?.equipmentCounts.available || 0,
    totalHours = data?.totalHours || 0,
    totalOT = data?.totalOT || 0,
    activeJobs = data?.activeJobs || 0;
  const workerHours = data?.workerHours || [],
    projectSummary = data?.projectSummary || [],
    formSubmissionSummary = data?.forms.summary || [],
    maxWorkerHours = data?.maxWorkerHours || 1;
  const applyRangePreset = (preset: string) => {
    const today = new Date();
    let start = new Date(today);
    let end = new Date(today);

    if (preset === 'today') {
      start = today;
    } else if (preset === 'this_week') {
      start = startOfWeek(today);
    } else if (preset === 'last_7_days') {
      start.setDate(today.getDate() - 6);
    } else if (preset === 'this_month') {
      start = startOfMonth(today);
    } else if (preset === 'last_30_days') {
      start.setDate(today.getDate() - 29);
    } else if (preset === 'year_to_date') {
      start = new Date(today.getFullYear(), 0, 1);
    }

    setRangePreset(preset);
    if (preset !== 'custom') {
      setDateRange({ start: dateInputValue(start), end: dateInputValue(end) });
    }
  };

  const handleExport = async (type: 'worker_hours' | 'project_summary') => {
    const result = await report.exportAll(type);
    if (!result) return;
    const { workerHours, projectSummary } = result;
    let csv = '';
    if (type === 'worker_hours') {
      csv =
        'Worker,Type,Regular Hrs,OT Hrs,Total Hrs,Estimated Pay\n' +
        workerHours
          .map(
            (wh) =>
              `${wh.worker.firstName} ${wh.worker.lastName},${wh.worker.type},${wh.regular},${wh.ot},${wh.total},${wh.pay.toFixed(2)}`,
          )
          .join('\n');
    } else if (type === 'project_summary') {
      csv =
        'Project,# Assignments,Total Hours,Labor Cost\n' +
        projectSummary
          .map(
            (ps) =>
              `${ps.project.name},${ps.orders},${ps.hours},${ps.cost.toFixed(2)}`,
          )
          .join('\n');
    }
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${type}_report.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-3 sm:p-6 space-y-6">
      <CatalogQueryState
        loading={report.valid && report.query.isPending}
        error={report.query.error}
        retry={() => void report.query.refetch()}
      />
      {!report.valid && <p role="alert">Select a valid start and end date.</p>}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-800">
            Reports & Analytics
          </h2>
          <p className="text-sm text-gray-500">
            Operational insights and data exports
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <select
            value={rangePreset}
            onChange={(e) => applyRangePreset(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm bg-white"
          >
            <option value="today">Today</option>
            <option value="this_week">This Week</option>
            <option value="last_7_days">Last 7 Days</option>
            <option value="this_month">This Month</option>
            <option value="last_30_days">Last 30 Days</option>
            <option value="year_to_date">Year to Date</option>
            <option value="custom">Custom</option>
          </select>
          <input
            type="date"
            value={dateRange.start}
            onChange={(e) => {
              setRangePreset('custom');
              setDateRange((d) => ({ ...d, start: e.target.value }));
            }}
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm"
          />
          <span className="text-gray-400">to</span>
          <input
            type="date"
            value={dateRange.end}
            onChange={(e) => {
              setRangePreset('custom');
              setDateRange((d) => ({ ...d, end: e.target.value }));
            }}
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm"
          />
        </div>
      </div>

      {}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
        {[
          {
            icon: <Users size={18} className="text-primary" />,
            label: 'Active Workers',
            value: activeWorkers,
            bg: 'bg-blue-100',
          },
          {
            icon: <Truck size={18} className="text-green-600" />,
            label: 'Available Equipment',
            value: availableEquip,
            bg: 'bg-green-100',
          },
          {
            icon: <Briefcase size={18} className="text-purple-600" />,
            label: 'Active Assignments',
            value: activeJobs,
            bg: 'bg-purple-100',
          },
          {
            icon: <Clock size={18} className="text-orange-600" />,
            label: 'Total Hours',
            value: totalHours.toFixed(1),
            bg: 'bg-orange-100',
          },
          {
            icon: <TrendingUp size={18} className="text-red-600" />,
            label: 'Overtime Hours',
            value: totalOT.toFixed(1),
            bg: 'bg-red-100',
          },
          {
            icon: <FileText size={18} className="text-indigo-600" />,
            label: 'Forms Submitted',
            value: data?.forms.total || 0,
            bg: 'bg-indigo-100',
          },
        ].map((kpi, i) => (
          <div
            key={i}
            className="bg-white rounded-xl border border-gray-200 p-4"
          >
            <div
              className={`w-8 h-8 ${kpi.bg} rounded-lg flex items-center justify-center mb-2`}
            >
              {kpi.icon}
            </div>
            <p className="text-xl font-bold text-gray-800">{kpi.value}</p>
            <p className="text-xs text-gray-500">{kpi.label}</p>
          </div>
        ))}
      </div>

      {}
      <div className="flex gap-2 border-b border-gray-200 pb-0">
        {[
          { key: 'overview', label: 'Overview' },
          { key: 'worker_hours', label: 'Worker Hours' },
          { key: 'project_summary', label: 'Project Summary' },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setReportType(tab.key as ReportSection)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
              reportType === tab.key
                ? 'text-primary border-blue-600'
                : 'text-gray-500 border-transparent'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {reportType === 'worker_hours' && (
        <div>
          <div className="flex justify-end mb-3">
            <button
              disabled={report.exporting || !report.valid}
              onClick={() => void handleExport('worker_hours')}
              className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50 flex items-center gap-1"
            >
              <Download size={14} /> Export CSV
            </button>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div
              className="responsive-table"
              role="region"
              aria-label="Table data"
              tabIndex={0}
            >
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-3">
                      Worker
                    </th>
                    <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-3">
                      Type
                    </th>
                    <th className="text-right text-xs font-medium text-gray-500 uppercase px-4 py-3">
                      Regular
                    </th>
                    <th className="text-right text-xs font-medium text-gray-500 uppercase px-4 py-3">
                      Overtime
                    </th>
                    <th className="text-right text-xs font-medium text-gray-500 uppercase px-4 py-3">
                      Total
                    </th>
                    <th className="text-right text-xs font-medium text-gray-500 uppercase px-4 py-3">
                      Est. Pay
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {workerHours.map((wh) => (
                    <tr
                      key={wh.worker.id}
                      className="border-b border-gray-50 hover:bg-gray-50"
                    >
                      <td className="px-4 py-3 text-sm font-medium text-gray-800">
                        {wh.worker.firstName} {wh.worker.lastName}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {wh.worker.type}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700 text-right">
                        {wh.regular}h
                      </td>
                      <td className="px-4 py-3 text-sm text-right">
                        <span
                          className={
                            wh.ot > 0
                              ? 'text-orange-600 font-medium'
                              : 'text-gray-400'
                          }
                        >
                          {wh.ot}h
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm font-semibold text-gray-800 text-right">
                        {wh.total}h
                      </td>
                      <td className="px-4 py-3 text-sm font-semibold text-green-700 text-right">
                        ${wh.pay.toFixed(2)}
                      </td>
                    </tr>
                  ))}
                  <tr className="bg-gray-50 font-semibold">
                    <td className="px-4 py-3 text-sm" colSpan={2}>
                      Total
                    </td>
                    <td className="px-4 py-3 text-sm text-right">
                      {data?.workerTotals.regular || 0}h
                    </td>
                    <td className="px-4 py-3 text-sm text-right text-orange-600">
                      {data?.workerTotals.ot || 0}h
                    </td>
                    <td className="px-4 py-3 text-sm text-right">
                      {data?.workerTotals.total || 0}h
                    </td>
                    <td className="px-4 py-3 text-sm text-right text-green-700">
                      ${(data?.workerTotals.pay || 0).toFixed(2)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {reportType === 'project_summary' && (
        <div>
          <div className="flex justify-end mb-3">
            <button
              disabled={report.exporting || !report.valid}
              onClick={() => void handleExport('project_summary')}
              className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50 flex items-center gap-1"
            >
              <Download size={14} /> Export CSV
            </button>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div
              className="responsive-table"
              role="region"
              aria-label="Table data"
              tabIndex={0}
            >
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-3">
                      Project
                    </th>
                    <th className="text-right text-xs font-medium text-gray-500 uppercase px-4 py-3">
                      Assignments
                    </th>
                    <th className="text-right text-xs font-medium text-gray-500 uppercase px-4 py-3">
                      Total Hours
                    </th>
                    <th className="text-right text-xs font-medium text-gray-500 uppercase px-4 py-3">
                      Labor Cost
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {projectSummary.map((ps) => (
                    <tr
                      key={ps.project.id}
                      className="border-b border-gray-50 hover:bg-gray-50"
                    >
                      <td className="px-4 py-3">
                        <p className="text-sm font-medium text-gray-800">
                          {ps.project.name}
                        </p>
                        <p className="text-xs text-gray-500">
                          #{ps.project.number} | {ps.project.city}
                        </p>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700 text-right">
                        {ps.orders}
                      </td>
                      <td className="px-4 py-3 text-sm font-medium text-gray-800 text-right">
                        {ps.hours}h
                      </td>
                      <td className="px-4 py-3 text-sm font-semibold text-green-700 text-right">
                        ${ps.cost.toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {reportType === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="font-semibold text-gray-800 mb-4">
              Worker Utilization
            </h3>
            <div className="space-y-3">
              {workerHours.slice(0, 8).map((wh) => {
                const pct = Math.min((wh.total / maxWorkerHours) * 100, 100);
                return (
                  <div key={wh.worker.id}>
                    <div className="flex items-center justify-between text-sm mb-1 flex-wrap gap-3">
                      <span className="text-gray-700">
                        {wh.worker.firstName} {wh.worker.lastName}
                      </span>
                      <span className="font-medium">{wh.total}h</span>
                    </div>
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-primary to-primary/90"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="font-semibold text-gray-800 mb-4">
              Equipment Status Distribution
            </h3>
            <div className="flex items-center justify-center gap-8 py-8">
              {[
                {
                  label: 'Available',
                  count: data?.equipmentCounts.available || 0,
                  color: 'bg-green-500',
                },
                {
                  label: 'Assigned',
                  count: data?.equipmentCounts.assigned || 0,
                  color: 'bg-orange-500',
                },
                {
                  label: 'Maintenance',
                  count: data?.equipmentCounts.maintenance || 0,
                  color: 'bg-red-500',
                },
              ].map((item, i) => (
                <div key={i} className="text-center">
                  <div
                    className={`w-16 h-16 ${item.color} rounded-full flex items-center justify-center text-white text-xl font-bold mx-auto`}
                  >
                    {item.count}
                  </div>
                  <p className="text-sm text-gray-600 mt-2">{item.label}</p>
                </div>
              ))}
            </div>
          </div>

          {}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="font-semibold text-gray-800 mb-4">
              Timesheet Status
            </h3>
            <div className="space-y-3">
              {[
                {
                  label: 'Pending',
                  count: data?.timesheetStatusCounts.pending || 0,
                  color: 'bg-yellow-500',
                  total: data?.timesheetCount || 0,
                },
                {
                  label: 'Approved',
                  count: data?.timesheetStatusCounts.approved || 0,
                  color: 'bg-green-500',
                  total: data?.timesheetCount || 0,
                },
                {
                  label: 'Rejected',
                  count: data?.timesheetStatusCounts.rejected || 0,
                  color: 'bg-red-500',
                  total: data?.timesheetCount || 0,
                },
              ].map((item, i) => (
                <div key={i}>
                  <div className="flex items-center justify-between text-sm mb-1 flex-wrap gap-3">
                    <span className="text-gray-700">{item.label}</span>
                    <span className="font-medium">
                      {item.count} / {item.total}
                    </span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${item.color}`}
                      style={{
                        width: `${item.total > 0 ? (item.count / item.total) * 100 : 0}%`,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="font-semibold text-gray-800 mb-4">
              Forms & Incidents
            </h3>
            <div className="responsive-grid grid grid-cols-2 gap-4 mb-4">
              <div className="text-center p-4 bg-gray-50 rounded-lg">
                <p className="text-3xl font-bold text-gray-800">
                  {data?.incidentCounts.total || 0}
                </p>
                <p className="text-sm text-gray-500">Total Incidents</p>
              </div>
              <div className="text-center p-4 bg-gray-50 rounded-lg">
                <p className="text-3xl font-bold text-gray-800">
                  {data?.incidentCounts.open || 0}
                </p>
                <p className="text-sm text-gray-500">Open/Investigating</p>
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs font-semibold uppercase text-gray-500 flex-wrap gap-3">
                <span>Submitted Forms</span>
                <span>{data?.forms.total || 0}</span>
              </div>
              {formSubmissionSummary.length > 0 ? (
                formSubmissionSummary.map(({ template, count }) => (
                  <div
                    key={template.id}
                    className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2 text-sm flex-wrap gap-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium text-gray-800">
                        {template.name}
                      </p>
                      <p className="truncate text-xs text-gray-500">
                        {template.category || 'Uncategorized'}
                      </p>
                    </div>
                    <span className="ml-3 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                      {count}
                    </span>
                  </div>
                ))
              ) : (
                <p className="rounded-lg border border-dashed border-gray-200 px-3 py-4 text-center text-sm text-gray-500">
                  No form submissions in this range.
                </p>
              )}
            </div>
          </div>
        </div>
      )}
      {reportType !== 'overview' && (
        <CatalogPagination
          meta={data?.meta}
          page={report.page}
          onPage={report.setPage}
          busy={report.query.isFetching}
        />
      )}
    </div>
  );
};

export default ReportsView;
