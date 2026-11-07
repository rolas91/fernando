import React, { useState, useMemo } from 'react';
import { useAppContext } from '@/contexts/AppContext';
import { useToast } from '@/hooks/use-toast';
import { WorkOrder, Shift } from '@/lib/types';
import { formatAssignmentDateRangeShort } from '@/lib/workOrderShiftDateRange';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Search,
  Users,
  Clock,
  MapPin,
  ArrowUpDown,
  Eye,
  ChevronDown,
  ChevronRight,
  X,
  Truck,
  Filter,
  CalendarDays,
  Trash2,
  Plus,
} from 'lucide-react';

interface SchedulerListViewProps {
  onNavigateToTimeline: (date: Date, projectId?: string) => void;
  onOpenNewWO?: () => void;
}

const SchedulerListView: React.FC<SchedulerListViewProps> = ({
  onNavigateToTimeline,
  onOpenNewWO,
}) => {
  const {
    workOrders,
    getProjectById,
    getClientById,
    getWorkerById,
    equipment,
    updateWorkOrder,
    deleteWorkOrder,
  } = useAppContext();
  const { toast } = useToast();
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<'date' | 'project' | 'workers'>('date');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [selectedProject, setSelectedProject] = useState<string | null>(null);
  const [expandedShifts, setExpandedShifts] = useState<Set<string>>(new Set());
  const [selectedWO, setSelectedWO] = useState<string | null>(null);
  const [pendingDeleteWO, setPendingDeleteWO] = useState<{
    id: string;
    title: string;
  } | null>(null);

  const deleteAssignmentNow = async (assignment: {
    id: string;
    title: string;
  }) => {
    const result = await deleteWorkOrder(assignment.id);
    toast({
      title: result?.trashed ? 'Moved to Recycle Bin' : 'Assignment Deleted',
      description: result?.trashed
        ? `${assignment.title} can be restored from Assignments.`
        : `${assignment.title} was deleted.`,
    });
  };

  const handleAssignmentDeleteRequest = (wo: WorkOrder, title: string) => {
    const assignment = { id: wo.id, title };
    if ((wo.shifts ?? []).length > 0) {
      setPendingDeleteWO(assignment);
      return;
    }
    void deleteAssignmentNow(assignment);
  };

  const activeWOs = useMemo(() => {
    return workOrders.filter((wo) => {
      if (selectedProject && wo.projectId !== selectedProject) return false;
      if (search) {
        const project = getProjectById(wo.projectId);
        const client = project ? getClientById(project.clientId) : undefined;
        const q = search.toLowerCase();
        return (
          wo.title +
          (project?.name || '') +
          (client?.name || '') +
          (wo.orderNumber || '')
        )
          .toLowerCase()
          .includes(q);
      }
      return true;
    });
  }, [workOrders, search, selectedProject, getProjectById, getClientById]);

  const allShifts = useMemo(() => {
    const result: {
      shift: Shift;
      wo: WorkOrder;
      projectName: string;
      clientName: string;
    }[] = [];
    activeWOs.forEach((wo) => {
      const project = getProjectById(wo.projectId);
      const client = project ? getClientById(project.clientId) : undefined;
      wo.shifts.forEach((s) => {
        result.push({
          shift: s,
          wo,
          projectName: project?.name || wo.title,
          clientName: client?.name || '',
        });
      });
    });

    result.sort((a, b) => {
      let cmp = 0;
      if (sortBy === 'date') cmp = a.shift.date.localeCompare(b.shift.date);
      else if (sortBy === 'project')
        cmp = a.projectName.localeCompare(b.projectName);
      else if (sortBy === 'workers') {
        const aW = a.shift.roles.reduce(
          (acc, r) => acc + r.assignedWorkers.length,
          0,
        );
        const bW = b.shift.roles.reduce(
          (acc, r) => acc + r.assignedWorkers.length,
          0,
        );
        cmp = aW - bW;
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });

    return result;
  }, [activeWOs, sortBy, sortDir, getProjectById, getClientById]);

  const toggleSort = (field: typeof sortBy) => {
    if (sortBy === field)
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    else {
      setSortBy(field);
      setSortDir('asc');
    }
  };

  const toggleExpand = (id: string) => {
    setExpandedShifts((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const roleColor = (role: string) => {
    switch (role) {
      case 'Foreman':
        return 'bg-purple-100 text-purple-700';
      case 'Flagger':
        return 'bg-blue-100 text-blue-700';
      case 'Traffic Controller':
        return 'bg-teal-100 text-teal-700';
      case 'Truck Driver':
        return 'bg-orange-100 text-orange-700';
      default:
        return 'bg-gray-100 text-gray-700';
    }
  };

  const formatTime = (t: string) => {
    const [h, m] = t.split(':');
    const hr = parseInt(h);
    return `${hr > 12 ? hr - 12 : hr || 12}:${m}${hr >= 12 ? 'PM' : 'AM'}`;
  };

  const groupedByDate = useMemo(() => {
    const groups: Record<string, typeof allShifts> = {};
    allShifts.forEach((item) => {
      if (!groups[item.shift.date]) groups[item.shift.date] = [];
      groups[item.shift.date].push(item);
    });
    return Object.entries(groups).sort(([a], [b]) =>
      sortDir === 'asc' ? a.localeCompare(b) : b.localeCompare(a),
    );
  }, [allShifts, sortDir]);

  return (
    <div className="h-full flex flex-col">
      {}
      <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between flex-shrink-0 flex-wrap gap-3">
        <div className="text-sm font-medium text-gray-600">
          {workOrders.length} assignments
        </div>

        <div className="flex items-center gap-3">
          <select
            value={selectedProject || ''}
            onChange={(e) => setSelectedProject(e.target.value || null)}
            className="text-sm border border-gray-200 rounded-lg px-2 py-1.5 bg-white"
          >
            <option value="">All Projects</option>
            {Array.from(new Set(workOrders.map((wo) => wo.projectId))).map(
              (pid) => {
                const p = getProjectById(pid);
                return (
                  <option key={pid} value={pid}>
                    {p ? `#${p.number} - ${p.name}` : pid}
                  </option>
                );
              },
            )}
          </select>
          <div className="flex items-center bg-gray-100 rounded-lg px-3 py-1.5">
            <Search size={14} className="text-gray-400 mr-2" />
            <input
              placeholder="Search..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="bg-transparent text-sm outline-none w-40"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="p-0.5 hover:bg-gray-200 rounded"
              >
                <X size={12} className="text-gray-400" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-1">
            {[
              { key: 'date' as const, label: 'Date' },
              { key: 'project' as const, label: 'Project' },
              { key: 'workers' as const, label: 'Workers' },
            ].map((s) => (
              <button
                key={s.key}
                onClick={() => toggleSort(s.key)}
                className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium ${
                  sortBy === s.key
                    ? 'bg-blue-50 text-primary'
                    : 'text-gray-500 hover:bg-gray-100'
                }`}
              >
                <ArrowUpDown size={10} /> {s.label}
                {sortBy === s.key && (
                  <span className="text-blue-400">
                    {sortDir === 'asc' ? '↑' : '↓'}
                  </span>
                )}
              </button>
            ))}
          </div>
          {onOpenNewWO && (
            <button
              onClick={onOpenNewWO}
              className="px-3 py-1.5 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 flex items-center gap-1.5 shadow-sm transition-all"
            >
              <Plus size={14} /> New Assignment
            </button>
          )}
        </div>
      </div>

      {}
      <div className="flex-1 overflow-auto p-4">
        <div className="space-y-4">
          {groupedByDate.map(([date, shifts]) => {
            const d = new Date(date + 'T12:00:00');
            const totalWorkers = new Set<string>();
            shifts.forEach(({ shift }) =>
              shift.roles.forEach((r) =>
                r.assignedWorkers.forEach((wid) => totalWorkers.add(wid)),
              ),
            );

            return (
              <div
                key={date}
                className="bg-white rounded-xl border border-gray-200 overflow-hidden"
              >
                {}
                <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between flex-wrap gap-3">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2">
                      <CalendarDays size={14} className="text-primary" />
                      <span className="font-semibold text-gray-800">
                        {d.toLocaleDateString('en-US', {
                          weekday: 'long',
                          month: 'long',
                          day: 'numeric',
                        })}
                      </span>
                    </div>
                    <span className="text-xs text-gray-500 bg-gray-200 px-2 py-0.5 rounded-full">
                      {shifts.length} shifts
                    </span>
                    <span className="text-xs text-green-600 font-medium">
                      {totalWorkers.size} workers
                    </span>
                  </div>
                  <button
                    onClick={() => onNavigateToTimeline(d)}
                    className="text-xs text-primary hover:text-primary/90 flex items-center gap-1 px-2 py-1 bg-blue-50 rounded-lg hover:bg-primary/15"
                  >
                    <Eye size={12} /> Timeline
                  </button>
                </div>

                {}
                <div className="divide-y divide-gray-100">
                  {shifts.map(({ shift, wo, projectName, clientName }) => {
                    const isExpanded = expandedShifts.has(shift.id);
                    const totalA = shift.roles.reduce(
                      (a, r) => a + r.assignedWorkers.length,
                      0,
                    );
                    const totalR = shift.roles.reduce(
                      (a, r) => a + r.requiredCount,
                      0,
                    );
                    const project = getProjectById(wo.projectId);

                    return (
                      <div key={shift.id}>
                        <button
                          onClick={() => toggleExpand(shift.id)}
                          className="w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors flex items-center gap-4"
                        >
                          {isExpanded ? (
                            <ChevronDown size={14} className="text-gray-400" />
                          ) : (
                            <ChevronRight size={14} className="text-gray-400" />
                          )}
                          <div className="h-2.5 w-2.5 shrink-0 rounded-full bg-gray-400" />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-gray-800">
                                {projectName}
                              </span>
                              {wo.orderNumber && (
                                <span className="text-xs font-mono text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">
                                  {wo.orderNumber}
                                </span>
                              )}
                              <span className="rounded border border-gray-200 bg-gray-50 px-1.5 py-0.5 text-xs font-medium text-gray-700 tabular-nums">
                                {formatAssignmentDateRangeShort(wo)}
                              </span>
                            </div>
                            <p className="text-xs text-gray-500 truncate mt-0.5">
                              {wo.title}
                            </p>
                            <div className="flex items-center gap-3 text-xs text-gray-500 mt-0.5">
                              <span>{clientName}</span>
                              <span className="flex items-center gap-1">
                                <MapPin size={10} /> {project?.city}
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 text-xs text-gray-500">
                            <Clock size={12} />
                            <span>
                              {formatTime(shift.startTime)} -{' '}
                              {formatTime(shift.endTime)}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5 min-w-[60px] justify-end">
                            <Users size={12} className="text-gray-400" />
                            <span
                              className={`text-sm font-bold ${totalA >= totalR ? 'text-green-600' : 'text-red-600'}`}
                            >
                              {totalA}/{totalR}
                            </span>
                          </div>
                          <div className="flex -space-x-1 min-w-[80px] justify-end">
                            {shift.roles
                              .flatMap((r) => r.assignedWorkers)
                              .slice(0, 4)
                              .map((wid) => {
                                const w = getWorkerById(wid);
                                return w ? (
                                  <div
                                    key={wid}
                                    className="w-6 h-6 rounded-full bg-blue-500 border-2 border-white flex items-center justify-center text-white text-xs font-bold"
                                    title={`${w.firstName} ${w.lastName}`}
                                  >
                                    {w.firstName[0]}
                                  </div>
                                ) : null;
                              })}
                          </div>
                        </button>

                        {isExpanded && (
                          <div className="px-4 pb-3 pt-1 ml-10 bg-gray-50/50">
                            <div className="flex items-center gap-2 mb-2">
                              <span className="rounded border border-gray-200 bg-gray-50 px-2 py-1 text-xs font-medium text-gray-700 tabular-nums">
                                {formatAssignmentDateRangeShort(wo)}
                              </span>
                              <button
                                onClick={() => {
                                  handleAssignmentDeleteRequest(
                                    wo,
                                    projectName,
                                  );
                                }}
                                className="text-xs bg-red-50 px-2 py-1 rounded text-red-600 hover:bg-red-100 flex items-center gap-1"
                              >
                                <Trash2 size={10} /> Delete
                              </button>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                              {shift.roles.map((role) => (
                                <div
                                  key={role.id}
                                  className="bg-white rounded-lg border border-gray-200 p-2.5"
                                >
                                  <div className="flex items-center justify-between mb-1.5 flex-wrap gap-3">
                                    <span
                                      className={`text-xs font-semibold px-1.5 py-0.5 rounded ${roleColor(role.roleName)}`}
                                    >
                                      {role.roleName}
                                    </span>
                                    <span
                                      className={`text-xs font-bold ${role.assignedWorkers.length >= role.requiredCount ? 'text-green-600' : 'text-red-600'}`}
                                    >
                                      {role.assignedWorkers.length}/
                                      {role.requiredCount}
                                    </span>
                                  </div>
                                  {role.assignedWorkers.map((wid) => {
                                    const w = getWorkerById(wid);
                                    return w ? (
                                      <div
                                        key={wid}
                                        className="flex items-center gap-1.5 py-0.5"
                                      >
                                        <div className="w-5 h-5 rounded-full bg-blue-500 flex items-center justify-center text-white text-[9px] font-bold">
                                          {w.firstName[0]}
                                          {w.lastName[0]}
                                        </div>
                                        <span className="text-xs text-gray-700">
                                          {w.firstName} {w.lastName}
                                        </span>
                                      </div>
                                    ) : null;
                                  })}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {groupedByDate.length === 0 && (
            <div className="text-center py-16 text-gray-400">
              <CalendarDays size={40} className="mx-auto mb-2 opacity-50" />
              <p>No shifts found</p>
            </div>
          )}
        </div>
      </div>

      <AlertDialog
        open={!!pendingDeleteWO}
        onOpenChange={(open) => !open && setPendingDeleteWO(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Move Assignment to Recycle Bin?</AlertDialogTitle>
            <AlertDialogDescription>
              {`"${pendingDeleteWO?.title}" will be removed from Schedule and can be restored later.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={async () => {
                if (!pendingDeleteWO) return;
                await deleteAssignmentNow(pendingDeleteWO);
                setPendingDeleteWO(null);
              }}
            >
              Move to Recycle Bin
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default SchedulerListView;
