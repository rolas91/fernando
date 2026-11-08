import DataPagination from '@/components/shared/DataPagination';
import { useShiftsRead } from '@/hooks/use-shifts-read';
import CatalogQueryState from '@/components/shared/CatalogQueryState';
import ScopedShiftDetail from './ScopedShiftDetail';
import { documentFileName } from '@/lib/documentFileName';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  FileText,
  LayoutList,
  Columns3,
  MapPin,
  MessageSquare,
  Moon,
  Search,
  RotateCw,
  Sun,
  Users,
  X,
} from 'lucide-react';
import { useAppContext } from '@/contexts/AppContext';
import { dbRegenerateFormSubmissionPdf, exportWorkOrderPdfs } from '@/lib/db';
import type { Shift, WorkOrder } from '@/lib/types';
import { ShiftChatAside } from '@/components/scheduler/ShiftChatAside';
import SearchableSelect from '@/components/shared/SearchableSelect';

type Row = { workOrder: WorkOrder; shift: Shift };
type ShiftDateFilterMode = 'all' | 'day' | 'range' | 'last_week' | 'this_week';

const createdByLabel = (shift: Shift) => shift.createdByName?.trim() || '—';

const localDateValue = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

const relativeWeekRange = (weekOffset: number) => {
  const today = new Date();
  const start = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
    12,
  );
  start.setDate(start.getDate() - start.getDay() + weekOffset * 7);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return { start: localDateValue(start), end: localDateValue(end) };
};

const statusLabel = (row: Row) => {
  const enrichedShift = row.shift as Shift & {
    effectiveStatus?: string | null;
  };
  const effective = enrichedShift.effectiveStatus;
  const effectiveLabels: Record<string, string> = {
    customer_pending: 'Customer Pending',
    dispatch_pending: 'Dispatch Pending',
    ready_to_notify: 'Ready to Notify',
    awaiting_response: 'Awaiting Response',
    workers_confirmed: 'Workers Confirmed',
    shift_cancelled: 'Shift Cancelled',
    shift_completed: 'Shift Completed',
    pm_approved: 'PM Approved',
  };
  if (Object.prototype.hasOwnProperty.call(enrichedShift, 'effectiveStatus')) {
    return effective && effectiveLabels[effective]
      ? effectiveLabels[effective]
      : 'No Status';
  }
  const confirmations = row.shift.roles.flatMap(
    (role) => role.workerConfirmations || [],
  );
  const required = row.shift.roles.reduce(
    (sum, role) => sum + Number(role.requiredCount || 0),
    0,
  );
  const assigned = row.shift.roles.reduce(
    (sum, role) => sum + role.assignedWorkers.length,
    0,
  );
  const automaticEnabled = row.shift.status === 'ready_to_notify';
  if (
    automaticEnabled &&
    required > 0 &&
    assigned >= required &&
    confirmations.length > 0 &&
    confirmations.every((c) => c.status === 'confirmed')
  )
    return 'Workers Confirmed';
  if (
    automaticEnabled &&
    confirmations.some(
      (c) => c.status === 'pending' && (c.requestedAt || c.notificationChannel),
    )
  )
    return 'Awaiting Response';
  const manualLabels: Record<string, string> = {
    customer_pending: 'Customer Pending',
    dispatch_pending: 'Dispatch Pending',
    ready_to_notify: 'Ready to Notify',
  };
  return row.shift.status && manualLabels[row.shift.status]
    ? manualLabels[row.shift.status]
    : 'No Status';
};

const badgeClass = (label: string) =>
  ({
    'Workers Confirmed': 'bg-emerald-100 text-emerald-900',
    'Awaiting Response': 'bg-violet-100 text-violet-900',
    'Ready to Notify': 'bg-blue-100 text-blue-900',
    'Dispatch Pending': 'bg-yellow-100 text-yellow-950',
    'Customer Pending': 'bg-orange-100 text-orange-900',
    'Shift Completed': 'bg-slate-200 text-slate-900',
    'PM Approved': 'bg-teal-600 text-white',
    'Shift Cancelled': 'bg-red-100 text-red-900',
    'No Status': 'bg-slate-100 text-slate-600',
  })[label] || 'bg-slate-100 text-slate-700';

const clockMinutes = (value: string) => {
  const match = value?.match(/^(\d{1,2}):(\d{2})/);
  return match ? Number(match[1]) * 60 + Number(match[2]) : 0;
};

const durationLabel = (shift: Shift) => {
  const start = clockMinutes(shift.startTime);
  let end = clockMinutes(shift.endTime);
  if (end < start) end += 1440;
  const total = Math.max(0, end - start);
  return `${Math.floor(total / 60)}h ${String(total % 60).padStart(2, '0')}m`;
};

const fileName = documentFileName;

const documentType = (title: string) => {
  const key = title.toLowerCase();
  if (key.includes('timesheet')) return 'Timesheet';
  if (key.includes('incident')) return 'Incident Report';
  if (
    key.includes('site map') ||
    key.includes('sitemap') ||
    key.includes('site-map')
  )
    return 'Site Map';
  if (key.includes('safety')) return 'Safety Plan';
  return 'Work Order';
};

const currentIsoWeek = () => {
  const today = new Date();
  const date = new Date(
    Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()),
  );
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil(
    ((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7,
  );
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
};

const isoWeekRange = (value: string) => {
  const match = value.match(/^(\d{4})-W(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const week = Number(match[2]);
  const januaryFourth = new Date(Date.UTC(year, 0, 4));
  const monday = new Date(januaryFourth);
  monday.setUTCDate(
    januaryFourth.getUTCDate() -
      (januaryFourth.getUTCDay() || 7) +
      1 +
      (week - 1) * 7,
  );
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  return {
    from: monday.toISOString().slice(0, 10),
    to: sunday.toISOString().slice(0, 10),
  };
};

const ShiftsView: React.FC<{ embedded?: boolean }> = () => {
  const parent = useAppContext();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('All');
  const [dateFilterMode, setDateFilterMode] =
    useState<ShiftDateFilterMode>('all');
  const [dayFilter, setDayFilter] = useState(() => localDateValue(new Date()));
  const [rangeStart, setRangeStart] = useState(() =>
    localDateValue(new Date()),
  );
  const [rangeEnd, setRangeEnd] = useState(() => localDateValue(new Date()));
  const [projectNumberFilter, setProjectNumberFilter] = useState('');
  const [projectNameFilter, setProjectNameFilter] = useState('');
  const [selected, setSelected] = useState<Row | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [regeneratingPdfId, setRegeneratingPdfId] = useState<string | null>(
    null,
  );
  const [exportPdfOpen, setExportPdfOpen] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [exportStatus, setExportStatus] = useState<
    'all' | 'completed' | 'pm_approved'
  >('all');
  const [exportProjectId, setExportProjectId] = useState('');
  const [exportPeriod, setExportPeriod] = useState<'day' | 'week' | 'range'>(
    'day',
  );
  const [exportDay, setExportDay] = useState(() => localDateValue(new Date()));
  const [exportWeek, setExportWeek] = useState(currentIsoWeek);
  const [exportRangeStart, setExportRangeStart] = useState(() =>
    localDateValue(new Date()),
  );
  const [exportRangeEnd, setExportRangeEnd] = useState(() =>
    localDateValue(new Date()),
  );
  const [viewMode, setViewMode] = useState<'list' | 'calendar' | 'board'>(
    'list',
  );
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(
    new Set(),
  );
  const [showAllProjects, setShowAllProjects] = useState<Set<string>>(
    new Set(),
  );
  const initializedProjectAccordion = useRef('');

  const thisWeekRange = relativeWeekRange(0),
    lastWeekRange = relativeWeekRange(-1);
  const range =
    dateFilterMode === 'day'
      ? { from: dayFilter, to: dayFilter }
      : dateFilterMode === 'this_week'
        ? { from: thisWeekRange.start, to: thisWeekRange.end }
        : dateFilterMode === 'last_week'
          ? { from: lastWeekRange.start, to: lastWeekRange.end }
          : dateFilterMode === 'range'
            ? {
                from: rangeStart <= rangeEnd ? rangeStart : rangeEnd,
                to: rangeStart <= rangeEnd ? rangeEnd : rangeStart,
              }
            : {};
  const read = useShiftsRead(
    {
      search: query,
      status: filter,
      projectNumber: projectNumberFilter,
      projectName: projectNameFilter,
      ...range,
    },
    viewMode,
    !selected,
  );
  const context = {
    ...parent,
    projects: read.query.data?.projects || [],
    clients: read.query.data?.clients || [],
    getProjectById: (id: string) =>
      read.query.data?.projects.find((project) => project.id === id),
    getClientById: (id: string) =>
      read.query.data?.clients.find((client) => client.id === id),
  };
  const refreshOverview = read.refresh,
    overviewLoaded = Boolean(read.metrics.data);
  const rows = read.query.data?.rows || [],
    visible = rows;
  const projectFilterOptions = read.metrics.data?.projects || [];
  const exportProjectOptions = projectFilterOptions.filter((project) =>
    read.metrics.data?.approvedProjectIds.includes(project.id),
  );
  useEffect(() => {
    if (
      overviewLoaded &&
      exportProjectId &&
      !exportProjectOptions.some((project) => project.id === exportProjectId)
    ) {
      setExportProjectId('');
    }
  }, [overviewLoaded, exportProjectId, exportProjectOptions]);

  const projectGroups = useMemo(() => {
    const groups = new Map<string, { projectId: string; rows: Row[] }>();
    visible.forEach((row) => {
      const current = groups.get(row.workOrder.projectId) || {
        projectId: row.workOrder.projectId,
        rows: [],
      };
      current.rows.push(row);
      groups.set(row.workOrder.projectId, current);
    });
    return [...groups.values()];
  }, [visible]);
  const dateGroups = useMemo(() => {
    const groups = new Map<string, Row[]>();
    visible.forEach((row) =>
      groups.set(row.shift.date, [...(groups.get(row.shift.date) || []), row]),
    );
    return [...groups.entries()].sort(([a], [b]) => b.localeCompare(a));
  }, [visible]);
  useEffect(() => {
    if (
      !overviewLoaded ||
      projectGroups.length === 0 ||
      initializedProjectAccordion.current === read.scopeKey
    )
      return;
    initializedProjectAccordion.current = read.scopeKey;
    setExpandedProjects(
      (current) => new Set([...current, projectGroups[0].projectId]),
    );
  }, [projectGroups, overviewLoaded, read.scopeKey]);
  const projectFor = (row: Row) =>
    context.getProjectById(row.workOrder.projectId);
  const projectLabel = (row: Row) => {
    const project = projectFor(row);
    return [project?.number, project?.name || row.workOrder.title]
      .filter(Boolean)
      .join(' ');
  };
  const assignedCount = (shift: Shift) =>
    shift.roles.reduce((n, r) => n + r.assignedWorkers.length, 0);
  const requiredCount = (shift: Shift) =>
    shift.roles.reduce((n, r) => n + Number(r.requiredCount || 0), 0);
  const shiftType = (shift: Shift) => {
    const template = context.shifts.find(
      (item) => item.id === shift.shiftTemplateId,
    );
    const hour = Number((shift.startTime || '0').split(':')[0]);
    const fallbackNight = hour >= 17 || hour < 5;
    const name =
      template?.name || (fallbackNight ? 'Night Shift' : 'Day Shift');
    return {
      name,
      night: name.toLowerCase().includes('night') || fallbackNight,
    };
  };
  const exportPdf = async () => {
    let dates: { from: string; to: string } | null = null;
    if (exportPeriod === 'day') dates = { from: exportDay, to: exportDay };
    if (exportPeriod === 'week') dates = isoWeekRange(exportWeek);
    if (exportPeriod === 'range') {
      dates = { from: exportRangeStart, to: exportRangeEnd };
    }
    if (
      !overviewLoaded ||
      !exportProjectOptions.some((project) => project.id === exportProjectId)
    ) {
      window.alert('Select a project with PM-approved Work Orders.');
      return;
    }
    if (!dates?.from || !dates.to) {
      window.alert('Select a valid date period.');
      return;
    }
    if (dates && dates.from > dates.to) {
      window.alert('The start date cannot be after the end date.');
      return;
    }

    setExportingPdf(true);
    try {
      const result = await exportWorkOrderPdfs({
        status: exportStatus,
        projectId: exportProjectId,
        from: dates.from,
        to: dates.to,
      });
      const url = URL.createObjectURL(result.blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = result.fileName;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      setExportPdfOpen(false);
    } catch (error) {
      window.alert(
        error instanceof Error
          ? error.message
          : 'Could not export Work Order PDFs.',
      );
    } finally {
      setExportingPdf(false);
    }
  };
  const filters = [
    'All',
    'Customer Pending',
    'Dispatch Pending',
    'Ready to Notify',
    'Awaiting Response',
    'Workers Confirmed',
    'Shift Completed',
    'PM Approved',
    'Shift Cancelled',
  ];
  const selectedWorkOrderPdf = useMemo(() => {
    if (!selected) return null;
    const submission = context.formSubmissions.find((s) => {
      if (
        s.workOrderId !== selected.workOrder.id ||
        !s.pdfUrl ||
        (s.shiftId && s.shiftId !== selected.shift.id)
      )
        return false;
      const template = context.formTemplates.find((t) => t.id === s.templateId);
      const key =
        `${template?.name || ''} ${template?.category || ''}`.toLowerCase();
      return key.includes('work order') || /\bwo\b/.test(key);
    });
    return submission?.pdfUrl
      ? {
          id: submission.id,
          url: submission.pdfUrl,
          title:
            context.formTemplates.find((t) => t.id === submission.templateId)
              ?.name || 'Work Order PDF',
        }
      : null;
  }, [selected, context.formSubmissions, context.formTemplates]);
  const selectedDocuments = useMemo(() => {
    if (!selected) return [];
    const uploads = [
      ...(selected.workOrder.fileUploads || []),
      ...(selected.workOrder.attachments || []),
    ]
      .filter(Boolean)
      .map((url, index) => ({
        id: `upload-${index}-${url}`,
        title: fileName(url),
        url,
        source: 'Assignment',
      }));
    const generated = context.formSubmissions
      .filter((s) => {
        if (
          s.workOrderId !== selected.workOrder.id ||
          (s.shiftId && s.shiftId !== selected.shift.id) ||
          !s.pdfUrl
        )
          return false;
        const t = context.formTemplates.find((x) => x.id === s.templateId);
        const key = `${t?.name || ''} ${t?.category || ''}`.toLowerCase();
        return !(key.includes('work order') || /\bwo\b/.test(key));
      })
      .map((s) => ({
        id: `submission-${s.id}`,
        title:
          context.formTemplates.find((t) => t.id === s.templateId)?.name ||
          'Generated PDF',
        url: s.pdfUrl as string,
        source: 'Generated',
      }));
    return [...generated, ...uploads].map((doc) => ({
      ...doc,
      type: documentType(doc.title),
    }));
  }, [selected, context.formSubmissions, context.formTemplates]);

  if (selected) {
    return (
      <ScopedShiftDetail
        key={selected.workOrder.id + ':' + selected.shift.id}
        workOrderId={selected.workOrder.id}
        shiftId={selected.shift.id}
        statusLabel={statusLabel}
        onBack={() => setSelected(null)}
        onRefresh={refreshOverview}
      />
    );
  }

  return (
    <div className="flex min-min-h-[calc(100dvh-64px)] lg:h-[calc(100dvh-64px)] bg-white">
      <section className={`min-w-0 flex-1 p-6 ${selected ? 'border-r' : ''}`}>
        <CatalogQueryState
          loading={read.query.isPending && read.valid}
          refreshing={read.query.isFetching && !read.query.isPending}
          error={read.query.error}
          retry={() => void read.query.refetch()}
        />
        <CatalogQueryState
          loading={read.metrics.isPending && !read.query.isPending}
          refreshing={read.metrics.isFetching && !read.metrics.isPending && !read.query.isFetching}
          error={read.metrics.error}
          retry={() => void read.metrics.refetch()}
        />
        {!read.valid && <p role="alert">Select a valid shift date or range.</p>}
        <h1 className="text-2xl font-bold text-slate-900">Shifts</h1>
        <div className="mt-5 flex flex-wrap gap-2">
          {filters.map((item) => (
            <button
              key={item}
              onClick={() => setFilter(item)}
              className={`rounded-lg border px-3 py-2 text-xs font-semibold ${filter === item ? 'bg-slate-900 text-white' : 'bg-white text-slate-600'}`}
            >
              {item} ({read.metrics.data?.statusCounts[item] ?? 0})
            </button>
          ))}
        </div>
        <div className="mt-5 flex flex-wrap gap-3">
          <label className="flex max-w-sm flex-1 items-center gap-2 rounded-lg border px-3">
            <Search size={17} className="text-slate-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search shifts..."
              className="h-10 w-full outline-none"
            />
          </label>
          <div className="flex items-center gap-2 rounded-lg border bg-white px-2 py-1.5">
            <CalendarDays size={16} className="text-slate-400" />
            <select
              value={dateFilterMode}
              onChange={(e) =>
                setDateFilterMode(e.target.value as ShiftDateFilterMode)
              }
              className="bg-transparent text-xs font-semibold outline-none"
            >
              <option value="all">All dates</option>
              <option value="this_week">This Week</option>
              <option value="last_week">Last Week</option>
              <option value="day">Day</option>
              <option value="range">Range</option>
            </select>
            {dateFilterMode === 'day' && (
              <input
                type="date"
                value={dayFilter}
                onChange={(e) => setDayFilter(e.target.value)}
                className="rounded border px-2 py-1 text-xs"
              />
            )}
            {dateFilterMode === 'range' && (
              <>
                <input
                  type="date"
                  value={rangeStart}
                  onChange={(e) => setRangeStart(e.target.value)}
                  className="rounded border px-2 py-1 text-xs"
                />
                <span className="text-xs text-slate-400">to</span>
                <input
                  type="date"
                  value={rangeEnd}
                  onChange={(e) => setRangeEnd(e.target.value)}
                  className="rounded border px-2 py-1 text-xs"
                />
              </>
            )}
            {dateFilterMode !== 'all' && (
              <button
                onClick={() => setDateFilterMode('all')}
                className="rounded px-1.5 py-1 text-xs text-slate-500 hover:bg-slate-100"
              >
                Clear
              </button>
            )}
          </div>
          <select
            value={projectNumberFilter}
            onChange={(event) => setProjectNumberFilter(event.target.value)}
            aria-label="Filter by project number"
            className="h-11 rounded-lg border bg-white px-3 text-xs font-semibold text-slate-700 outline-none"
          >
            <option value="">All Project Numbers</option>
            {projectFilterOptions.map((project) => (
              <option key={project.id} value={project.id}>
                {project.number || 'No number'}
              </option>
            ))}
          </select>
          <select
            value={projectNameFilter}
            onChange={(event) => setProjectNameFilter(event.target.value)}
            aria-label="Filter by project name"
            className="h-11 rounded-lg border bg-white px-3 text-xs font-semibold text-slate-700 outline-none"
          >
            <option value="">All Project Names</option>
            {[...projectFilterOptions]
              .sort((a, b) => a.name.localeCompare(b.name))
              .map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name || 'Unnamed project'}
                </option>
              ))}
          </select>
          <div className="ml-auto flex rounded-lg border p-1">
            {(
              [
                { id: 'list', label: 'List', icon: LayoutList },
                { id: 'calendar', label: 'Calendar', icon: CalendarDays },
                { id: 'board', label: 'Board', icon: Columns3 },
              ] as const
            ).map((item) => (
              <button
                key={item.id}
                onClick={() => setViewMode(item.id)}
                className={`flex items-center gap-1.5 rounded-md px-3 py-2 text-xs font-semibold ${viewMode === item.id ? 'bg-slate-900 text-white' : 'text-slate-500'}`}
              >
                <item.icon size={14} />
                {item.label}
              </button>
            ))}
          </div>
          <button
            onClick={() => setExportPdfOpen(true)}
            className="flex items-center gap-2 rounded-lg border px-4 text-sm font-medium hover:bg-slate-50"
          >
            <Download size={17} /> Export PDF
          </button>
        </div>
        {viewMode === 'list' && (
          <div className="mt-5 space-y-3">
            {!read.query.isPending && projectGroups.length === 0 && (
              <div className="rounded-xl border p-12 text-center text-slate-500">
                No shifts match the selected filters.
              </div>
            )}
            {projectGroups.map((group) => {
              const project = context.getProjectById(group.projectId);
              const open = expandedProjects.has(group.projectId);
              const assignments = [
                ...new Map(
                  group.rows.map((r) => [r.workOrder.id, r.workOrder]),
                ).values(),
              ];
              const displayed = showAllProjects.has(group.projectId)
                ? group.rows
                : group.rows.slice(0, 6);
              return (
                <div
                  key={group.projectId}
                  className="overflow-hidden rounded-xl border bg-white"
                >
                  <div className="flex items-center gap-4 p-4">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-50 text-lg font-bold text-blue-700">
                      {(project?.name || 'P').slice(0, 2).toUpperCase()}
                    </div>
                    <button
                      className="min-w-0 flex-1 text-left"
                      onClick={() =>
                        setExpandedProjects((current) => {
                          const next = new Set(current);
                          if (next.has(group.projectId))
                            next.delete(group.projectId);
                          else next.add(group.projectId);
                          return next;
                        })
                      }
                    >
                      <p className="truncate font-bold text-slate-900">
                        {[project?.number, project?.name || 'Project']
                          .filter(Boolean)
                          .join(' ')}
                      </p>
                      <p className="mt-1 truncate text-sm text-slate-600">
                        Client:{' '}
                        {context.getClientById(project?.clientId || '')?.name ||
                          '—'}
                      </p>
                      <p className="mt-1 flex items-center gap-1 text-xs text-slate-500">
                        <MapPin size={12} />
                        {[project?.city, project?.state]
                          .filter(Boolean)
                          .join(', ') ||
                          project?.location ||
                          'Location not set'}
                      </p>
                    </button>
                    <div className="flex items-center gap-8 text-center">
                      <div>
                        <b>{group.rows.length}</b>
                        <p className="text-xs text-slate-500">Active Shifts</p>
                      </div>
                      <div>
                        <b>{assignments.length}</b>
                        <p className="text-xs text-slate-500">Assignments</p>
                      </div>
                    </div>
                    <button
                      onClick={() => context.setCurrentPage('projects')}
                      className="flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold"
                    >
                      View Project <ExternalLink size={14} />
                    </button>
                    <button
                      onClick={() =>
                        setExpandedProjects((current) => {
                          const next = new Set(current);
                          if (next.has(group.projectId))
                            next.delete(group.projectId);
                          else next.add(group.projectId);
                          return next;
                        })
                      }
                    >
                      <ChevronDown
                        size={18}
                        className={`transition-transform ${open ? 'rotate-180' : ''}`}
                      />
                    </button>
                  </div>
                  {open && (
                    <div className="border-t">
                      {assignments.map((assignment) => {
                        const assignmentRows = displayed.filter(
                          (r) => r.workOrder.id === assignment.id,
                        );
                        if (!assignmentRows.length) return null;
                        return (
                          <div key={assignment.id}>
                            {assignmentRows.map((row) => {
                              const label = statusLabel(row);
                              return (
                                <button
                                  key={`${row.workOrder.id}-${row.shift.id}`}
                                  onClick={() => setSelected(row)}
                                  className={`grid w-full grid-cols-[70px_1.2fr_1fr_1fr_1.3fr_90px_150px_20px] items-center gap-3 border-b p-3 text-left hover:bg-slate-50 ${selected?.shift.id === row.shift.id ? 'bg-blue-50 ring-1 ring-inset ring-blue-300' : ''}`}
                                >
                                  <div className="rounded-lg border bg-white py-1 text-center">
                                    <div className="text-[10px] font-bold text-slate-500">
                                      {new Date(`${row.shift.date}T12:00:00`)
                                        .toLocaleDateString('en-US', {
                                          month: 'short',
                                        })
                                        .toUpperCase()}
                                    </div>
                                    <div className="text-xl font-bold">
                                      {new Date(
                                        `${row.shift.date}T12:00:00`,
                                      ).getDate()}
                                    </div>
                                  </div>
                                  <div className="min-w-0">
                                    <b className="block truncate">
                                      {row.shift.shiftName}
                                    </b>
                                    <p className="text-[10px] uppercase text-slate-400">
                                      Shift Name
                                    </p>
                                    <p className="mt-1 truncate text-[11px] text-slate-600">
                                      Created By:{' '}
                                      <span className="font-semibold text-slate-800">
                                        {createdByLabel(row.shift)}
                                      </span>
                                    </p>
                                  </div>
                                  <div>
                                    <b>{row.shift.startTime}</b>
                                    <p
                                      className={`mt-1 flex items-center gap-1 text-xs ${shiftType(row.shift).night ? 'text-violet-600' : 'text-amber-600'}`}
                                    >
                                      {shiftType(row.shift).night ? (
                                        <Moon size={13} />
                                      ) : (
                                        <Sun size={13} />
                                      )}
                                      {shiftType(row.shift).name}
                                    </p>
                                  </div>
                                  <div className="text-sm font-medium">
                                    {row.shift.roles
                                      .map((r) => r.roleName)
                                      .join(', ')}
                                  </div>
                                  <div className="text-xs text-slate-500">
                                    <div className="flex items-center gap-1">
                                      <MapPin size={13} />
                                      {row.shift.address ||
                                        row.workOrder.assignmentAddress ||
                                        project?.location ||
                                        'Location not set'}
                                    </div>
                                    {row.shift.crossStreetLocationDetail ? (
                                      <p className="mt-1.5 text-[10px] text-slate-600">
                                        {row.shift.crossStreetLocationDetail}
                                      </p>
                                    ) : null}
                                  </div>
                                  <div className="text-center">
                                    <b>
                                      {assignedCount(row.shift)} /{' '}
                                      {requiredCount(row.shift)}
                                    </b>
                                    <p className="text-xs text-slate-500">
                                      Workers
                                    </p>
                                  </div>
                                  <span
                                    className={`rounded-md px-2 py-1 text-center text-xs font-semibold ${badgeClass(label)}`}
                                  >
                                    {label}
                                  </span>
                                  <ChevronRight size={17} />
                                </button>
                              );
                            })}
                          </div>
                        );
                      })}
                      {group.rows.length > 6 && (
                        <button
                          onClick={() =>
                            setShowAllProjects((current) => {
                              const next = new Set(current);
                              if (next.has(group.projectId))
                                next.delete(group.projectId);
                              else next.add(group.projectId);
                              return next;
                            })
                          }
                          className="w-full py-3 text-center text-xs font-bold text-red-600"
                        >
                          {showAllProjects.has(group.projectId)
                            ? 'Show less'
                            : `View all ${group.rows.length} shifts on this page`}{' '}
                          <ChevronDown size={14} className="inline" />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
        {viewMode === 'calendar' && (
          <div className="mt-5 space-y-4">
            {dateGroups.map(([date, dateRows]) => (
              <div key={date} className="rounded-xl border">
                <div className="border-b bg-slate-50 px-4 py-3 font-bold">
                  {new Date(`${date}T12:00:00`).toLocaleDateString('en-US', {
                    weekday: 'long',
                    month: 'long',
                    day: 'numeric',
                    year: 'numeric',
                  })}{' '}
                  <span className="ml-2 text-xs font-normal text-slate-500">
                    {dateRows.length} shifts
                  </span>
                </div>
                <div className="grid gap-3 p-3 md:grid-cols-2 xl:grid-cols-3">
                  {dateRows.map((row) => (
                    <button
                      key={`${row.workOrder.id}-${row.shift.id}`}
                      onClick={() => setSelected(row)}
                      className="rounded-lg border p-3 text-left hover:border-blue-300 hover:bg-blue-50"
                    >
                      <div className="flex justify-between">
                        <b>
                          {row.shift.startTime} – {row.shift.endTime}
                        </b>
                        <span
                          className={`rounded px-2 py-1 text-[10px] font-semibold ${badgeClass(statusLabel(row))}`}
                        >
                          {statusLabel(row)}
                        </span>
                      </div>
                      <p className="mt-2 font-semibold">{projectLabel(row)}</p>
                      <p className="text-xs text-slate-600">
                        Client:{' '}
                        {context.getClientById(projectFor(row)?.clientId || '')
                          ?.name || '—'}
                      </p>
                      <p className="text-xs text-slate-500">
                        {row.workOrder.orderNumber || row.workOrder.id}
                      </p>
                      <p className="mt-1 text-xs text-slate-600">
                        Created By: {createdByLabel(row.shift)}
                      </p>
                      <p className="mt-2 text-xs">
                        {shiftType(row.shift).name} · {assignedCount(row.shift)}
                        /{requiredCount(row.shift)} workers
                      </p>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
        {viewMode === 'board' && (
          <div className="mt-5 flex gap-3 overflow-x-auto pb-4">
            {filters
              .filter((item) => item !== 'All')
              .map((status) => {
                const statusRows = visible.filter(
                  (row) => statusLabel(row) === status,
                );
                return (
                  <div
                    key={status}
                    className="w-72 shrink-0 rounded-xl bg-slate-50 p-3"
                  >
                    <div className="mb-3 flex justify-between">
                      <b className="text-sm">{status}</b>
                      <span className="rounded-full bg-white px-2 text-xs">
                        {read.query.data?.columns?.[status]?.total ?? 0}
                      </span>
                    </div>
                    <div className="space-y-2">
                      {statusRows.map((row) => (
                        <button
                          key={`${row.workOrder.id}-${row.shift.id}`}
                          onClick={() => setSelected(row)}
                          className="w-full rounded-lg border bg-white p-3 text-left shadow-sm hover:border-blue-300"
                        >
                          <p className="font-semibold">{projectLabel(row)}</p>
                          <p className="text-xs text-slate-600">
                            Client:{' '}
                            {context.getClientById(
                              projectFor(row)?.clientId || '',
                            )?.name || '—'}
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                            {row.workOrder.orderNumber || row.workOrder.id}
                          </p>
                          <p className="mt-1 text-xs text-slate-600">
                            Created By: {createdByLabel(row.shift)}
                          </p>
                          <p className="mt-2 text-xs">
                            {row.shift.date} · {row.shift.startTime}
                          </p>
                          <p className="mt-1 text-xs">
                            {shiftType(row.shift).name} ·{' '}
                            {assignedCount(row.shift)}/
                            {requiredCount(row.shift)} workers
                          </p>
                        </button>
                      ))}
                    </div>
                    <DataPagination page={read.columnPage(status)} total={(read.query.data?.columns?.[status])?.total} pageSize={read.pageSize} onPage={(page) => read.setColumnPage(status, page)} onPageSize={read.setPageSize} busy={read.query.isFetching} />
                  </div>
                );
              })}
          </div>
        )}
        {viewMode !== 'board' && (
          <DataPagination page={read.page} total={(read.query.data?.meta)?.total} pageSize={read.pageSize} onPage={read.setPage} onPageSize={read.setPageSize} busy={read.query.isFetching} />
        )}
      </section>
      {exportPdfOpen && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/50 p-2 sm:p-4"
          onMouseDown={() => !exportingPdf && setExportPdfOpen(false)}
        >
          <div
            className="w-full max-w-lg max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-2xl bg-white p-3 sm:p-6 shadow-2xl"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold text-slate-900">
                  Export Work Orders
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  Combines existing PDFs into one file. Each Work Order starts
                  on a new page.
                </p>
              </div>
              <button
                type="button"
                disabled={exportingPdf}
                onClick={() => setExportPdfOpen(false)}
                className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50"
                aria-label="Close export dialog"
              >
                <X size={18} />
              </button>
            </div>

            <div className="mt-6 space-y-5">
              <label className="block">
                <span className="mb-2 block text-sm font-semibold text-slate-700">
                  Status
                </span>
                <select
                  value={exportStatus}
                  disabled={exportingPdf}
                  onChange={(event) =>
                    setExportStatus(event.target.value as typeof exportStatus)
                  }
                  className="h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                >
                  <option value="all">All (Completed + PM Approved)</option>
                  <option value="completed">Completed</option>
                  <option value="pm_approved">PM Approved</option>
                </select>
              </label>

              <div className="block">
                <span className="mb-2 block text-sm font-medium text-slate-600">
                  Project
                </span>
                <SearchableSelect
                  value={exportProjectId}
                  disabled={exportingPdf || !overviewLoaded}
                  onChange={setExportProjectId}
                  placeholder={
                    overviewLoaded ? 'Select a project' : 'Loading projects...'
                  }
                  searchPlaceholder="Search by project number or name..."
                  emptyMessage="No projects with PM-approved Work Orders found."
                  buttonClassName="h-11"
                  options={exportProjectOptions.map((project) => ({
                    value: project.id,
                    label: [project.number, project.name]
                      .filter(Boolean)
                      .join(' — '),
                  }))}
                />
                <span className="mt-2 block text-xs text-slate-500">
                  Only projects with PM-approved Work Orders are listed.
                </span>
              </div>

              <div>
                <span className="mb-2 block text-sm font-semibold text-slate-700">
                  Filter by date
                </span>
                <div className="responsive-grid grid grid-cols-3 rounded-lg bg-slate-100 p-1">
                  {(
                    [
                      ['day', 'Day'],
                      ['week', 'Week'],
                      ['range', 'Date range'],
                    ] as const
                  ).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      disabled={exportingPdf}
                      onClick={() => setExportPeriod(value)}
                      className={`rounded-md px-3 py-2 text-sm font-semibold ${exportPeriod === value ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {exportPeriod === 'day' && (
                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-slate-600">
                    Day
                  </span>
                  <input
                    type="date"
                    disabled={exportingPdf}
                    value={exportDay}
                    onChange={(event) => setExportDay(event.target.value)}
                    className="h-11 w-full rounded-lg border border-slate-300 px-3 text-sm"
                  />
                </label>
              )}
              {exportPeriod === 'week' && (
                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-slate-600">
                    Week
                  </span>
                  <input
                    type="week"
                    disabled={exportingPdf}
                    value={exportWeek}
                    onChange={(event) => setExportWeek(event.target.value)}
                    className="h-11 w-full rounded-lg border border-slate-300 px-3 text-sm"
                  />
                </label>
              )}
              {exportPeriod === 'range' && (
                <div className="responsive-grid grid grid-cols-2 gap-3">
                  <label>
                    <span className="mb-2 block text-sm font-medium text-slate-600">
                      Start date
                    </span>
                    <input
                      type="date"
                      disabled={exportingPdf}
                      value={exportRangeStart}
                      onChange={(event) =>
                        setExportRangeStart(event.target.value)
                      }
                      className="h-11 w-full rounded-lg border border-slate-300 px-3 text-sm"
                    />
                  </label>
                  <label>
                    <span className="mb-2 block text-sm font-medium text-slate-600">
                      End date
                    </span>
                    <input
                      type="date"
                      disabled={exportingPdf}
                      min={exportRangeStart || undefined}
                      value={exportRangeEnd}
                      onChange={(event) =>
                        setExportRangeEnd(event.target.value)
                      }
                      className="h-11 w-full rounded-lg border border-slate-300 px-3 text-sm"
                    />
                  </label>
                </div>
              )}

              <div className="rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-xs leading-5 text-blue-800">
                The export will include only Work Orders from the selected
                project, within the selected dates, and with the selected
                status. Only already-generated PDFs are included.
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                disabled={exportingPdf}
                onClick={() => setExportPdfOpen(false)}
                className="rounded-lg border px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={exportingPdf || !overviewLoaded || !exportProjectId}
                onClick={() => void exportPdf()}
                className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-wait disabled:opacity-60"
              >
                {exportingPdf ? (
                  <RotateCw size={17} className="animate-spin" />
                ) : (
                  <Download size={17} />
                )}
                {exportingPdf ? 'Generating...' : 'Export PDF'}
              </button>
            </div>
          </div>
        </div>
      )}
      {selected && (
        <aside className="fixed inset-2 z-50 max-h-[calc(100dvh-1rem)] rounded-xl border shadow-xl lg:static lg:z-auto lg:max-h-none lg:w-[430px] lg:rounded-none lg:border-0 lg:shadow-none shrink-0 overflow-y-auto bg-white p-4 text-slate-900">
          <div className="flex items-center justify-between border-b pb-4 flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <button onClick={() => setSelected(null)}>
                <ChevronLeft size={20} />
              </button>
              <h2 className="text-lg font-bold">Shift Details</h2>
            </div>
            <button onClick={() => setSelected(null)}>
              <X size={20} />
            </button>
          </div>
          <div
            className={`mt-5 rounded-lg px-3 py-2 text-sm font-semibold ${badgeClass(statusLabel(selected))}`}
          >
            {statusLabel(selected)}
          </div>
          <div className="mt-3 flex justify-end">
            <button
              onClick={() => setChatOpen(true)}
              className="flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold hover:bg-slate-50"
            >
              <MessageSquare size={18} /> Chat History
            </button>
          </div>
          <div className="mt-4 rounded-xl border p-4">
            <div className="flex gap-4">
              <div className="rounded-lg border px-3 py-2 text-center">
                <b>{new Date(`${selected.shift.date}T12:00:00`).getDate()}</b>
                <div className="text-xs">
                  {new Date(
                    `${selected.shift.date}T12:00:00`,
                  ).toLocaleDateString('en-US', { weekday: 'short' })}
                </div>
              </div>
              <div>
                <b>
                  {selected.shift.startTime}
                  {selected.shift.endTime ? ` – ${selected.shift.endTime}` : ''}
                </b>
                <div className="mt-1 text-sm text-slate-600">
                  {projectLabel(selected)}
                </div>
                <div className="text-xs text-blue-600">
                  Assignment:{' '}
                  {selected.workOrder.orderNumber || selected.workOrder.id}
                </div>
              </div>
            </div>
          </div>
          <div className="mt-4 rounded-xl border p-4">
            <h3 className="text-xs font-bold text-slate-500">LOCATION</h3>
            <p className="mt-3 flex gap-2 text-sm">
              <MapPin size={16} />
              {selected.shift.address ||
                selected.workOrder.assignmentAddress ||
                projectFor(selected)?.location ||
                'Location not set'}
            </p>
            {selected.shift.crossStreetLocationDetail ? (
              <p className="mt-3 text-sm text-slate-600">
                {selected.shift.crossStreetLocationDetail}
              </p>
            ) : null}
          </div>
          <div className="mt-4 rounded-xl border p-4">
            <h3 className="text-xs font-bold text-slate-500">
              SHIFT INFORMATION
            </h3>
            <dl className="mt-3 grid grid-cols-[110px_1fr] gap-y-2 text-sm">
              <dt>Shift Name</dt>
              <dd className="font-semibold">{selected.shift.shiftName}</dd>
              <dt>Created By</dt>
              <dd>{createdByLabel(selected.shift)}</dd>
              <dt>Project</dt>
              <dd>{projectLabel(selected) || '—'}</dd>
              <dt>Client</dt>
              <dd>
                {context.getClientById(projectFor(selected)?.clientId || '')
                  ?.name || '—'}
              </dd>
              <dt>Assignment</dt>
              <dd>{selected.workOrder.orderNumber || selected.workOrder.id}</dd>
              <dt>Work Order</dt>
              <dd>
                <div className="font-semibold text-emerald-700">
                  {selected.workOrder.title ||
                    selected.workOrder.orderNumber ||
                    'Work Order'}
                </div>
                {selectedWorkOrderPdf ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    <a
                      href={selectedWorkOrderPdf.url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold hover:bg-slate-50"
                    >
                      <Download size={15} /> View / Download PDF
                    </a>
                    <button
                      type="button"
                      disabled={regeneratingPdfId === selectedWorkOrderPdf.id}
                      onClick={async () => {
                        setRegeneratingPdfId(selectedWorkOrderPdf.id);
                        try {
                          const regenerated =
                            await dbRegenerateFormSubmissionPdf(
                              selectedWorkOrderPdf.id,
                            );
                          if (regenerated.pdfUrl)
                            window.open(
                              regenerated.pdfUrl,
                              '_blank',
                              'noopener,noreferrer',
                            );
                        } catch (error) {
                          window.alert(
                            error instanceof Error
                              ? error.message
                              : 'Could not regenerate PDF.',
                          );
                        } finally {
                          setRegeneratingPdfId(null);
                        }
                      }}
                      className="inline-flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-100 disabled:opacity-50"
                    >
                      <RotateCw
                        size={15}
                        className={
                          regeneratingPdfId === selectedWorkOrderPdf.id
                            ? 'animate-spin'
                            : ''
                        }
                      />
                      {regeneratingPdfId === selectedWorkOrderPdf.id
                        ? 'Regenerating...'
                        : 'Regenerate PDF'}
                    </button>
                  </div>
                ) : (
                  <p className="mt-2 text-xs text-slate-500">
                    No generated PDF available.
                  </p>
                )}
              </dd>
              <dt>Date</dt>
              <dd>{selected.shift.date}</dd>
              <dt>Start Time</dt>
              <dd>{selected.shift.startTime}</dd>
              <dt>End Time</dt>
              <dd>{selected.shift.endTime || '—'}</dd>
              <dt>Requester</dt>
              <dd>{selected.shift.requesterName || '—'}</dd>
              <dt>Requester Phone</dt>
              <dd>
                {selected.shift.requesterPhone ? (
                  <a
                    className="text-blue-600 hover:underline"
                    href={`tel:${selected.shift.requesterPhone}`}
                  >
                    {selected.shift.requesterPhone}
                  </a>
                ) : (
                  '—'
                )}
              </dd>
              <dt>Requester Email</dt>
              <dd>
                {selected.shift.requesterEmail ? (
                  <a
                    className="break-all text-blue-600 hover:underline"
                    href={`mailto:${selected.shift.requesterEmail}`}
                  >
                    {selected.shift.requesterEmail}
                  </a>
                ) : (
                  '—'
                )}
              </dd>
            </dl>
          </div>
          <div className="mt-4 rounded-xl border p-4">
            <h3 className="flex items-center gap-2 text-xs font-bold text-slate-500">
              <Users size={15} /> ASSIGNED WORKERS (
              {assignedCount(selected.shift)} / {requiredCount(selected.shift)})
            </h3>
            <div className="mt-3 space-y-2">
              {selected.shift.roles
                .flatMap((role) =>
                  role.assignedWorkers.map((id) => ({ role, id })),
                )
                .map(({ role, id }) => {
                  const worker = context.getWorkerById(id);
                  const conf = role.workerConfirmations?.find(
                    (c) => c.workerId === id,
                  );
                  return (
                    <div
                      key={`${role.id}-${id}`}
                      className="flex items-center justify-between border-t pt-2 text-sm flex-wrap gap-3"
                    >
                      <span>
                        {worker ? `${worker.firstName} ${worker.lastName}` : id}
                      </span>
                      <span className="text-xs text-slate-500">
                        {role.roleName} · {conf?.status || 'assigned'}
                      </span>
                    </div>
                  );
                })}
            </div>
          </div>
          <div className="mt-4 rounded-xl border p-4">
            <h3 className="text-xs font-bold text-slate-500">
              ADDITIONAL SHIFT INFORMATION
            </h3>
            <dl className="mt-3 grid grid-cols-[120px_1fr] gap-y-2 text-sm">
              <dt>Role / Position</dt>
              <dd>
                {selected.shift.roles.map((r) => r.roleName).join(', ') || '—'}
              </dd>
              <dt>Work Order</dt>
              <dd>{selected.workOrder.title || '—'}</dd>
              <dt>Duration</dt>
              <dd>{durationLabel(selected.shift)}</dd>
            </dl>
          </div>
          <div className="mt-4 rounded-xl border p-4">
            <h3 className="text-xs font-bold text-slate-500">NOTES</h3>
            <p className="mt-2 text-sm">
              {selected.workOrder.dispatchNote ||
                selected.workOrder.notes ||
                'No notes for this shift.'}
            </p>
          </div>
          <div className="mt-4 rounded-xl border p-4">
            <h3 className="flex items-center gap-2 text-xs font-bold text-slate-500">
              <FileText size={15} /> ASSIGNED DOCUMENTS (
              {selectedDocuments.length})
            </h3>
            <p className="mt-1 text-[11px] text-slate-500">
              All generated form PDFs and assignment attachments.
            </p>
            <div className="mt-3 space-y-2">
              {selectedDocuments.map((doc) => (
                <a
                  key={doc.id}
                  href={doc.url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-3 rounded-lg border p-2 text-sm hover:bg-slate-50"
                >
                  <FileText size={18} className="text-red-500" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">
                      {doc.title}
                    </span>
                    <span className="text-[10px] text-slate-500">
                      {doc.type} · {doc.source}
                    </span>
                  </span>
                  <Download size={16} />
                </a>
              ))}
              {selectedDocuments.length === 0 && (
                <p className="text-sm text-slate-500">
                  No generated PDFs or assignment attachments are available.
                </p>
              )}
            </div>
          </div>
        </aside>
      )}
      <ShiftChatAside
        open={chatOpen}
        shift={selected?.shift || null}
        workOrder={selected?.workOrder || null}
        onClose={() => setChatOpen(false)}
      />
    </div>
  );
};

export default ShiftsView;
