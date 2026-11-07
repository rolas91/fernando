import React, { useState, useMemo } from 'react';
import { useAppContext } from '@/contexts/AppContext';
import { WorkOrder, Shift } from '@/lib/types';

import {
  ChevronLeft,
  ChevronRight,
  Users,
  Truck,
  Calendar,
  MapPin,
  Clock,
  FolderKanban,
  FileText,
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Package,
  User,
  CalendarDays,
  Eye,
} from 'lucide-react';

interface ProjectDetailPanelProps {
  projectId: string;
  onClose: () => void;
  onNavigateToDate: (date: Date) => void;
}

type ViewTab = 'calendar' | 'workers' | 'assets' | 'orders';

const startOfWeek = (date: Date) => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day));
  return d;
};

const ProjectDetailPanel: React.FC<ProjectDetailPanelProps> = ({
  projectId,
  onClose,
  onNavigateToDate,
}) => {
  const {
    getProjectById,
    getClientById,
    workOrders,
    getWorkerById,
    equipment,
    setCurrentPage,
  } = useAppContext();

  const project = getProjectById(projectId);
  const client = project ? getClientById(project.clientId) : undefined;

  const [activeTab, setActiveTab] = useState<ViewTab>('calendar');
  const [calendarWeekStart, setCalendarWeekStart] = useState<Date>(() =>
    startOfWeek(new Date()),
  );
  const [expandedOrders, setExpandedOrders] = useState<Set<string>>(new Set());
  const [calendarMode, setCalendarMode] = useState<'week' | 'month'>('week');

  const projectWorkOrders = useMemo(() => {
    return workOrders.filter((wo) => wo.projectId === projectId);
  }, [workOrders, projectId]);

  const allProjectShifts = useMemo(() => {
    const shifts: { shift: Shift; workOrder: WorkOrder }[] = [];
    projectWorkOrders.forEach((wo) => {
      wo.shifts.forEach((s) => {
        shifts.push({ shift: s, workOrder: wo });
      });
    });
    return shifts;
  }, [projectWorkOrders]);

  const calendarDays = useMemo(() => {
    if (calendarMode === 'week') {
      return Array.from({ length: 7 }, (_, i) => {
        const d = new Date(calendarWeekStart);
        d.setDate(d.getDate() + i);
        return d;
      });
    } else {
      const monthStart = new Date(
        calendarWeekStart.getFullYear(),
        calendarWeekStart.getMonth(),
        1,
      );
      const startDay = monthStart.getDay();
      const daysInMonth = new Date(
        calendarWeekStart.getFullYear(),
        calendarWeekStart.getMonth() + 1,
        0,
      ).getDate();
      const days: Date[] = [];

      for (let i = startDay - 1; i >= 0; i--) {
        const d = new Date(monthStart);
        d.setDate(d.getDate() - i - 1);
        days.push(d);
      }

      for (let i = 1; i <= daysInMonth; i++) {
        days.push(
          new Date(
            calendarWeekStart.getFullYear(),
            calendarWeekStart.getMonth(),
            i,
          ),
        );
      }

      while (days.length % 7 !== 0) {
        const last = days[days.length - 1];
        const d = new Date(last);
        d.setDate(d.getDate() + 1);
        days.push(d);
      }
      return days;
    }
  }, [calendarWeekStart, calendarMode]);

  const getShiftsForDate = (date: Date) => {
    const dateStr = date.toISOString().split('T')[0];
    return allProjectShifts.filter((s) => s.shift.date === dateStr);
  };

  const allAssignedWorkers = useMemo(() => {
    const workerIds = new Set<string>();
    allProjectShifts.forEach(({ shift }) => {
      shift.roles.forEach((r) => {
        r.assignedWorkers.forEach((wid) => workerIds.add(wid));
      });
    });
    return Array.from(workerIds)
      .map((id) => getWorkerById(id))
      .filter(Boolean);
  }, [allProjectShifts, getWorkerById]);

  const allAssignedEquipment = useMemo(() => {
    const plannedByType = new Map<
      string,
      { id: string; name: string; identifier: string }
    >();
    allProjectShifts.forEach(({ shift }) => {
      (shift.plannedEquipment || []).forEach((resource) => {
        plannedByType.set(resource.type, {
          id: resource.type,
          name: resource.type,
          identifier: `${resource.estimatedQuantity} planned`,
        });
      });
    });
    return [...plannedByType.values()];
  }, [allProjectShifts]);

  const workerScheduleByDate = useMemo(() => {
    const map: Record<
      string,
      {
        workers: { id: string; name: string; role: string; time: string }[];
        equipment: { id: string; name: string; identifier: string }[];
      }
    > = {};
    calendarDays.forEach((d) => {
      const dateStr = d.toISOString().split('T')[0];
      const shifts = getShiftsForDate(d);
      const workers: {
        id: string;
        name: string;
        role: string;
        time: string;
      }[] = [];
      const equips: { id: string; name: string; identifier: string }[] = [];
      const seenWorkers = new Set<string>();
      const seenEquip = new Set<string>();

      shifts.forEach(({ shift }) => {
        shift.roles.forEach((role) => {
          role.assignedWorkers.forEach((wid) => {
            if (!seenWorkers.has(wid)) {
              seenWorkers.add(wid);
              const w = getWorkerById(wid);
              if (w) {
                workers.push({
                  id: w.id,
                  name: `${w.firstName} ${w.lastName}`,
                  role: role.roleName,
                  time: `${shift.startTime}-${shift.endTime}`,
                });
              }
            }
          });
        });
        (shift.plannedEquipment || []).forEach((resource) => {
          if (seenEquip.has(resource.type)) return;
          seenEquip.add(resource.type);
          equips.push({
            id: resource.type,
            name: resource.type,
            identifier: `${resource.estimatedQuantity} planned`,
          });
        });
      });

      map[dateStr] = { workers, equipment: equips };
    });
    return map;
  }, [calendarDays, allProjectShifts, getWorkerById, equipment]);

  const navigateCalendar = (dir: number) => {
    setCalendarWeekStart((prev) => {
      const d = new Date(prev);
      if (calendarMode === 'week') {
        d.setDate(d.getDate() + dir * 7);
      } else {
        d.setMonth(d.getMonth() + dir);
      }
      return d;
    });
  };

  const goToToday = () => {
    setCalendarWeekStart(startOfWeek(new Date()));
  };

  const statusColor = (status: string) => {
    switch (status) {
      case 'confirmed':
        return 'bg-green-100 text-green-700 border-green-200';
      case 'in_progress':
        return 'bg-blue-100 text-blue-700 border-blue-200';
      case 'pending':
        return 'bg-yellow-100 text-yellow-700 border-yellow-200';
      case 'completed':
        return 'bg-gray-100 text-gray-700 border-gray-200';
      default:
        return 'bg-gray-100 text-gray-600 border-gray-200';
    }
  };

  const statusDot = (status: string) => {
    switch (status) {
      case 'confirmed':
        return 'bg-green-500';
      case 'in_progress':
        return 'bg-blue-500';
      case 'pending':
        return 'bg-yellow-500';
      default:
        return 'bg-gray-400';
    }
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

  const formatTime = (time: string) => {
    const [h, m] = time.split(':');
    const hour = parseInt(h);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
    return `${displayHour}:${m} ${ampm}`;
  };

  if (!project) return null;

  const totalShifts = allProjectShifts.length;
  const totalRequired = allProjectShifts.reduce(
    (acc, { shift }) =>
      acc + shift.roles.reduce((a, r) => a + r.requiredCount, 0),
    0,
  );
  const totalAssigned = allProjectShifts.reduce(
    (acc, { shift }) =>
      acc + shift.roles.reduce((a, r) => a + r.assignedWorkers.length, 0),
    0,
  );
  const fillRate =
    totalRequired > 0 ? Math.round((totalAssigned / totalRequired) * 100) : 0;

  return (
    <div className="w-full h-full flex flex-col bg-white">
      {}
      <div className="flex-shrink-0 border-b border-gray-200">
        <div className="px-4 py-3">
          <div className="flex items-center gap-2 mb-2">
            <button
              onClick={onClose}
              className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
              title="Back to all projects"
            >
              <ArrowLeft size={16} className="text-gray-500" />
            </button>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <FolderKanban
                  size={16}
                  className="text-primary flex-shrink-0"
                />
                <h2 className="text-sm font-bold text-gray-900 truncate">
                  {project.name}
                </h2>
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-xs text-gray-500 font-mono">
                  #{project.number}
                </span>
                <span
                  className={`text-xs px-1.5 py-0.5 rounded-full border capitalize ${statusColor(project.status)}`}
                >
                  {project.status.replace('_', ' ')}
                </span>
              </div>
            </div>
            <button
              onClick={() => setCurrentPage('projects')}
              className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
              title="Open full project page"
            >
              <ExternalLink size={14} className="text-gray-400" />
            </button>
          </div>

          {}
          <div className="responsive-grid grid grid-cols-2 gap-x-3 gap-y-1 text-xs mt-2 bg-gray-50 rounded-lg p-2.5">
            <div className="flex items-center gap-1.5">
              <User size={10} className="text-gray-400" />
              <span className="text-gray-500">Client:</span>
              <span className="text-gray-700 font-medium truncate">
                {client?.name || '-'}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <MapPin size={10} className="text-gray-400" />
              <span className="text-gray-500">Location:</span>
              <span className="text-gray-700 font-medium truncate">
                {project.location}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <Calendar size={10} className="text-gray-400" />
              <span className="text-gray-500">Start:</span>
              <span className="text-gray-700 font-medium">
                {new Date(project.startDate).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                })}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <Calendar size={10} className="text-gray-400" />
              <span className="text-gray-500">End:</span>
              <span className="text-gray-700 font-medium">
                {new Date(project.endDate).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                })}
              </span>
            </div>
          </div>

          {}
          <div className="flex items-center gap-3 mt-2.5">
            <div className="flex items-center gap-1.5 bg-blue-50 px-2 py-1 rounded-md">
              <FileText size={10} className="text-primary" />
              <span className="text-xs font-medium text-blue-700">
                {projectWorkOrders.length} Orders
              </span>
            </div>
            <div className="flex items-center gap-1.5 bg-green-50 px-2 py-1 rounded-md">
              <Users size={10} className="text-green-600" />
              <span className="text-xs font-medium text-green-700">
                {allAssignedWorkers.length} Workers
              </span>
            </div>
            <div className="flex items-center gap-1.5 bg-orange-50 px-2 py-1 rounded-md">
              <Package size={10} className="text-orange-600" />
              <span className="text-xs font-medium text-orange-700">
                {allAssignedEquipment.length} Assets
              </span>
            </div>
            <div
              className={`flex items-center gap-1.5 px-2 py-1 rounded-md ${fillRate >= 80 ? 'bg-green-50' : fillRate >= 50 ? 'bg-yellow-50' : 'bg-red-50'}`}
            >
              <span
                className={`text-xs font-bold ${fillRate >= 80 ? 'text-green-700' : fillRate >= 50 ? 'text-yellow-700' : 'text-red-700'}`}
              >
                {fillRate}% filled
              </span>
            </div>
          </div>
        </div>

        {}
        <div className="flex border-t border-gray-100 px-2">
          {[
            {
              id: 'calendar' as ViewTab,
              label: 'Calendar',
              icon: CalendarDays,
            },
            { id: 'workers' as ViewTab, label: 'Workers', icon: Users },
            { id: 'assets' as ViewTab, label: 'Assets', icon: Package },
            { id: 'orders' as ViewTab, label: 'Orders', icon: FileText },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'text-primary border-blue-600'
                  : 'text-gray-500 border-transparent hover:text-gray-700'
              }`}
            >
              <tab.icon size={12} />
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {}
      <div className="flex-1 overflow-y-auto">
        {activeTab === 'calendar' && (
          <CalendarTab
            calendarDays={calendarDays}
            calendarMode={calendarMode}
            setCalendarMode={setCalendarMode}
            calendarWeekStart={calendarWeekStart}
            navigateCalendar={navigateCalendar}
            goToToday={goToToday}
            workerScheduleByDate={workerScheduleByDate}
            getShiftsForDate={getShiftsForDate}
            onNavigateToDate={onNavigateToDate}
            roleColor={roleColor}
            formatTime={formatTime}
            statusDot={statusDot}
            projectWorkOrders={projectWorkOrders}
          />
        )}
        {activeTab === 'workers' && (
          <WorkersTab
            workers={allAssignedWorkers}
            allProjectShifts={allProjectShifts}
            getWorkerById={getWorkerById}
            roleColor={roleColor}
          />
        )}
        {activeTab === 'assets' && (
          <AssetsTab
            equipment={allAssignedEquipment}
            allProjectShifts={allProjectShifts}
          />
        )}
        {activeTab === 'orders' && (
          <OrdersTab
            workOrders={projectWorkOrders}
            expandedOrders={expandedOrders}
            setExpandedOrders={setExpandedOrders}
            getWorkerById={getWorkerById}
            equipment={equipment}
            statusDot={statusDot}
            statusColor={statusColor}
            roleColor={roleColor}
            formatTime={formatTime}
            onNavigateToDate={onNavigateToDate}
          />
        )}
      </div>
    </div>
  );
};

const CalendarTab: React.FC<{
  calendarDays: Date[];
  calendarMode: 'week' | 'month';
  setCalendarMode: (m: 'week' | 'month') => void;
  calendarWeekStart: Date;
  navigateCalendar: (dir: number) => void;
  goToToday: () => void;
  workerScheduleByDate: Record<
    string,
    {
      workers: { id: string; name: string; role: string; time: string }[];
      equipment: { id: string; name: string; identifier: string }[];
    }
  >;
  getShiftsForDate: (date: Date) => { shift: Shift; workOrder: WorkOrder }[];
  onNavigateToDate: (date: Date) => void;
  roleColor: (role: string) => string;
  formatTime: (time: string) => string;
  statusDot: (status: string) => string;
  projectWorkOrders: WorkOrder[];
}> = ({
  calendarDays,
  calendarMode,
  setCalendarMode,
  calendarWeekStart,
  navigateCalendar,
  goToToday,
  workerScheduleByDate,
  getShiftsForDate,
  onNavigateToDate,
  roleColor,
  formatTime,
  statusDot,
  projectWorkOrders,
}) => {
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const today = useMemo(() => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    return now.toISOString().split('T')[0];
  }, []);

  const handleDateClick = (date: Date) => {
    const dateStr = date.toISOString().split('T')[0];
    setSelectedDate((prev) => (prev === dateStr ? null : dateStr));
  };

  const handleNavigateScheduler = (date: Date) => {
    onNavigateToDate(date);
  };

  return (
    <div className="p-3">
      {}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-1">
          <button
            onClick={() => navigateCalendar(-1)}
            className="p-1.5 hover:bg-gray-100 rounded-lg"
          >
            <ChevronLeft size={14} className="text-gray-500" />
          </button>
          <button
            onClick={goToToday}
            className="px-2 py-1 text-xs text-primary hover:bg-primary/10 rounded-lg font-medium"
          >
            Today
          </button>
          <button
            onClick={() => navigateCalendar(1)}
            className="p-1.5 hover:bg-gray-100 rounded-lg"
          >
            <ChevronRight size={14} className="text-gray-500" />
          </button>
        </div>
        <span className="text-xs font-semibold text-gray-700">
          {calendarMode === 'week'
            ? `${calendarWeekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${new Date(calendarWeekStart.getTime() + 6 * 86400000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
            : calendarWeekStart.toLocaleDateString('en-US', {
                month: 'long',
                year: 'numeric',
              })}
        </span>
        <div className="flex items-center bg-gray-100 rounded-lg p-0.5">
          <button
            onClick={() => setCalendarMode('week')}
            className={`px-2 py-1 text-xs rounded-md transition-colors ${calendarMode === 'week' ? 'bg-white shadow-sm text-primary font-medium' : 'text-gray-500 hover:text-gray-700'}`}
          >
            Week
          </button>
          <button
            onClick={() => setCalendarMode('month')}
            className={`px-2 py-1 text-xs rounded-md transition-colors ${calendarMode === 'month' ? 'bg-white shadow-sm text-primary font-medium' : 'text-gray-500 hover:text-gray-700'}`}
          >
            Month
          </button>
        </div>
      </div>

      {calendarMode === 'week' ? (
        <div className="space-y-1.5">
          {calendarDays.map((d) => {
            const dateStr = d.toISOString().split('T')[0];
            const schedule = workerScheduleByDate[dateStr] || {
              workers: [],
              equipment: [],
            };
            const shifts = getShiftsForDate(d);
            const isToday = dateStr === today;
            const isWeekend = d.getDay() === 0 || d.getDay() === 6;
            const isSelected = selectedDate === dateStr;
            const hasData =
              schedule.workers.length > 0 || schedule.equipment.length > 0;

            return (
              <div key={dateStr}>
                <button
                  onClick={() => handleDateClick(d)}
                  className={`w-full text-left rounded-lg border transition-all ${
                    isSelected
                      ? 'border-blue-300 bg-blue-50 shadow-sm'
                      : isToday
                        ? 'border-blue-200 bg-blue-50/50'
                        : hasData
                          ? 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                          : 'border-gray-100 hover:border-gray-200 bg-gray-50/50'
                  }`}
                >
                  <div className="flex items-center justify-between px-3 py-2">
                    <div className="flex items-center gap-2">
                      <div
                        className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold ${
                          isToday
                            ? 'bg-primary text-primary-foreground'
                            : isWeekend
                              ? 'bg-gray-200 text-gray-500'
                              : 'bg-gray-100 text-gray-700'
                        }`}
                      >
                        {d.getDate()}
                      </div>
                      <div>
                        <span
                          className={`text-xs font-semibold ${isToday ? 'text-primary' : isWeekend ? 'text-gray-400' : 'text-gray-700'}`}
                        >
                          {d.toLocaleDateString('en-US', { weekday: 'short' })}
                        </span>
                        <span className="text-xs text-gray-400 ml-1.5">
                          {d.toLocaleDateString('en-US', { month: 'short' })}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {schedule.workers.length > 0 && (
                        <div className="flex items-center gap-1 bg-green-50 px-1.5 py-0.5 rounded">
                          <Users size={10} className="text-green-600" />
                          <span className="text-xs font-bold text-green-700">
                            {schedule.workers.length}
                          </span>
                        </div>
                      )}
                      {schedule.equipment.length > 0 && (
                        <div className="flex items-center gap-1 bg-orange-50 px-1.5 py-0.5 rounded">
                          <Truck size={10} className="text-orange-600" />
                          <span className="text-xs font-bold text-orange-700">
                            {schedule.equipment.length}
                          </span>
                        </div>
                      )}
                      {!hasData && (
                        <span className="text-xs text-gray-400 italic">
                          No assignments
                        </span>
                      )}
                      {isSelected ? (
                        <ChevronUp size={12} className="text-gray-400" />
                      ) : (
                        <ChevronDown size={12} className="text-gray-400" />
                      )}
                    </div>
                  </div>

                  {}
                  {shifts.length > 0 && !isSelected && (
                    <div className="px-3 pb-2 flex flex-wrap gap-1">
                      {shifts.map(({ shift, workOrder }) => (
                        <span
                          key={shift.id}
                          className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded flex items-center gap-1"
                        >
                          {formatTime(shift.startTime)}-
                          {formatTime(shift.endTime)}
                        </span>
                      ))}
                    </div>
                  )}
                </button>

                {}
                {isSelected && hasData && (
                  <div className="ml-2 mt-1 mb-2 border-l-2 border-blue-300 pl-3 space-y-2">
                    {}
                    <button
                      onClick={() => handleNavigateScheduler(d)}
                      className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/90 font-medium hover:underline"
                    >
                      <Eye size={12} />
                      View in Schedule
                    </button>

                    {}
                    {shifts.map(({ shift, workOrder }) => (
                      <div
                        key={shift.id}
                        className="bg-white border border-gray-200 rounded-lg p-2.5"
                      >
                        <div className="flex items-center justify-between mb-1.5">
                          <div className="flex items-center gap-1.5">
                            <Clock size={10} className="text-gray-400" />
                            <span className="text-xs font-semibold text-gray-700">
                              {formatTime(shift.startTime)} -{' '}
                              {formatTime(shift.endTime)}
                            </span>
                          </div>
                        </div>

                        {shift.roles.map((role) => (
                          <div key={role.id} className="mt-1.5">
                            <div className="flex items-center justify-between mb-1">
                              <span
                                className={`text-xs px-1.5 py-0.5 rounded font-medium ${roleColor(role.roleName)}`}
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

                            {}
                            {role.assignedWorkers.map((wid) => {
                              const w = schedule.workers.find(
                                (sw) => sw.id === wid,
                              );
                              return (
                                <div
                                  key={wid}
                                  className="flex items-center gap-1.5 py-0.5 ml-2"
                                >
                                  <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
                                  <span className="text-xs text-gray-700">
                                    {w?.name || wid}
                                  </span>
                                </div>
                              );
                            })}

                            {role.assignedWorkers.length <
                              role.requiredCount && (
                              <div className="ml-2 mt-0.5">
                                <span className="text-xs text-red-500 italic">
                                  Needs{' '}
                                  {role.requiredCount -
                                    role.assignedWorkers.length}{' '}
                                  more
                                </span>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                )}

                {isSelected && !hasData && (
                  <div className="ml-2 mt-1 mb-2 border-l-2 border-gray-200 pl-3">
                    <p className="text-xs text-gray-400 italic py-2">
                      No shifts assigned for this date
                    </p>
                    <button
                      onClick={() => handleNavigateScheduler(d)}
                      className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/90 font-medium hover:underline"
                    >
                      <Eye size={12} />
                      View in Schedule
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div>
          <div className="grid grid-cols-7 gap-0.5 mb-1">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
              <div
                key={d}
                className="text-center text-xs font-semibold text-gray-400 py-1"
              >
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-0.5">
            {calendarDays.map((d, i) => {
              const dateStr = d.toISOString().split('T')[0];
              const schedule = workerScheduleByDate[dateStr] || {
                workers: [],
                equipment: [],
              };
              const isToday = dateStr === today;
              const isCurrentMonth =
                d.getMonth() === calendarWeekStart.getMonth();
              const hasData =
                schedule.workers.length > 0 || schedule.equipment.length > 0;

              return (
                <button
                  key={i}
                  onClick={() => {
                    handleDateClick(d);
                    if (hasData) handleNavigateScheduler(d);
                  }}
                  className={`aspect-square rounded-lg border flex flex-col items-center justify-center gap-0.5 transition-all ${
                    isToday
                      ? 'border-blue-300 bg-blue-50'
                      : hasData
                        ? 'border-gray-200 hover:border-blue-300 hover:bg-primary/10/30'
                        : isCurrentMonth
                          ? 'border-gray-100 hover:border-gray-200'
                          : 'border-transparent opacity-40'
                  }`}
                >
                  <span
                    className={`text-xs font-bold ${isToday ? 'text-primary' : isCurrentMonth ? 'text-gray-700' : 'text-gray-400'}`}
                  >
                    {d.getDate()}
                  </span>
                  {hasData && (
                    <div className="flex items-center gap-0.5">
                      {schedule.workers.length > 0 && (
                        <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
                      )}
                      {schedule.equipment.length > 0 && (
                        <div className="w-1.5 h-1.5 rounded-full bg-orange-500" />
                      )}
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          {}
          {selectedDate &&
            (() => {
              const d = new Date(selectedDate + 'T12:00:00');
              const schedule = workerScheduleByDate[selectedDate] || {
                workers: [],
                equipment: [],
              };
              const shifts = getShiftsForDate(d);
              const hasData =
                schedule.workers.length > 0 || schedule.equipment.length > 0;

              return (
                <div className="mt-3 border-t border-gray-200 pt-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-gray-700">
                      {d.toLocaleDateString('en-US', {
                        weekday: 'long',
                        month: 'long',
                        day: 'numeric',
                      })}
                    </span>
                    <button
                      onClick={() => handleNavigateScheduler(d)}
                      className="flex items-center gap-1 text-xs text-primary hover:text-primary/90 font-medium"
                    >
                      <Eye size={12} />
                      View in Schedule
                    </button>
                  </div>
                  {hasData ? (
                    <div className="space-y-1.5">
                      {schedule.workers.map((w) => (
                        <div
                          key={w.id}
                          className="flex items-center gap-2 bg-gray-50 rounded-lg px-2.5 py-1.5"
                        >
                          <div className="w-6 h-6 rounded-full bg-blue-500 flex items-center justify-center text-white text-xs font-bold">
                            {w.name
                              .split(' ')
                              .map((n) => n[0])
                              .join('')}
                          </div>
                          <div className="flex-1 min-w-0">
                            <span className="text-xs font-medium text-gray-800">
                              {w.name}
                            </span>
                          </div>
                          <span
                            className={`text-xs px-1.5 py-0.5 rounded ${roleColor(w.role)}`}
                          >
                            {w.role}
                          </span>
                          <span className="text-xs text-gray-500">
                            {w.time}
                          </span>
                        </div>
                      ))}
                      {schedule.equipment.map((eq) => (
                        <div
                          key={eq.id}
                          className="flex items-center gap-2 bg-orange-50 rounded-lg px-2.5 py-1.5"
                        >
                          <Truck size={14} className="text-orange-500" />
                          <span className="text-xs font-medium text-gray-700">
                            {eq.identifier} - {eq.name}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-gray-400 italic">
                      No assignments for this date
                    </p>
                  )}
                </div>
              );
            })()}
        </div>
      )}
    </div>
  );
};

const WorkersTab: React.FC<{
  workers: any[];
  allProjectShifts: { shift: Shift; workOrder: WorkOrder }[];
  getWorkerById: (id: string) => any;
  roleColor: (role: string) => string;
}> = ({ workers, allProjectShifts, getWorkerById, roleColor }) => {
  const workerHours = useMemo(() => {
    const hours: Record<
      string,
      { total: number; shifts: number; roles: Set<string> }
    > = {};
    allProjectShifts.forEach(({ shift }) => {
      shift.roles.forEach((role) => {
        role.assignedWorkers.forEach((wid) => {
          if (!hours[wid])
            hours[wid] = { total: 0, shifts: 0, roles: new Set() };
          const start =
            parseInt(shift.startTime.split(':')[0]) +
            parseInt(shift.startTime.split(':')[1]) / 60;
          const end =
            parseInt(shift.endTime.split(':')[0]) +
            parseInt(shift.endTime.split(':')[1]) / 60;
          hours[wid].total += end - start;
          hours[wid].shifts += 1;
          hours[wid].roles.add(role.roleName);
        });
      });
    });
    return hours;
  }, [allProjectShifts]);

  return (
    <div className="p-3">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold text-gray-500 uppercase">
          Assigned Workers ({workers.length})
        </span>
      </div>
      {workers.length === 0 ? (
        <p className="text-xs text-gray-400 italic text-center py-8">
          No workers assigned yet
        </p>
      ) : (
        <div className="space-y-1.5">
          {workers.map((w) => {
            if (!w) return null;
            const stats = workerHours[w.id] || {
              total: 0,
              shifts: 0,
              roles: new Set(),
            };
            return (
              <div
                key={w.id}
                className="bg-gray-50 rounded-lg p-2.5 border border-gray-100 hover:border-gray-200 transition-colors"
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                    {w.firstName[0]}
                    {w.lastName[0]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800">
                      {w.firstName} {w.lastName}
                    </p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span
                        className={`text-xs px-1.5 py-0.5 rounded ${roleColor(w.type)}`}
                      >
                        {w.type}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3 mt-2 ml-10">
                  <div className="text-xs text-gray-500">
                    <span className="font-semibold text-gray-700">
                      {stats.shifts}
                    </span>{' '}
                    shifts
                  </div>
                  <div className="text-xs text-gray-500">
                    <span className="font-semibold text-gray-700">
                      {stats.total.toFixed(1)}
                    </span>{' '}
                    hrs
                  </div>
                  {Array.from(stats.roles).map((r) => (
                    <span
                      key={r}
                      className={`text-xs px-1 py-0.5 rounded ${roleColor(r)}`}
                    >
                      {r}
                    </span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

const AssetsTab: React.FC<{
  equipment: any[];
  allProjectShifts: { shift: Shift; workOrder: WorkOrder }[];
}> = ({ equipment, allProjectShifts }) => {
  const equipUsage = useMemo(() => {
    const usage: Record<string, number> = {};
    allProjectShifts.forEach(({ shift }) => {
      (shift.plannedEquipment || []).forEach((resource) => {
        usage[resource.type] = (usage[resource.type] || 0) + 1;
      });
    });
    return usage;
  }, [allProjectShifts]);

  return (
    <div className="p-3">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold text-gray-500 uppercase">
          Assigned Assets ({equipment.length})
        </span>
      </div>
      {equipment.length === 0 ? (
        <p className="text-xs text-gray-400 italic text-center py-8">
          No equipment assigned yet
        </p>
      ) : (
        <div className="space-y-1.5">
          {equipment.map((eq) => {
            if (!eq) return null;
            const shifts = equipUsage[eq.id] || 0;
            return (
              <div
                key={eq.id}
                className="bg-gray-50 rounded-lg p-2.5 border border-gray-100 hover:border-gray-200 transition-colors"
              >
                <div className="flex items-center gap-2.5">
                  <div
                    className={`w-8 h-8 rounded-lg flex items-center justify-center text-white flex-shrink-0 ${
                      eq.status === 'available'
                        ? 'bg-green-500'
                        : eq.status === 'assigned'
                          ? 'bg-orange-500'
                          : eq.status === 'maintenance'
                            ? 'bg-red-500'
                            : 'bg-gray-400'
                    }`}
                  >
                    <Truck size={14} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800">
                      {eq.name}
                    </p>
                    <p className="text-xs text-gray-500">
                      {eq.identifier} · {eq.type}
                    </p>
                  </div>
                  <div className="text-xs text-gray-500">
                    <span className="font-semibold text-gray-700">
                      {shifts}
                    </span>{' '}
                    shifts
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

const OrdersTab: React.FC<{
  workOrders: WorkOrder[];
  expandedOrders: Set<string>;
  setExpandedOrders: React.Dispatch<React.SetStateAction<Set<string>>>;
  getWorkerById: (id: string) => any;
  equipment: any[];
  statusDot: (status: string) => string;
  statusColor: (status: string) => string;
  roleColor: (role: string) => string;
  formatTime: (time: string) => string;
  onNavigateToDate: (date: Date) => void;
}> = ({
  workOrders,
  expandedOrders,
  setExpandedOrders,
  getWorkerById,
  equipment,
  statusDot,
  statusColor,
  roleColor,
  formatTime,
  onNavigateToDate,
}) => {
  const toggleExpand = (id: string) => {
    setExpandedOrders((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="p-3">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold text-gray-500 uppercase">
          Assignments ({workOrders.length})
        </span>
      </div>
      {workOrders.length === 0 ? (
        <p className="text-xs text-gray-400 italic text-center py-8">
          No assignments for this project
        </p>
      ) : (
        <div className="space-y-2">
          {workOrders.map((wo) => {
            const isExpanded = expandedOrders.has(wo.id);
            const totalAssigned = wo.shifts.reduce(
              (acc, s) =>
                acc + s.roles.reduce((a, r) => a + r.assignedWorkers.length, 0),
              0,
            );
            const totalRequired = wo.shifts.reduce(
              (acc, s) =>
                acc + s.roles.reduce((a, r) => a + r.requiredCount, 0),
              0,
            );

            return (
              <div
                key={wo.id}
                className="border border-gray-200 rounded-lg overflow-hidden"
              >
                <button
                  onClick={() => toggleExpand(wo.id)}
                  className="w-full text-left px-3 py-2.5 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      {isExpanded ? (
                        <ChevronDown
                          size={12}
                          className="text-gray-400 flex-shrink-0"
                        />
                      ) : (
                        <ChevronRight
                          size={12}
                          className="text-gray-400 flex-shrink-0"
                        />
                      )}
                      <span className="text-sm font-medium text-gray-800 truncate">
                        {wo.title}
                      </span>
                    </div>
                    <span
                      className={`text-xs font-bold flex-shrink-0 ml-2 ${totalAssigned >= totalRequired ? 'text-green-600' : 'text-red-600'}`}
                    >
                      {totalAssigned}/{totalRequired}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-1 ml-6">
                    {wo.orderNumber && (
                      <span className="text-xs text-gray-400 font-mono">
                        {wo.orderNumber}
                      </span>
                    )}
                    <span className="text-xs text-gray-400">
                      {wo.shifts.length} shifts
                    </span>
                  </div>
                </button>

                {isExpanded && (
                  <div className="border-t border-gray-100 px-3 py-2 space-y-2 bg-gray-50/50">
                    <div className="text-xs text-gray-500">
                      {new Date(wo.startDate).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                      })}{' '}
                      -{' '}
                      {new Date(wo.endDate).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </div>
                    {wo.notes && (
                      <p className="text-xs text-gray-500 italic">{wo.notes}</p>
                    )}

                    {}
                    <div className="space-y-1.5">
                      {wo.shifts.map((shift) => (
                        <div
                          key={shift.id}
                          className="bg-white border border-gray-200 rounded-lg p-2"
                        >
                          <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-semibold text-gray-700">
                                {new Date(
                                  shift.date + 'T12:00:00',
                                ).toLocaleDateString('en-US', {
                                  weekday: 'short',
                                  month: 'short',
                                  day: 'numeric',
                                })}
                              </span>
                              <span className="text-xs text-gray-500">
                                {formatTime(shift.startTime)} -{' '}
                                {formatTime(shift.endTime)}
                              </span>
                            </div>
                            <button
                              onClick={() =>
                                onNavigateToDate(
                                  new Date(shift.date + 'T12:00:00'),
                                )
                              }
                              className="text-xs text-primary hover:text-primary/90 flex items-center gap-0.5"
                            >
                              <Eye size={10} />
                              View
                            </button>
                          </div>

                          {shift.roles.map((role) => (
                            <div key={role.id} className="ml-2 mt-1">
                              <div className="flex items-center gap-1.5 mb-0.5">
                                <span
                                  className={`text-xs px-1 py-0.5 rounded ${roleColor(role.roleName)}`}
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
                                    className="flex items-center gap-1 ml-2 py-0.5"
                                  >
                                    <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
                                    <span className="text-xs text-gray-700">
                                      {w.firstName} {w.lastName}
                                    </span>
                                  </div>
                                ) : null;
                              })}
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default ProjectDetailPanel;
