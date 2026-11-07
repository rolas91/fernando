import React, { useState, useMemo, useCallback } from 'react';
import { useAppContext } from '@/contexts/AppContext';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import {
  AvailabilityRequest,
  AvailabilityType,
  AvailabilityStatus,
  Worker,
} from '@/lib/types';
import {
  Calendar,
  CalendarDays,
  List,
  ChevronLeft,
  ChevronRight,
  Plus,
  X,
  Check,
  Clock,
  Ban,
  Star,
  Filter,
  Search,
  AlertCircle,
  CheckCircle2,
  XCircle,
} from 'lucide-react';

const TYPE_COLORS: Record<
  AvailabilityType,
  { bg: string; border: string; text: string; label: string }
> = {
  available: {
    bg: 'bg-green-100',
    border: 'border-green-300',
    text: 'text-green-800',
    label: 'Available',
  },
  unavailable: {
    bg: 'bg-red-100',
    border: 'border-red-300',
    text: 'text-red-800',
    label: 'Unavailable',
  },
  time_off: {
    bg: 'bg-orange-100',
    border: 'border-orange-300',
    text: 'text-orange-800',
    label: 'Time Off',
  },
  preferred: {
    bg: 'bg-blue-100',
    border: 'border-blue-300',
    text: 'text-blue-800',
    label: 'Preferred',
  },
};

const DEFAULT_STATUS_INFO: Record<
  string,
  { icon: React.ReactNode; label: string; color: string }
> = {
  pending: {
    icon: <Clock size={12} />,
    label: 'Pending',
    color: 'text-yellow-600 bg-yellow-50',
  },
  approved: {
    icon: <CheckCircle2 size={12} />,
    label: 'Approved',
    color: 'text-green-600 bg-green-50',
  },
  denied: {
    icon: <XCircle size={12} />,
    label: 'Denied',
    color: 'text-red-600 bg-red-50',
  },
};

type ViewMode = 'week' | 'month' | 'list';

const AvailabilityCalendarView: React.FC = () => {
  const {
    workers,
    workOrders,
    statusCatalog,
    getWorkerById,
    availabilityRequests,
    addAvailabilityRequest,
    updateAvailabilityRequest,
  } = useAppContext();
  const { user, hasPermission } = useAuth();
  const { toast } = useToast();
  const isManager = hasPermission('manager');

  const [requests, setRequests] =
    useState<AvailabilityRequest[]>(availabilityRequests);

  React.useEffect(() => {
    setRequests(availabilityRequests);
  }, [availabilityRequests]);

  const [viewMode, setViewMode] = useState<ViewMode>('week');
  const [weekStart, setWeekStart] = useState(() => {
    const d = new Date('2026-04-06');
    d.setDate(d.getDate() - d.getDay() + 1);
    return d;
  });
  const [monthDate, setMonthDate] = useState(new Date('2026-04-01'));
  const [showNewRequestModal, setShowNewRequestModal] = useState(false);
  const [selectedRequest, setSelectedRequest] =
    useState<AvailabilityRequest | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterType, setFilterType] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedWorkerFilter, setSelectedWorkerFilter] =
    useState<string>('all');

  const availabilityStatuses = useMemo(() => {
    const configured = statusCatalog
      .filter(
        (item) =>
          item.scope === 'availability_request' && item.status === 'active',
      )
      .sort(
        (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name),
      );
    if (configured.length > 0) return configured;
    return [
      {
        id: 'ar_pending',
        scope: 'availability_request',
        value: 'pending',
        name: 'Pending',
        color: '#F59E0B',
        sortOrder: 10,
        blocksEditing: false,
        triggersNotification: false,
        requiresApproval: true,
        status: 'active',
      },
      {
        id: 'ar_approved',
        scope: 'availability_request',
        value: 'approved',
        name: 'Approved',
        color: '#22C55E',
        sortOrder: 20,
        blocksEditing: true,
        triggersNotification: true,
        requiresApproval: false,
        status: 'active',
      },
      {
        id: 'ar_denied',
        scope: 'availability_request',
        value: 'denied',
        name: 'Denied',
        color: '#EF4444',
        sortOrder: 30,
        blocksEditing: true,
        triggersNotification: true,
        requiresApproval: false,
        status: 'active',
      },
    ];
  }, [statusCatalog]);

  const pendingStatusValue =
    availabilityStatuses.find((s) => s.requiresApproval)?.value || 'pending';
  const approvedStatusValue =
    availabilityStatuses.find((s) => s.value.includes('approved'))?.value ||
    'approved';
  const deniedStatusValue =
    availabilityStatuses.find((s) => s.value.includes('denied'))?.value ||
    'denied';

  const getAvailabilityStatusInfo = useCallback(
    (status: string) => {
      const configured = availabilityStatuses.find(
        (item) => item.value === status,
      );
      if (configured) {
        const key = configured.name.toLowerCase();
        const icon = key.includes('approve') ? (
          <CheckCircle2 size={12} />
        ) : key.includes('deny') || key.includes('reject') ? (
          <XCircle size={12} />
        ) : (
          <Clock size={12} />
        );
        return {
          icon,
          label: configured.name,
          color: 'text-white',
          backgroundColor: configured.color,
        };
      }
      const fallback =
        DEFAULT_STATUS_INFO[status] || DEFAULT_STATUS_INFO.pending;
      return { ...fallback, backgroundColor: undefined as string | undefined };
    },
    [availabilityStatuses],
  );

  const activeWorkers = useMemo(
    () => workers.filter((w) => w.status === 'active'),
    [workers],
  );

  const getWorkerShifts = useCallback(
    (workerId: string, dateStr: string) => {
      const shifts: {
        projectName: string;
        startTime: string;
        endTime: string;
        role: string;
      }[] = [];
      workOrders.forEach((wo) => {
        wo.shifts.forEach((s) => {
          if (s.date === dateStr) {
            s.roles.forEach((r) => {
              if (r.assignedWorkers.includes(workerId)) {
                shifts.push({
                  projectName: wo.title,
                  startTime: s.startTime,
                  endTime: s.endTime,
                  role: r.roleName,
                });
              }
            });
          }
        });
      });
      return shifts;
    },
    [workOrders],
  );

  const getRequestsForDate = useCallback(
    (workerId: string, dateStr: string) => {
      return requests.filter((r) => {
        if (r.workerId !== workerId) return false;
        const start = r.date;
        const end = r.endDate || r.date;
        return dateStr >= start && dateStr <= end;
      });
    },
    [requests],
  );

  const weekDays = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(weekStart);
      d.setDate(d.getDate() + i);
      return d;
    });
  }, [weekStart]);

  const monthDays = useMemo(() => {
    const year = monthDate.getFullYear();
    const month = monthDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startPad = (firstDay.getDay() + 6) % 7;
    const days: (Date | null)[] = [];
    for (let i = 0; i < startPad; i++) days.push(null);
    for (let d = 1; d <= lastDay.getDate(); d++)
      days.push(new Date(year, month, d));
    while (days.length % 7 !== 0) days.push(null);
    return days;
  }, [monthDate]);

  const filteredWorkers = useMemo(() => {
    return activeWorkers.filter((w) => {
      if (selectedWorkerFilter !== 'all' && w.id !== selectedWorkerFilter)
        return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        if (
          !`${w.firstName} ${w.lastName}`.toLowerCase().includes(q) &&
          !w.type.toLowerCase().includes(q)
        )
          return false;
      }
      return true;
    });
  }, [activeWorkers, selectedWorkerFilter, searchQuery]);

  const filteredRequests = useMemo(() => {
    return requests
      .filter((r) => {
        if (filterStatus !== 'all' && r.status !== filterStatus) return false;
        if (filterType !== 'all' && r.type !== filterType) return false;
        if (
          selectedWorkerFilter !== 'all' &&
          r.workerId !== selectedWorkerFilter
        )
          return false;
        if (searchQuery) {
          const worker = getWorkerById(r.workerId);
          const q = searchQuery.toLowerCase();
          if (
            !`${worker?.firstName} ${worker?.lastName}`
              .toLowerCase()
              .includes(q) &&
            !r.reason.toLowerCase().includes(q)
          )
            return false;
        }
        return true;
      })
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
  }, [
    requests,
    filterStatus,
    filterType,
    selectedWorkerFilter,
    searchQuery,
    getWorkerById,
  ]);

  const handleApprove = useCallback(
    async (requestId: string) => {
      setRequests((prev) =>
        prev.map((r) =>
          r.id === requestId
            ? {
                ...r,
                status: approvedStatusValue as AvailabilityStatus,
                reviewedBy: user?.id,
                reviewedAt: new Date().toISOString(),
              }
            : r,
        ),
      );
      try {
        await updateAvailabilityRequest(requestId, {
          status: approvedStatusValue,
          reviewedBy: user?.id,
          reviewedAt: new Date().toISOString(),
        });
        toast({
          title: 'Request Approved',
          description: 'Availability request has been approved.',
        });
      } catch (err) {
        toast({
          title: 'Update failed',
          description:
            err instanceof Error ? err.message : 'Could not approve request',
          variant: 'destructive',
        });
      }
    },
    [approvedStatusValue, user, toast, updateAvailabilityRequest],
  );

  const handleDeny = useCallback(
    async (requestId: string) => {
      setRequests((prev) =>
        prev.map((r) =>
          r.id === requestId
            ? {
                ...r,
                status: deniedStatusValue as AvailabilityStatus,
                reviewedBy: user?.id,
                reviewedAt: new Date().toISOString(),
              }
            : r,
        ),
      );
      try {
        await updateAvailabilityRequest(requestId, {
          status: deniedStatusValue,
          reviewedBy: user?.id,
          reviewedAt: new Date().toISOString(),
        });
        toast({
          title: 'Request Denied',
          description: 'Availability request has been denied.',
          variant: 'destructive',
        });
      } catch (err) {
        toast({
          title: 'Update failed',
          description:
            err instanceof Error ? err.message : 'Could not deny request',
          variant: 'destructive',
        });
      }
    },
    [
      approvedStatusValue,
      deniedStatusValue,
      user,
      toast,
      updateAvailabilityRequest,
    ],
  );

  const handleAddRequest = useCallback(
    async (newReq: Omit<AvailabilityRequest, 'id' | 'createdAt'>) => {
      const request: AvailabilityRequest = {
        ...newReq,
        id: `ar_${Date.now()}`,
        createdAt: new Date().toISOString(),
      };
      try {
        await addAvailabilityRequest(request);
        setRequests((prev) => [...prev, request]);
        toast({
          title: 'Request Submitted',
          description:
            'Your availability request has been submitted for review.',
        });
      } catch (err) {
        toast({
          title: 'Submit failed',
          description:
            err instanceof Error ? err.message : 'Could not submit request',
          variant: 'destructive',
        });
      }
    },
    [addAvailabilityRequest, toast],
  );

  const navigateWeek = (dir: number) => {
    setWeekStart((prev) => {
      const d = new Date(prev);
      d.setDate(d.getDate() + dir * 7);
      return d;
    });
  };

  const navigateMonth = (dir: number) => {
    setMonthDate((prev) => {
      const d = new Date(prev);
      d.setMonth(d.getMonth() + dir);
      return d;
    });
  };

  const formatDateStr = (d: Date) => d.toISOString().split('T')[0];

  const pendingCount = requests.filter(
    (r) => r.status === pendingStatusValue,
  ).length;

  return (
    <div className="min-h-[calc(100dvh-64px)] lg:h-[calc(100dvh-64px)] flex flex-col">
      {}
      <div className="bg-white border-b border-gray-200 px-3 sm:px-6 py-3 flex items-center justify-between flex-shrink-0 flex-wrap gap-3">
        <div className="flex flex-wrap items-center gap-4">
          <h1 className="text-lg font-semibold text-gray-800">
            Worker Availability
          </h1>
          {pendingCount > 0 && isManager && (
            <span className="flex items-center gap-1 px-2.5 py-1 bg-yellow-50 border border-yellow-200 rounded-full text-xs font-medium text-yellow-700">
              <AlertCircle size={12} /> {pendingCount} pending
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center bg-gray-100 rounded-lg px-3 py-1.5">
            <Search size={14} className="text-gray-400 mr-2" />
            <input
              placeholder="Search workers..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-transparent text-sm outline-none w-40 placeholder-gray-400"
            />
          </div>
          <select
            value={selectedWorkerFilter}
            onChange={(e) => setSelectedWorkerFilter(e.target.value)}
            className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white"
          >
            <option value="all">All Workers</option>
            {activeWorkers.map((w) => (
              <option key={w.id} value={w.id}>
                {w.firstName} {w.lastName}
              </option>
            ))}
          </select>

          {}
          <div className="flex bg-gray-100 rounded-lg p-0.5">
            <button
              onClick={() => setViewMode('week')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors flex items-center gap-1.5 ${viewMode === 'week' ? 'bg-white shadow text-primary' : 'text-gray-500 hover:text-gray-700'}`}
            >
              <Calendar size={14} /> Week
            </button>
            <button
              onClick={() => setViewMode('month')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors flex items-center gap-1.5 ${viewMode === 'month' ? 'bg-white shadow text-primary' : 'text-gray-500 hover:text-gray-700'}`}
            >
              <CalendarDays size={14} /> Month
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors flex items-center gap-1.5 ${viewMode === 'list' ? 'bg-white shadow text-primary' : 'text-gray-500 hover:text-gray-700'}`}
            >
              <List size={14} /> List
            </button>
          </div>

          <button
            onClick={() => setShowNewRequestModal(true)}
            className="bg-primary text-primary-foreground px-4 py-1.5 rounded-lg text-sm font-medium hover:bg-primary/90 flex items-center gap-1.5"
          >
            <Plus size={14} /> New Request
          </button>
        </div>
      </div>

      {}
      <div className="bg-white border-b border-gray-100 px-3 sm:px-6 py-2 flex flex-wrap items-center gap-2 flex-shrink-0">
        <span className="text-xs text-gray-500 font-medium">Legend:</span>
        {Object.entries(TYPE_COLORS).map(([key, val]) => (
          <div
            key={key}
            className={`flex items-center gap-1.5 px-2 py-0.5 rounded ${val.bg} ${val.border} border`}
          >
            <div
              className={`w-2 h-2 rounded-full ${val.bg.replace('100', '500')}`}
            />
            <span className={`text-xs font-medium ${val.text}`}>
              {val.label}
            </span>
          </div>
        ))}
        <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-purple-100 border border-purple-300">
          <div className="w-2 h-2 rounded-full bg-purple-500" />
          <span className="text-xs font-medium text-purple-800">
            Assigned Shift
          </span>
        </div>
      </div>

      {}
      <div className="flex-1 overflow-auto">
        {viewMode === 'week' && (
          <WeekView
            weekDays={weekDays}
            workers={filteredWorkers}
            getRequestsForDate={getRequestsForDate}
            getWorkerShifts={getWorkerShifts}
            onNavigate={navigateWeek}
            weekStart={weekStart}
            onSelectRequest={setSelectedRequest}
            getStatusInfo={getAvailabilityStatusInfo}
            deniedStatusValue={deniedStatusValue}
          />
        )}
        {viewMode === 'month' && (
          <MonthView
            monthDays={monthDays}
            monthDate={monthDate}
            requests={requests}
            workers={filteredWorkers}
            getWorkerById={getWorkerById}
            onNavigate={navigateMonth}
            onSelectRequest={setSelectedRequest}
            deniedStatusValue={deniedStatusValue}
          />
        )}
        {viewMode === 'list' && (
          <ListView
            requests={filteredRequests}
            getWorkerById={getWorkerById}
            isManager={isManager}
            onApprove={handleApprove}
            onDeny={handleDeny}
            filterStatus={filterStatus}
            setFilterStatus={setFilterStatus}
            filterType={filterType}
            setFilterType={setFilterType}
            getStatusInfo={getAvailabilityStatusInfo}
            statusOptions={availabilityStatuses}
            pendingStatusValue={pendingStatusValue}
          />
        )}
      </div>

      {}
      {showNewRequestModal && (
        <NewRequestModal
          workers={activeWorkers}
          onClose={() => setShowNewRequestModal(false)}
          onSubmit={handleAddRequest}
          defaultPendingStatus={pendingStatusValue}
        />
      )}

      {}
      {selectedRequest && (
        <RequestDetailModal
          request={selectedRequest}
          worker={getWorkerById(selectedRequest.workerId)}
          isManager={isManager}
          onClose={() => setSelectedRequest(null)}
          onApprove={() => {
            handleApprove(selectedRequest.id);
            setSelectedRequest(null);
          }}
          onDeny={() => {
            handleDeny(selectedRequest.id);
            setSelectedRequest(null);
          }}
          getStatusInfo={getAvailabilityStatusInfo}
          pendingStatusValue={pendingStatusValue}
        />
      )}
    </div>
  );
};

const WeekView: React.FC<{
  weekDays: Date[];
  workers: Worker[];
  getRequestsForDate: (
    workerId: string,
    dateStr: string,
  ) => AvailabilityRequest[];
  getWorkerShifts: (
    workerId: string,
    dateStr: string,
  ) => {
    projectName: string;
    startTime: string;
    endTime: string;
    role: string;
  }[];
  onNavigate: (dir: number) => void;
  weekStart: Date;
  onSelectRequest: (r: AvailabilityRequest) => void;
  getStatusInfo: (status: string) => {
    icon: React.ReactNode;
    label: string;
    color: string;
    backgroundColor?: string;
  };
  deniedStatusValue: string;
}> = ({
  weekDays,
  workers,
  getRequestsForDate,
  getWorkerShifts,
  onNavigate,
  weekStart,
  onSelectRequest,
  getStatusInfo,
  deniedStatusValue,
}) => {
  const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  return (
    <div className="min-w-[900px]">
      {}
      <div className="sticky top-0 z-10 bg-white border-b border-gray-200">
        <div className="flex items-center justify-between px-4 py-2 flex-wrap gap-3">
          <button
            onClick={() => onNavigate(-1)}
            className="p-1.5 hover:bg-gray-100 rounded-lg"
          >
            <ChevronLeft size={16} className="text-gray-500" />
          </button>
          <span className="text-sm font-semibold text-gray-700">
            {weekStart.toLocaleDateString('en-US', {
              month: 'long',
              day: 'numeric',
            })}{' '}
            -{' '}
            {weekDays[6]?.toLocaleDateString('en-US', {
              month: 'long',
              day: 'numeric',
              year: 'numeric',
            })}
          </span>
          <button
            onClick={() => onNavigate(1)}
            className="p-1.5 hover:bg-gray-100 rounded-lg"
          >
            <ChevronRight size={16} className="text-gray-500" />
          </button>
        </div>
        <div className="flex">
          <div className="w-48 flex-shrink-0 px-3 py-2 text-xs font-semibold text-gray-500 border-r border-gray-200">
            Worker
          </div>
          {weekDays.map((d, i) => {
            const isWeekend = d.getDay() === 0 || d.getDay() === 6;
            return (
              <div
                key={i}
                className={`flex-1 min-w-[100px] text-center py-2 border-r border-gray-100 ${isWeekend ? 'bg-gray-50' : ''}`}
              >
                <p
                  className={`text-xs font-semibold ${isWeekend ? 'text-gray-400' : 'text-gray-600'}`}
                >
                  {dayNames[i]}
                </p>
                <p className="text-xs text-gray-400">{d.getDate()}</p>
              </div>
            );
          })}
        </div>
      </div>

      {}
      {workers.map((worker) => (
        <div
          key={worker.id}
          className="flex border-b border-gray-100 hover:bg-gray-50/50"
        >
          <div className="w-48 flex-shrink-0 px-3 py-2 border-r border-gray-200 flex items-center gap-2">
            <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center text-xs font-bold text-blue-700 flex-shrink-0">
              {worker.firstName[0]}
              {worker.lastName[0]}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-medium text-gray-800 truncate">
                {worker.firstName} {worker.lastName}
              </p>
              <p className="text-xs text-gray-400 truncate">{worker.type}</p>
            </div>
          </div>
          {weekDays.map((d, di) => {
            const dateStr = d.toISOString().split('T')[0];
            const reqs = getRequestsForDate(worker.id, dateStr);
            const shifts = getWorkerShifts(worker.id, dateStr);
            const isWeekend = d.getDay() === 0 || d.getDay() === 6;

            return (
              <div
                key={di}
                className={`flex-1 min-w-[100px] p-1 border-r border-gray-100 ${isWeekend ? 'bg-gray-50/50' : ''}`}
              >
                {}
                {shifts.map((s, si) => (
                  <div
                    key={`s${si}`}
                    className="mb-0.5 px-1.5 py-0.5 rounded bg-purple-100 border border-purple-200 cursor-default"
                    title={`${s.projectName} (${s.role})`}
                  >
                    <p className="text-[10px] font-medium text-purple-800 truncate">
                      {s.role}
                    </p>
                    <p className="text-[9px] text-purple-600">
                      {s.startTime}-{s.endTime}
                    </p>
                  </div>
                ))}
                {}
                {reqs.map((r) => {
                  const colors = TYPE_COLORS[r.type];
                  const statusInfo = getStatusInfo(r.status);
                  return (
                    <div
                      key={r.id}
                      onClick={() => onSelectRequest(r)}
                      className={`mb-0.5 px-1.5 py-0.5 rounded border cursor-pointer hover:opacity-80 transition-opacity ${colors.bg} ${colors.border} ${r.status === deniedStatusValue ? 'opacity-40 line-through' : ''}`}
                      title={`${colors.label}: ${r.reason || 'No reason'} (${r.status})`}
                    >
                      <div className="flex items-center justify-between flex-wrap gap-3">
                        <p
                          className={`text-[10px] font-medium ${colors.text} truncate`}
                        >
                          {colors.label}
                        </p>
                        <span
                          className={`${statusInfo.color} rounded-full p-0.5`}
                          style={{
                            backgroundColor: statusInfo.backgroundColor,
                          }}
                        >
                          {statusInfo.icon}
                        </span>
                      </div>
                      <p className={`text-[9px] ${colors.text} opacity-75`}>
                        {r.startTime}-{r.endTime}
                      </p>
                    </div>
                  );
                })}
                {shifts.length === 0 && reqs.length === 0 && (
                  <div className="h-full min-h-[32px]" />
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
};

const MonthView: React.FC<{
  monthDays: (Date | null)[];
  monthDate: Date;
  requests: AvailabilityRequest[];
  workers: Worker[];
  getWorkerById: (id: string) => Worker | undefined;
  onNavigate: (dir: number) => void;
  onSelectRequest: (r: AvailabilityRequest) => void;
  deniedStatusValue: string;
}> = ({
  monthDays,
  monthDate,
  requests,
  workers,
  getWorkerById,
  onNavigate,
  onSelectRequest,
  deniedStatusValue,
}) => {
  const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  const getRequestsForDay = (d: Date) => {
    const dateStr = d.toISOString().split('T')[0];
    return requests.filter((r) => {
      const start = r.date;
      const end = r.endDate || r.date;
      return dateStr >= start && dateStr <= end;
    });
  };

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <button
          onClick={() => onNavigate(-1)}
          className="p-2 hover:bg-gray-100 rounded-lg"
        >
          <ChevronLeft size={16} />
        </button>
        <h2 className="text-lg font-semibold text-gray-800">
          {monthDate.toLocaleDateString('en-US', {
            month: 'long',
            year: 'numeric',
          })}
        </h2>
        <button
          onClick={() => onNavigate(1)}
          className="p-2 hover:bg-gray-100 rounded-lg"
        >
          <ChevronRight size={16} />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-px bg-gray-200 rounded-lg overflow-hidden">
        {dayNames.map((d) => (
          <div
            key={d}
            className="bg-gray-50 py-2 text-center text-xs font-semibold text-gray-600"
          >
            {d}
          </div>
        ))}
        {monthDays.map((d, i) => {
          if (!d) return <div key={i} className="bg-white min-h-[100px]" />;
          const dayReqs = getRequestsForDay(d);
          const isToday =
            d.toDateString() === new Date('2026-04-08').toDateString();
          return (
            <div
              key={i}
              className={`bg-white min-h-[100px] p-1.5 ${isToday ? 'ring-2 ring-blue-400 ring-inset' : ''}`}
            >
              <p
                className={`text-xs font-medium mb-1 ${isToday ? 'text-primary' : 'text-gray-700'}`}
              >
                {d.getDate()}
              </p>
              <div className="space-y-0.5">
                {dayReqs.slice(0, 3).map((r) => {
                  const worker = getWorkerById(r.workerId);
                  const colors = TYPE_COLORS[r.type];
                  return (
                    <div
                      key={r.id}
                      onClick={() => onSelectRequest(r)}
                      className={`px-1 py-0.5 rounded text-[9px] cursor-pointer hover:opacity-80 ${colors.bg} ${colors.text} font-medium truncate ${r.status === deniedStatusValue ? 'opacity-40' : ''}`}
                    >
                      {worker?.firstName?.[0]}.{worker?.lastName} -{' '}
                      {colors.label}
                    </div>
                  );
                })}
                {dayReqs.length > 3 && (
                  <p className="text-[9px] text-gray-400 font-medium">
                    +{dayReqs.length - 3} more
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const ListView: React.FC<{
  requests: AvailabilityRequest[];
  getWorkerById: (id: string) => Worker | undefined;
  isManager: boolean;
  onApprove: (id: string) => void;
  onDeny: (id: string) => void;
  filterStatus: string;
  setFilterStatus: (s: string) => void;
  filterType: string;
  setFilterType: (s: string) => void;
  getStatusInfo: (status: string) => {
    icon: React.ReactNode;
    label: string;
    color: string;
    backgroundColor?: string;
  };
  statusOptions: Array<{ id: string; value: string; name: string }>;
  pendingStatusValue: string;
}> = ({
  requests,
  getWorkerById,
  isManager,
  onApprove,
  onDeny,
  filterStatus,
  setFilterStatus,
  filterType,
  setFilterType,
  getStatusInfo,
  statusOptions,
  pendingStatusValue,
}) => {
  return (
    <div className="p-3 sm:p-6">
      {}
      <div className="flex items-center gap-3 mb-4">
        <Filter size={14} className="text-gray-400" />
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white"
        >
          <option value="all">All Statuses</option>
          {statusOptions.map((status) => (
            <option key={status.id} value={status.value}>
              {status.name}
            </option>
          ))}
        </select>
        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
          className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white"
        >
          <option value="all">All Types</option>
          <option value="available">Available</option>
          <option value="unavailable">Unavailable</option>
          <option value="time_off">Time Off</option>
          <option value="preferred">Preferred</option>
        </select>
        <span className="text-xs text-gray-500">
          {requests.length} request{requests.length !== 1 ? 's' : ''}
        </span>
      </div>

      {}
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
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600">
                  Worker
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600">
                  Type
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600">
                  Date(s)
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600">
                  Time
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600">
                  Reason
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600">
                  Status
                </th>
                {isManager && (
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600">
                    Actions
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {requests.map((r) => {
                const worker = getWorkerById(r.workerId);
                const colors = TYPE_COLORS[r.type];
                const statusInfo = getStatusInfo(r.status);
                return (
                  <tr
                    key={r.id}
                    className="border-b border-gray-100 hover:bg-gray-50"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center text-xs font-bold text-blue-700">
                          {worker?.firstName?.[0]}
                          {worker?.lastName?.[0]}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-800">
                            {worker?.firstName} {worker?.lastName}
                          </p>
                          <p className="text-xs text-gray-400">
                            {worker?.type}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`px-2 py-0.5 rounded text-xs font-medium ${colors.bg} ${colors.text} border ${colors.border}`}
                      >
                        {colors.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700">
                      {new Date(r.date + 'T00:00:00').toLocaleDateString(
                        'en-US',
                        { month: 'short', day: 'numeric' },
                      )}
                      {r.endDate &&
                        r.endDate !== r.date &&
                        ` - ${new Date(r.endDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {r.startTime} - {r.endTime}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600 max-w-[200px] truncate">
                      {r.reason || '-'}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium w-fit ${statusInfo.color}`}
                        style={{ backgroundColor: statusInfo.backgroundColor }}
                      >
                        {statusInfo.icon} {statusInfo.label}
                      </span>
                    </td>
                    {isManager && (
                      <td className="px-4 py-3">
                        {r.status === pendingStatusValue && (
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => onApprove(r.id)}
                              className="p-1.5 rounded-lg bg-green-50 hover:bg-green-100 text-green-600 transition-colors"
                              title="Approve"
                            >
                              <Check size={14} />
                            </button>
                            <button
                              onClick={() => onDeny(r.id)}
                              className="p-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-red-600 transition-colors"
                              title="Deny"
                            >
                              <X size={14} />
                            </button>
                          </div>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
              {requests.length === 0 && (
                <tr>
                  <td
                    colSpan={isManager ? 7 : 6}
                    className="px-4 py-12 text-center text-sm text-gray-400"
                  >
                    No availability requests found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

const NewRequestModal: React.FC<{
  workers: Worker[];
  onClose: () => void;
  onSubmit: (req: Omit<AvailabilityRequest, 'id' | 'createdAt'>) => void;
  defaultPendingStatus: string;
}> = ({ workers, onClose, onSubmit, defaultPendingStatus }) => {
  const [form, setForm] = useState({
    workerId: workers[0]?.id || '',
    type: 'time_off' as AvailabilityType,
    date: '2026-04-13',
    endDate: '2026-04-13',
    startTime: '00:00',
    endTime: '23:59',
    reason: '',
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      workerId: form.workerId,
      type: form.type,
      date: form.date,
      endDate: form.endDate || form.date,
      startTime: form.startTime,
      endTime: form.endTime,
      reason: form.reason,
      status: defaultPendingStatus,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-2 sm:p-4">
      <div
        className="bg-white rounded-xl w-full max-w-md"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-5 border-b border-gray-200 flex items-center justify-between flex-wrap gap-3">
          <h2 className="text-lg font-semibold text-gray-800">
            New Availability Request
          </h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 rounded-lg"
          >
            <X size={18} className="text-gray-400" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Worker
            </label>
            <select
              required
              value={form.workerId}
              onChange={(e) =>
                setForm((f) => ({ ...f, workerId: e.target.value }))
              }
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            >
              {workers.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.firstName} {w.lastName} ({w.type})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Type
            </label>
            <select
              value={form.type}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  type: e.target.value as AvailabilityType,
                }))
              }
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            >
              <option value="available">Available</option>
              <option value="unavailable">Unavailable</option>
              <option value="time_off">Time Off</option>
              <option value="preferred">Preferred Hours</option>
            </select>
          </div>
          <div className="responsive-grid grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Start Date
              </label>
              <input
                type="date"
                required
                value={form.date}
                onChange={(e) =>
                  setForm((f) => ({ ...f, date: e.target.value }))
                }
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                End Date
              </label>
              <input
                type="date"
                required
                value={form.endDate}
                onChange={(e) =>
                  setForm((f) => ({ ...f, endDate: e.target.value }))
                }
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              />
            </div>
          </div>
          <div className="responsive-grid grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Start Time
              </label>
              <input
                type="time"
                value={form.startTime}
                onChange={(e) =>
                  setForm((f) => ({ ...f, startTime: e.target.value }))
                }
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                End Time
              </label>
              <input
                type="time"
                value={form.endTime}
                onChange={(e) =>
                  setForm((f) => ({ ...f, endTime: e.target.value }))
                }
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Reason
            </label>
            <textarea
              value={form.reason}
              onChange={(e) =>
                setForm((f) => ({ ...f, reason: e.target.value }))
              }
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              rows={2}
              placeholder="Optional reason..."
            />
          </div>
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90"
            >
              Submit Request
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

const RequestDetailModal: React.FC<{
  request: AvailabilityRequest;
  worker?: Worker;
  isManager: boolean;
  onClose: () => void;
  onApprove: () => void;
  onDeny: () => void;
  getStatusInfo: (status: string) => {
    icon: React.ReactNode;
    label: string;
    color: string;
    backgroundColor?: string;
  };
  pendingStatusValue: string;
}> = ({
  request,
  worker,
  isManager,
  onClose,
  onApprove,
  onDeny,
  getStatusInfo,
  pendingStatusValue,
}) => {
  const colors = TYPE_COLORS[request.type];
  const statusInfo = getStatusInfo(request.status);

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-2 sm:p-4">
      <div
        className="bg-white rounded-xl w-full max-w-sm"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-5 border-b border-gray-200 flex items-center justify-between flex-wrap gap-3">
          <h2 className="text-lg font-semibold text-gray-800">
            Request Details
          </h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 rounded-lg"
          >
            <X size={18} className="text-gray-400" />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-sm font-bold text-blue-700">
              {worker?.firstName?.[0]}
              {worker?.lastName?.[0]}
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-800">
                {worker?.firstName} {worker?.lastName}
              </p>
              <p className="text-xs text-gray-500">{worker?.type}</p>
            </div>
          </div>
          <div className="responsive-grid grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs text-gray-500 mb-0.5">Type</p>
              <span
                className={`px-2 py-0.5 rounded text-xs font-medium ${colors.bg} ${colors.text} border ${colors.border}`}
              >
                {colors.label}
              </span>
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-0.5">Status</p>
              <span
                className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium w-fit ${statusInfo.color}`}
                style={{ backgroundColor: statusInfo.backgroundColor }}
              >
                {statusInfo.icon} {statusInfo.label}
              </span>
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-0.5">Date(s)</p>
              <p className="text-sm text-gray-800">
                {new Date(request.date + 'T00:00:00').toLocaleDateString(
                  'en-US',
                  { month: 'short', day: 'numeric' },
                )}
                {request.endDate &&
                  request.endDate !== request.date &&
                  ` - ${new Date(request.endDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-0.5">Time</p>
              <p className="text-sm text-gray-800">
                {request.startTime} - {request.endTime}
              </p>
            </div>
          </div>
          {request.reason && (
            <div>
              <p className="text-xs text-gray-500 mb-0.5">Reason</p>
              <p className="text-sm text-gray-700">{request.reason}</p>
            </div>
          )}
          <div>
            <p className="text-xs text-gray-500 mb-0.5">Submitted</p>
            <p className="text-sm text-gray-700">
              {new Date(request.createdAt).toLocaleString()}
            </p>
          </div>

          {isManager && request.status === pendingStatusValue && (
            <div className="flex gap-3 pt-2 border-t border-gray-200">
              <button
                onClick={onDeny}
                className="flex-1 px-4 py-2 border border-red-300 text-red-600 rounded-lg text-sm font-medium hover:bg-red-50 flex items-center justify-center gap-1.5"
              >
                <XCircle size={14} /> Deny
              </button>
              <button
                onClick={onApprove}
                className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 flex items-center justify-center gap-1.5"
              >
                <CheckCircle2 size={14} /> Approve
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AvailabilityCalendarView;
