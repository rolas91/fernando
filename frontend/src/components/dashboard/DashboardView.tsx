import DataPagination from '@/components/shared/DataPagination';
import { useDashboardRead } from '@/hooks/use-summary-reads';
import CatalogQueryState from '@/components/shared/CatalogQueryState';
import React from 'react';
import { useAppContext, AppContextOverride } from '@/contexts/AppContext';
import {
  Users,
  Truck,
  Briefcase,
  Clock,
  AlertTriangle,
  FileText,
  ChevronRight,
  MapPin,
  Cloud,
  TrendingUp,
  Calendar,
} from 'lucide-react';
import JobsMap from './JobsMap';

const DashboardView: React.FC = () => {
  const { setCurrentPage } = useAppContext();
  const dashboard = useDashboardRead();
  const data = dashboard.query.data;
  const today = new Date(dashboard.day.date + 'T12:00:00');
  const todayWorkOrders = data?.workOrders || [],
    todayActivity = data?.activity.data || [],
    todayAssignedWorkers = data?.assignedWorkers || [],
    todayPlannedEquipment = data?.todayPlannedEquipment || [];
  const plannedEquipmentCount = data?.plannedEquipmentCount || 0,
    pendingTimesheets = data?.pendingTimesheets || 0,
    openIncidents = data?.openIncidents || 0,
    activeJobs = data?.activeJobs || 0;
  const getProjectById = (id: string) =>
    data?.projects.find((project) => project.id === id);
  const getClientById = (id: string) =>
    data?.clients.find((client) => client.id === id);
  if (!data)
    return (
      <div className="p-6">
        <CatalogQueryState
          loading={dashboard.query.isPending}
          error={dashboard.query.error}
          retry={() => void dashboard.query.refetch()}
        />
      </div>
    );
  return (
    <AppContextOverride
      value={{
        projects: data.projects,
        clients: data.clients,
        getProjectById,
        getClientById,
      }}
    >
      <div className="p-3 sm:p-6 space-y-6">
        <CatalogQueryState
          loading={false}
          error={dashboard.query.error}
          retry={() => void dashboard.query.refetch()}
        />
        {}
        <div className="bg-gradient-to-r from-primary to-primary/90 rounded-xl p-3 sm:p-6 text-white">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-white/80 text-sm">Today</p>
              <p className="text-2xl font-bold">
                {today.toLocaleDateString('en-US', {
                  weekday: 'long',
                  month: 'long',
                  day: 'numeric',
                  year: 'numeric',
                })}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-4 sm:gap-8">
              <div className="flex items-center gap-2">
                <Cloud size={24} className="text-white/80" />
                <div>
                  <p className="text-lg font-bold">62°F</p>
                  <p className="text-xs text-white/80">Partly Cloudy</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Users size={24} className="text-white/80" />
                <div>
                  <p className="text-lg font-bold">
                    {data.assignedWorkerCount} / {data.activeWorkerCount}
                  </p>
                  <p className="text-xs text-white/80">Workers Allocated</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Truck size={24} className="text-white/80" />
                <div>
                  <p className="text-lg font-bold">
                    {plannedEquipmentCount} / {data.equipmentCount}
                  </p>
                  <p className="text-xs text-white/80">Equipment Allocated</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <button
            onClick={() => setCurrentPage('workorders')}
            className="bg-white rounded-xl p-5 border border-gray-200 hover:shadow-md transition-shadow text-left"
          >
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                <Briefcase size={20} className="text-primary" />
              </div>
              <TrendingUp size={16} className="text-green-500" />
            </div>
            <p className="text-2xl font-bold text-gray-800 mt-3">
              {activeJobs}
            </p>
            <p className="text-sm text-gray-500">Active Jobs</p>
          </button>

          <button
            onClick={() => setCurrentPage('timesheets')}
            className="bg-white rounded-xl p-5 border border-gray-200 hover:shadow-md transition-shadow text-left"
          >
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center">
                <Clock size={20} className="text-orange-600" />
              </div>
              {pendingTimesheets > 0 && (
                <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full font-medium">
                  Needs Review
                </span>
              )}
            </div>
            <p className="text-2xl font-bold text-gray-800 mt-3">
              {pendingTimesheets}
            </p>
            <p className="text-sm text-gray-500">Pending Timesheets</p>
          </button>

          <button
            onClick={() => setCurrentPage('incidents')}
            className="bg-white rounded-xl p-5 border border-gray-200 hover:shadow-md transition-shadow text-left"
          >
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center">
                <AlertTriangle size={20} className="text-red-600" />
              </div>
              {openIncidents > 0 && (
                <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-medium">
                  Open
                </span>
              )}
            </div>
            <p className="text-2xl font-bold text-gray-800 mt-3">
              {openIncidents}
            </p>
            <p className="text-sm text-gray-500">Open Incidents</p>
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {}
          <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200">
            <div className="p-4 border-b border-gray-100 flex items-center justify-between flex-wrap gap-3">
              <h2 className="font-semibold text-gray-800">
                Today's Active Assignments
              </h2>
              <button
                onClick={() => setCurrentPage('scheduler')}
                className="text-sm text-primary hover:underline flex items-center gap-1"
              >
                Full Schedule <ChevronRight size={14} />
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-3">
                      ID
                    </th>
                    <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-3">
                      Assignment
                    </th>
                    <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-3">
                      Client
                    </th>
                    <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-3">
                      Location
                    </th>
                    <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-3">
                      Status
                    </th>
                    <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-3">
                      Crew
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {todayWorkOrders.map((wo) => {
                    const project = getProjectById(wo.projectId);
                    const client = project
                      ? getClientById(project.clientId)
                      : undefined;
                    const totalAssigned = wo.shifts.reduce(
                      (acc, s) =>
                        acc +
                        s.roles.reduce(
                          (a, r) => a + r.assignedWorkers.length,
                          0,
                        ),
                      0,
                    );
                    const totalRequired = wo.shifts.reduce(
                      (acc, s) =>
                        acc + s.roles.reduce((a, r) => a + r.requiredCount, 0),
                      0,
                    );
                    return (
                      <tr
                        key={wo.id}
                        className="border-b border-gray-50 hover:bg-gray-50 cursor-pointer"
                        onClick={() => setCurrentPage('workorders')}
                      >
                        <td className="px-4 py-3 text-sm text-primary font-medium">
                          #{project?.number}
                        </td>
                        <td className="px-4 py-3">
                          <p className="text-sm font-medium text-gray-800">
                            {wo.title}
                          </p>
                          <p className="text-xs text-gray-500">
                            {wo.startDate} - {wo.endDate}
                          </p>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600">
                          {client?.name || '-'}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1 text-sm text-gray-600">
                            <MapPin size={12} className="text-gray-400" />
                            {project?.city || '-'}
                          </div>
                        </td>
                        <td className="px-4 py-3"></td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1 text-sm">
                            <Users size={14} className="text-gray-400" />
                            <span
                              className={
                                totalAssigned < totalRequired
                                  ? 'text-red-600 font-medium'
                                  : 'text-green-600 font-medium'
                              }
                            >
                              {totalAssigned}/{totalRequired}
                            </span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {todayWorkOrders.length === 0 && (
                    <tr>
                      <td
                        colSpan={6}
                        className="px-4 py-8 text-center text-sm text-gray-500"
                      >
                        No active assignments scheduled for today.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {}
          <div className="bg-white rounded-xl border border-gray-200">
            <div className="p-4 border-b border-gray-100">
              <h2 className="font-semibold text-gray-800">Activity Feed</h2>
            </div>
            <div className="max-h-[500px] overflow-y-auto">
              <DataPagination page={dashboard.page} total={(data.activity.meta)?.total} pageSize={dashboard.pageSize} onPage={dashboard.setPage} onPageSize={dashboard.setPageSize} busy={dashboard.query.isFetching} />
              {todayActivity.map((item) => (
                <div
                  key={item.id}
                  className="p-4 border-b border-gray-50 hover:bg-gray-50"
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={`w-8 h-8 rounded flex items-center justify-center flex-shrink-0 ${
                        item.type === 'work_order_status'
                          ? 'bg-blue-100'
                          : item.type === 'timesheet'
                            ? 'bg-green-100'
                            : item.type === 'form_result'
                              ? 'bg-purple-100'
                              : item.type === 'incident'
                                ? 'bg-red-100'
                                : 'bg-gray-100'
                      }`}
                    >
                      {item.type === 'work_order_status' && (
                        <Briefcase size={14} className="text-primary" />
                      )}
                      {item.type === 'timesheet' && (
                        <Clock size={14} className="text-green-600" />
                      )}
                      {item.type === 'form_result' && (
                        <FileText size={14} className="text-purple-600" />
                      )}
                      {item.type === 'incident' && (
                        <AlertTriangle size={14} className="text-red-600" />
                      )}
                      {item.type === 'assignment' && (
                        <Users size={14} className="text-gray-600" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-gray-500 uppercase">
                        {item.title}
                      </p>
                      <p className="text-sm text-gray-800 mt-0.5">
                        {item.subtitle}
                      </p>
                      {item.tags && (
                        <div className="flex gap-1 mt-1">
                          {item.tags.map((tag, i) => (
                            <span
                              key={i}
                              className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                                tag.color === 'green'
                                  ? 'bg-green-100 text-green-700'
                                  : tag.color === 'blue'
                                    ? 'bg-blue-100 text-blue-700'
                                    : 'bg-gray-100 text-gray-600'
                              }`}
                            >
                              {tag.label}
                            </span>
                          ))}
                        </div>
                      )}
                      <div className="flex items-center gap-2 mt-1">
                        <p className="text-xs text-gray-400">{item.user}</p>
                        <p className="text-xs text-gray-300">
                          {new Date(item.timestamp).toLocaleDateString(
                            'en-US',
                            {
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            },
                          )}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
              {todayActivity.length === 0 && (
                <p className="p-8 text-center text-sm text-gray-500">
                  No activity recorded today.
                </p>
              )}
            </div>
          </div>
        </div>

        {}
        <JobsMap workOrders={todayWorkOrders} />

        {}

        {}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
              <Users size={18} className="text-primary" />
              Today's Assigned Workers
            </h3>
            <div className="space-y-2">
              {todayAssignedWorkers.slice(0, 6).map((worker) => (
                <div
                  key={worker.id}
                  className="flex items-center justify-between py-1 flex-wrap gap-3"
                >
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-orange-500" />
                    <span className="text-sm text-gray-700">
                      {worker.firstName} {worker.lastName}
                    </span>
                  </div>
                  <span className="text-xs font-medium text-orange-600">
                    Assigned
                  </span>
                </div>
              ))}
              {todayAssignedWorkers.length === 0 && (
                <p className="py-4 text-center text-sm text-gray-500">
                  No workers assigned today.
                </p>
              )}
              <button
                onClick={() => setCurrentPage('workers')}
                className="text-xs text-primary hover:underline mt-2"
              >
                View all workers
              </button>
            </div>
          </div>

          {}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
              <Truck size={18} className="text-primary" />
              Today's Planned Equipment
            </h3>
            <div className="space-y-2">
              {todayPlannedEquipment.slice(0, 6).map(([type, quantity]) => (
                <div
                  key={type}
                  className="flex items-center justify-between py-1 flex-wrap gap-3"
                >
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-orange-500" />
                    <span className="text-sm text-gray-700">{type}</span>
                  </div>
                  <span className="text-xs font-medium text-orange-600">
                    {quantity} planned
                  </span>
                </div>
              ))}
              {todayPlannedEquipment.length === 0 && (
                <p className="py-4 text-center text-sm text-gray-500">
                  No equipment planned today.
                </p>
              )}
              <button
                onClick={() => setCurrentPage('equipment')}
                className="text-xs text-primary hover:underline mt-2"
              >
                View all equipment
              </button>
            </div>
          </div>

          {}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
              <Calendar size={18} className="text-primary" />
              Today's Schedule
            </h3>
            <div className="space-y-2">
              {todayWorkOrders.slice(0, 5).map((wo) => {
                const p = getProjectById(wo.projectId);
                if (!p) return null;
                const client = getClientById(p.clientId);
                return (
                  <div
                    key={wo.id}
                    className="py-1.5 border-b border-gray-50 last:border-0"
                  >
                    <p className="text-sm font-medium text-gray-800">
                      {wo.title}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-gray-500">
                        {client?.name}
                      </span>
                      <span className="text-xs text-gray-300">|</span>
                      <span className="text-xs text-gray-500">{p.city}</span>
                    </div>
                  </div>
                );
              })}
              {todayWorkOrders.length === 0 && (
                <p className="py-4 text-center text-sm text-gray-500">
                  No shifts scheduled for today.
                </p>
              )}
              <button
                onClick={() => setCurrentPage('scheduler')}
                className="text-xs text-primary hover:underline mt-2"
              >
                View full schedule
              </button>
            </div>
          </div>
        </div>
      </div>
    </AppContextOverride>
  );
};

export default DashboardView;
