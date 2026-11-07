import React, { useState, useMemo } from 'react';
import { useAppContext } from '@/contexts/AppContext';
import { WorkOrder, Shift } from '@/lib/types';
import {
  ChevronLeft,
  ChevronRight,
  Users,
  Truck,
  Clock,
  MapPin,
  FolderKanban,
  X,
  CalendarDays,
  Eye,
  User,
  Package,
  ChevronDown,
  ChevronUp,
  ArrowLeft,
  ExternalLink,
} from 'lucide-react';

interface ProjectCalendarCenterProps {
  projectId: string;
  onClose: () => void;
  onNavigateToDate: (date: Date) => void;
}

const startOfWeek = (date: Date) => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day));
  return d;
};

const ProjectCalendarCenter: React.FC<ProjectCalendarCenterProps> = ({
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

  const [calendarMode, setCalendarMode] = useState<'week' | 'month'>('week');
  const [calendarDate, setCalendarDate] = useState(() =>
    startOfWeek(new Date()),
  );
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const today = useMemo(() => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    return now.toISOString().split('T')[0];
  }, []);

  const projectWorkOrders = useMemo(
    () => workOrders.filter((wo) => wo.projectId === projectId),
    [workOrders, projectId],
  );

  const allProjectShifts = useMemo(() => {
    const shifts: { shift: Shift; workOrder: WorkOrder }[] = [];
    projectWorkOrders.forEach((wo) => {
      wo.shifts.forEach((s) => shifts.push({ shift: s, workOrder: wo }));
    });
    return shifts;
  }, [projectWorkOrders]);

  const calendarDays = useMemo(() => {
    if (calendarMode === 'week') {
      return Array.from({ length: 7 }, (_, i) => {
        const d = new Date(calendarDate);
        d.setDate(d.getDate() + i);
        return d;
      });
    }
    const monthStart = new Date(
      calendarDate.getFullYear(),
      calendarDate.getMonth(),
      1,
    );
    const startDay = monthStart.getDay();
    const daysInMonth = new Date(
      calendarDate.getFullYear(),
      calendarDate.getMonth() + 1,
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
        new Date(calendarDate.getFullYear(), calendarDate.getMonth(), i),
      );
    }
    while (days.length % 7 !== 0) {
      const last = days[days.length - 1];
      const d = new Date(last);
      d.setDate(d.getDate() + 1);
      days.push(d);
    }
    return days;
  }, [calendarDate, calendarMode]);

  const getShiftsForDate = (date: Date) => {
    const dateStr = date.toISOString().split('T')[0];
    return allProjectShifts.filter((s) => s.shift.date === dateStr);
  };

  const getScheduleForDate = (date: Date) => {
    const dateStr = date.toISOString().split('T')[0];
    const shifts = getShiftsForDate(date);
    const workers: {
      id: string;
      name: string;
      role: string;
      time: string;
      initials: string;
    }[] = [];
    const equips: { id: string; name: string; identifier: string }[] = [];
    const seenW = new Set<string>();
    const seenE = new Set<string>();

    shifts.forEach(({ shift }) => {
      shift.roles.forEach((role) => {
        role.assignedWorkers.forEach((wid) => {
          if (!seenW.has(wid)) {
            seenW.add(wid);
            const w = getWorkerById(wid);
            if (w)
              workers.push({
                id: w.id,
                name: `${w.firstName} ${w.lastName}`,
                role: role.roleName,
                time: `${shift.startTime}-${shift.endTime}`,
                initials: `${w.firstName[0]}${w.lastName[0]}`,
              });
          }
        });
      });
      (shift.plannedEquipment || []).forEach((resource) => {
        if (seenE.has(resource.type)) return;
        seenE.add(resource.type);
        equips.push({
          id: resource.type,
          name: resource.type,
          identifier: `${resource.estimatedQuantity} planned`,
        });
      });
    });

    return { workers, equipment: equips, shifts };
  };

  const navigate = (dir: number) => {
    setCalendarDate((prev) => {
      const d = new Date(prev);
      if (calendarMode === 'week') d.setDate(d.getDate() + dir * 7);
      else d.setMonth(d.getMonth() + dir);
      return d;
    });
  };

  const goToToday = () => {
    setCalendarDate(startOfWeek(new Date()));
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

  const roleBgColor = (role: string) => {
    switch (role) {
      case 'Foreman':
        return 'bg-purple-500';
      case 'Flagger':
        return 'bg-blue-500';
      case 'Traffic Controller':
        return 'bg-teal-500';
      case 'Truck Driver':
        return 'bg-orange-500';
      default:
        return 'bg-gray-500';
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

  const formatTime = (t: string) => {
    const [h, m] = t.split(':');
    const hr = parseInt(h);
    return `${hr > 12 ? hr - 12 : hr || 12}:${m}${hr >= 12 ? 'PM' : 'AM'}`;
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
  const uniqueWorkerIds = new Set<string>();
  allProjectShifts.forEach(({ shift }) =>
    shift.roles.forEach((r) =>
      r.assignedWorkers.forEach((wid) => uniqueWorkerIds.add(wid)),
    ),
  );
  const uniqueEquipIds = new Set<string>();
  allProjectShifts.forEach(({ shift }) =>
    (shift.plannedEquipment || []).forEach((resource) =>
      uniqueEquipIds.add(resource.type),
    ),
  );

  return (
    <div className="h-full flex flex-col">
      {}
      <div className="bg-white border-b border-gray-200 px-6 py-4 flex-shrink-0">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <ArrowLeft size={18} className="text-gray-500" />
            </button>
            <div>
              <div className="flex items-center gap-2">
                <FolderKanban size={18} className="text-purple-600" />
                <h2 className="text-lg font-bold text-gray-900">
                  {project.name}
                </h2>
                <span className="text-xs font-mono text-gray-400 bg-gray-100 px-2 py-0.5 rounded">
                  #{project.number}
                </span>
              </div>
              <div className="flex items-center gap-3 text-sm text-gray-500 mt-0.5">
                <span>{client?.name}</span>
                <span className="flex items-center gap-1">
                  <MapPin size={12} /> {project.location}, {project.city}
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentPage('projects')}
              className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1 px-3 py-1.5 border border-gray-200 rounded-lg hover:bg-gray-50"
            >
              <ExternalLink size={12} /> Full Project
            </button>
            <button
              onClick={onClose}
              className="p-1.5 hover:bg-gray-100 rounded-lg"
            >
              <X size={18} className="text-gray-400" />
            </button>
          </div>
        </div>

        {}
        <div className="responsive-grid grid grid-cols-5 gap-3">
          <div className="bg-blue-50 rounded-lg p-2.5 border border-blue-100">
            <p className="text-xs text-primary font-medium">Shifts</p>
            <p className="text-xl font-bold text-blue-800">{totalShifts}</p>
          </div>
          <div className="bg-green-50 rounded-lg p-2.5 border border-green-100">
            <p className="text-xs text-green-600 font-medium">Workers</p>
            <p className="text-xl font-bold text-green-800">
              {uniqueWorkerIds.size}
            </p>
          </div>
          <div className="bg-orange-50 rounded-lg p-2.5 border border-orange-100">
            <p className="text-xs text-orange-600 font-medium">Equipment</p>
            <p className="text-xl font-bold text-orange-800">
              {uniqueEquipIds.size}
            </p>
          </div>
          <div className="bg-purple-50 rounded-lg p-2.5 border border-purple-100">
            <p className="text-xs text-purple-600 font-medium">Assignments</p>
            <p className="text-xl font-bold text-purple-800">
              {projectWorkOrders.length}
            </p>
          </div>
          <div
            className={`rounded-lg p-2.5 border ${fillRate >= 80 ? 'bg-green-50 border-green-100' : fillRate >= 50 ? 'bg-yellow-50 border-yellow-100' : 'bg-red-50 border-red-100'}`}
          >
            <p
              className={`text-xs font-medium ${fillRate >= 80 ? 'text-green-600' : fillRate >= 50 ? 'text-yellow-600' : 'text-red-600'}`}
            >
              Fill Rate
            </p>
            <p
              className={`text-xl font-bold ${fillRate >= 80 ? 'text-green-800' : fillRate >= 50 ? 'text-yellow-800' : 'text-red-800'}`}
            >
              {fillRate}%
            </p>
          </div>
        </div>

        {}
        <div className="flex items-center justify-between mt-4">
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate(-1)}
              className="p-1.5 hover:bg-gray-100 rounded-lg"
            >
              <ChevronLeft size={16} className="text-gray-500" />
            </button>
            <button
              onClick={goToToday}
              className="px-3 py-1.5 text-sm text-primary hover:bg-primary/10 rounded-lg font-medium"
            >
              Today
            </button>
            <button
              onClick={() => navigate(1)}
              className="p-1.5 hover:bg-gray-100 rounded-lg"
            >
              <ChevronRight size={16} className="text-gray-500" />
            </button>
            <span className="text-sm font-semibold text-gray-700 ml-2">
              {calendarMode === 'week'
                ? `${calendarDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${new Date(calendarDate.getTime() + 6 * 86400000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
                : calendarDate.toLocaleDateString('en-US', {
                    month: 'long',
                    year: 'numeric',
                  })}
            </span>
          </div>
          <div className="flex items-center bg-gray-100 rounded-lg p-0.5">
            <button
              onClick={() => setCalendarMode('week')}
              className={`px-3 py-1.5 text-xs rounded-md transition-colors ${calendarMode === 'week' ? 'bg-white shadow-sm text-primary font-medium' : 'text-gray-500'}`}
            >
              Week
            </button>
            <button
              onClick={() => setCalendarMode('month')}
              className={`px-3 py-1.5 text-xs rounded-md transition-colors ${calendarMode === 'month' ? 'bg-white shadow-sm text-primary font-medium' : 'text-gray-500'}`}
            >
              Month
            </button>
          </div>
        </div>
      </div>

      {}
      <div className="flex-1 overflow-auto p-4">
        {calendarMode === 'week' ? (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            {}
            <div className="grid grid-cols-7 border-b border-gray-200">
              {calendarDays.map((d, i) => {
                const dateStr = d.toISOString().split('T')[0];
                const isToday = dateStr === today;
                const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                const schedule = getScheduleForDate(d);

                return (
                  <div
                    key={i}
                    className={`text-center py-3 border-r border-gray-100 last:border-r-0 ${isToday ? 'bg-blue-50' : isWeekend ? 'bg-gray-50' : ''}`}
                  >
                    <p
                      className={`text-xs font-semibold ${isToday ? 'text-primary' : isWeekend ? 'text-gray-400' : 'text-gray-600'}`}
                    >
                      {d.toLocaleDateString('en-US', { weekday: 'short' })}
                    </p>
                    <p
                      className={`text-lg font-bold ${isToday ? 'text-primary' : 'text-gray-800'}`}
                    >
                      {d.getDate()}
                    </p>
                    {schedule.workers.length > 0 && (
                      <div className="flex items-center justify-center gap-1 mt-1">
                        <Users size={10} className="text-green-600" />
                        <span className="text-xs font-bold text-green-700">
                          {schedule.workers.length}
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {}
            <div className="grid grid-cols-7 min-h-[400px]">
              {calendarDays.map((d, i) => {
                const dateStr = d.toISOString().split('T')[0];
                const isToday = dateStr === today;
                const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                const isSelected = selectedDate === dateStr;
                const schedule = getScheduleForDate(d);

                return (
                  <div
                    key={i}
                    className={`border-r border-gray-100 last:border-r-0 p-2 space-y-1 cursor-pointer transition-colors ${
                      isSelected
                        ? 'bg-purple-50/50'
                        : isToday
                          ? 'bg-blue-50/30'
                          : isWeekend
                            ? 'bg-gray-50/50'
                            : 'hover:bg-gray-50/30'
                    }`}
                    onClick={() => setSelectedDate(isSelected ? null : dateStr)}
                  >
                    {}
                    {schedule.workers.map((w) => (
                      <div
                        key={w.id}
                        className="flex items-center gap-1.5 bg-white rounded-lg border border-gray-200 px-2 py-1.5 hover:shadow-sm transition-shadow"
                      >
                        <div
                          className={`w-6 h-6 rounded-full flex items-center justify-center text-white text-[9px] font-bold flex-shrink-0 ${roleBgColor(w.role)}`}
                        >
                          {w.initials}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-gray-800 truncate">
                            {w.name}
                          </p>
                          <div className="flex items-center gap-1">
                            <span
                              className={`text-[10px] px-1 py-0 rounded ${roleColor(w.role)}`}
                            >
                              {w.role}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}

                    {}
                    {schedule.equipment.map((eq) => (
                      <div
                        key={eq.id}
                        className="flex items-center gap-1.5 bg-orange-50 rounded-lg border border-orange-200 px-2 py-1"
                      >
                        <Truck
                          size={10}
                          className="text-orange-500 flex-shrink-0"
                        />
                        <span className="text-[10px] text-orange-700 font-medium truncate">
                          {eq.identifier}
                        </span>
                      </div>
                    ))}

                    {schedule.workers.length === 0 &&
                      schedule.equipment.length === 0 && (
                        <div className="h-full flex items-center justify-center min-h-[60px]">
                          <span className="text-xs text-gray-300 italic">
                            No assignments
                          </span>
                        </div>
                      )}
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="grid grid-cols-7 border-b border-gray-200">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
                <div
                  key={d}
                  className="text-center py-2 text-xs font-semibold text-gray-500 border-r border-gray-100 last:border-r-0"
                >
                  {d}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7">
              {calendarDays.map((d, i) => {
                const dateStr = d.toISOString().split('T')[0];
                const isToday = dateStr === today;
                const isCurrentMonth = d.getMonth() === calendarDate.getMonth();
                const schedule = getScheduleForDate(d);
                const hasData = schedule.workers.length > 0;

                return (
                  <div
                    key={i}
                    className={`min-h-[90px] border-r border-b border-gray-100 p-1.5 cursor-pointer transition-colors hover:bg-purple-50/30 ${
                      isToday
                        ? 'bg-blue-50/50'
                        : !isCurrentMonth
                          ? 'bg-gray-50/50 opacity-50'
                          : ''
                    } ${selectedDate === dateStr ? 'bg-purple-50' : ''}`}
                    onClick={() =>
                      setSelectedDate(selectedDate === dateStr ? null : dateStr)
                    }
                  >
                    <div
                      className={`text-xs font-bold mb-1 ${isToday ? 'text-primary' : 'text-gray-700'}`}
                    >
                      {d.getDate()}
                    </div>
                    {hasData && (
                      <>
                        <div className="flex items-center gap-1 mb-0.5">
                          <Users size={9} className="text-green-600" />
                          <span className="text-[10px] font-bold text-green-700">
                            {schedule.workers.length}
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-0.5">
                          {schedule.workers.slice(0, 4).map((w) => (
                            <div
                              key={w.id}
                              className={`w-4 h-4 rounded-full flex items-center justify-center text-white text-[7px] font-bold ${roleBgColor(w.role)}`}
                              title={w.name}
                            >
                              {w.initials[0]}
                            </div>
                          ))}
                          {schedule.workers.length > 4 && (
                            <span className="text-[9px] text-gray-400">
                              +{schedule.workers.length - 4}
                            </span>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {}
        {selectedDate &&
          (() => {
            const d = new Date(selectedDate + 'T12:00:00');
            const schedule = getScheduleForDate(d);
            const shifts = getShiftsForDate(d);

            return (
              <div className="mt-4 bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="px-5 py-3 bg-purple-50 border-b border-purple-100 flex items-center justify-between flex-wrap gap-3">
                  <div className="flex items-center gap-3">
                    <CalendarDays size={16} className="text-purple-600" />
                    <h3 className="font-semibold text-purple-900">
                      {d.toLocaleDateString('en-US', {
                        weekday: 'long',
                        month: 'long',
                        day: 'numeric',
                      })}
                    </h3>
                    <span className="text-xs text-purple-600 bg-purple-100 px-2 py-0.5 rounded-full">
                      {schedule.workers.length} workers |{' '}
                      {schedule.equipment.length} equipment
                    </span>
                  </div>
                  <button
                    onClick={() => onNavigateToDate(d)}
                    className="text-xs text-primary hover:text-primary/90 flex items-center gap-1 px-3 py-1.5 bg-blue-50 rounded-lg hover:bg-primary/15"
                  >
                    <Eye size={12} /> View in Timeline
                  </button>
                </div>

                <div className="p-5">
                  {schedule.workers.length === 0 &&
                  schedule.equipment.length === 0 ? (
                    <p className="text-sm text-gray-400 italic text-center py-4">
                      No assignments for this date
                    </p>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                      {}
                      {schedule.workers.map((w) => (
                        <div
                          key={w.id}
                          className="flex items-center gap-3 bg-gray-50 rounded-lg p-3 border border-gray-100"
                        >
                          <div
                            className={`w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0 ${roleBgColor(w.role)}`}
                          >
                            {w.initials}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-800">
                              {w.name}
                            </p>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span
                                className={`text-xs px-1.5 py-0.5 rounded ${roleColor(w.role)}`}
                              >
                                {w.role}
                              </span>
                              <span className="text-xs text-gray-500 flex items-center gap-1">
                                <Clock size={10} /> {w.time}
                              </span>
                            </div>
                          </div>
                        </div>
                      ))}

                      {}
                      {schedule.equipment.map((eq) => (
                        <div
                          key={eq.id}
                          className="flex items-center gap-3 bg-orange-50 rounded-lg p-3 border border-orange-100"
                        >
                          <div className="w-10 h-10 rounded-lg bg-orange-500 flex items-center justify-center text-white flex-shrink-0">
                            <Truck size={18} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-800">
                              {eq.name}
                            </p>
                            <p className="text-xs text-gray-500">
                              {eq.identifier}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {}
                  {shifts.length > 0 && (
                    <div className="mt-4 pt-4 border-t border-gray-200">
                      <h4 className="text-sm font-semibold text-gray-700 mb-2">
                        Shift Details
                      </h4>
                      <div className="space-y-2">
                        {shifts.map(({ shift, workOrder }) => {
                          const totalA = shift.roles.reduce(
                            (a, r) => a + r.assignedWorkers.length,
                            0,
                          );
                          const totalR = shift.roles.reduce(
                            (a, r) => a + r.requiredCount,
                            0,
                          );
                          return (
                            <div
                              key={shift.id}
                              className="border border-gray-200 rounded-lg p-3"
                            >
                              <p className="mb-2 text-sm font-bold text-gray-900">
                                {shift.shiftName}
                              </p>
                              <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-medium text-gray-800">
                                    {workOrder.title}
                                  </span>
                                  {workOrder.orderNumber && (
                                    <span className="text-xs font-mono text-gray-400">
                                      {workOrder.orderNumber}
                                    </span>
                                  )}
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className="text-xs text-gray-500">
                                    {formatTime(shift.startTime)} -{' '}
                                    {formatTime(shift.endTime)}
                                  </span>
                                  <span
                                    className={`text-xs font-bold ${totalA >= totalR ? 'text-green-600' : 'text-red-600'}`}
                                  >
                                    {totalA}/{totalR}
                                  </span>
                                </div>
                              </div>
                              <div className="flex flex-wrap gap-1.5">
                                {shift.roles.map((r) => (
                                  <span
                                    key={r.id}
                                    className={`text-xs px-1.5 py-0.5 rounded ${roleColor(r.roleName)}`}
                                  >
                                    {r.roleName} ({r.assignedWorkers.length}/
                                    {r.requiredCount})
                                  </span>
                                ))}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })()}
      </div>
    </div>
  );
};

export default ProjectCalendarCenter;
