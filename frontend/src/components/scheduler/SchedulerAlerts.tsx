import React, { useMemo, useState } from 'react';
import { useAppContext } from '@/contexts/AppContext';
import {
  AlertTriangle,
  Clock,
  Users,
  X,
  ChevronDown,
  ChevronRight,
  Shield,
  Zap,
  UserX,
  Truck,
} from 'lucide-react';

interface SchedulerAlertsProps {
  onClose: () => void;
  onNavigateToShift?: (date: string, projectId: string) => void;
}

interface Alert {
  id: string;
  type:
    | 'conflict'
    | 'understaffed'
    | 'overtime'
    | 'equipment'
    | 'certification';
  severity: 'high' | 'medium' | 'low';
  title: string;
  description: string;
  projectId?: string;
  date?: string;
  workerIds?: string[];
}

const SchedulerAlerts: React.FC<SchedulerAlertsProps> = ({
  onClose,
  onNavigateToShift,
}) => {
  const { workOrders, workers, equipment, getProjectById, getWorkerById } =
    useAppContext();
  const [expandedAlert, setExpandedAlert] = useState<string | null>(null);
  const [filterSeverity, setFilterSeverity] = useState<string>('all');

  const alerts = useMemo(() => {
    const result: Alert[] = [];
    const activeWOs = workOrders;

    activeWOs.forEach((wo) => {
      const project = getProjectById(wo.projectId);
      wo.shifts.forEach((shift) => {
        const totalRequired = shift.roles.reduce(
          (a, r) => a + r.requiredCount,
          0,
        );
        const totalAssigned = shift.roles.reduce(
          (a, r) => a + r.assignedWorkers.length,
          0,
        );
        const missing = totalRequired - totalAssigned;
        if (missing > 0) {
          const missingRoles = shift.roles
            .filter((r) => r.assignedWorkers.length < r.requiredCount)
            .map(
              (r) =>
                `${r.roleName} (${r.requiredCount - r.assignedWorkers.length})`,
            );
          result.push({
            id: `understaffed_${shift.id}`,
            type: 'understaffed',
            severity: missing >= 3 ? 'high' : missing >= 2 ? 'medium' : 'low',
            title: `${project?.name || wo.title} - ${shift.date}`,
            description: `Missing ${missing} worker${missing > 1 ? 's' : ''}: ${missingRoles.join(', ')}`,
            projectId: wo.projectId,
            date: shift.date,
          });
        }
      });
    });

    const workerShiftMap = new Map<
      string,
      {
        shiftId: string;
        woId: string;
        date: string;
        start: string;
        end: string;
        projectName: string;
      }[]
    >();
    activeWOs.forEach((wo) => {
      const project = getProjectById(wo.projectId);
      wo.shifts.forEach((shift) => {
        shift.roles.forEach((role) => {
          role.assignedWorkers.forEach((wid) => {
            if (!workerShiftMap.has(wid)) workerShiftMap.set(wid, []);
            workerShiftMap.get(wid)!.push({
              shiftId: shift.id,
              woId: wo.id,
              date: shift.date,
              start: shift.startTime,
              end: shift.endTime,
              projectName: project?.name || wo.title,
            });
          });
        });
      });
    });

    workerShiftMap.forEach((shifts, wid) => {
      const worker = getWorkerById(wid);
      if (!worker) return;
      const byDate = new Map<string, typeof shifts>();
      shifts.forEach((s) => {
        if (!byDate.has(s.date)) byDate.set(s.date, []);
        byDate.get(s.date)!.push(s);
      });
      byDate.forEach((dateShifts, date) => {
        if (dateShifts.length < 2) return;
        for (let i = 0; i < dateShifts.length; i++) {
          for (let j = i + 1; j < dateShifts.length; j++) {
            const a = dateShifts[i],
              b = dateShifts[j];
            if (a.start < b.end && a.end > b.start) {
              result.push({
                id: `conflict_${wid}_${date}_${i}_${j}`,
                type: 'conflict',
                severity: 'high',
                title: `${worker.firstName} ${worker.lastName} - Double Booked`,
                description: `Assigned to "${a.projectName}" (${a.start}-${a.end}) and "${b.projectName}" (${b.start}-${b.end}) on ${date}`,
                date,
                workerIds: [wid],
              });
            }
          }
        }
      });
    });

    const workerWeeklyHours = new Map<string, number>();
    activeWOs.forEach((wo) => {
      wo.shifts.forEach((shift) => {
        const [sh, sm] = shift.startTime.split(':').map(Number);
        const [eh, em] = shift.endTime.split(':').map(Number);
        const hours = eh + em / 60 - (sh + sm / 60);
        shift.roles.forEach((role) => {
          role.assignedWorkers.forEach((wid) => {
            workerWeeklyHours.set(
              wid,
              (workerWeeklyHours.get(wid) || 0) + hours,
            );
          });
        });
      });
    });

    workerWeeklyHours.forEach((hours, wid) => {
      if (hours > 40) {
        const worker = getWorkerById(wid);
        if (worker) {
          result.push({
            id: `overtime_${wid}`,
            type: 'overtime',
            severity: hours > 50 ? 'high' : 'medium',
            title: `${worker.firstName} ${worker.lastName} - Overtime Risk`,
            description: `Scheduled for ${hours.toFixed(1)} hours this period (limit: 40hrs)`,
            workerIds: [wid],
          });
        }
      }
    });

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const thirtyDays = new Date(today);
    thirtyDays.setDate(thirtyDays.getDate() + 30);
    workers
      .filter((w) => w.status === 'active')
      .forEach((w) => {
        w.certifications.forEach((cert) => {
          if (!cert.expiryDate) return;
          const expiry = new Date(cert.expiryDate);
          if (Number.isNaN(expiry.getTime())) return;
          if (expiry <= thirtyDays && expiry > today) {
            result.push({
              id: `cert_${w.id}_${cert.id}`,
              type: 'certification',
              severity: 'low',
              title: `${w.firstName} ${w.lastName} - Cert Expiring`,
              description: `${cert.name} expires ${cert.expiryDate}`,
              workerIds: [w.id],
            });
          }
        });
      });

    return result.sort((a, b) => {
      const sev = { high: 0, medium: 1, low: 2 };
      return sev[a.severity] - sev[b.severity];
    });
  }, [workOrders, workers, equipment, getProjectById, getWorkerById]);

  const filteredAlerts =
    filterSeverity === 'all'
      ? alerts
      : alerts.filter((a) => a.severity === filterSeverity);

  const severityCounts = {
    high: alerts.filter((a) => a.severity === 'high').length,
    medium: alerts.filter((a) => a.severity === 'medium').length,
    low: alerts.filter((a) => a.severity === 'low').length,
  };

  const alertIcon = (type: string) => {
    switch (type) {
      case 'conflict':
        return <Zap size={14} className="text-red-500" />;
      case 'understaffed':
        return <UserX size={14} className="text-orange-500" />;
      case 'overtime':
        return <Clock size={14} className="text-yellow-600" />;
      case 'equipment':
        return <Truck size={14} className="text-blue-500" />;
      case 'certification':
        return <Shield size={14} className="text-purple-500" />;
      default:
        return <AlertTriangle size={14} className="text-gray-500" />;
    }
  };

  const severityColor = (severity: string) => {
    switch (severity) {
      case 'high':
        return 'border-l-red-500 bg-red-50/50';
      case 'medium':
        return 'border-l-orange-400 bg-orange-50/30';
      case 'low':
        return 'border-l-yellow-400 bg-yellow-50/30';
      default:
        return 'border-l-gray-300';
    }
  };

  const severityBadge = (severity: string) => {
    switch (severity) {
      case 'high':
        return 'bg-red-100 text-red-700';
      case 'medium':
        return 'bg-orange-100 text-orange-700';
      case 'low':
        return 'bg-yellow-100 text-yellow-700';
      default:
        return 'bg-gray-100 text-gray-600';
    }
  };

  return (
    <div className="w-full max-h-[60dvh] lg:max-h-none lg:w-80 border-l border-gray-200 bg-white flex-shrink-0 flex flex-col">
      {}
      <div className="p-3 border-b border-gray-200">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <AlertTriangle size={16} className="text-orange-500" />
            <h3 className="font-semibold text-gray-800 text-sm">Alerts</h3>
            {alerts.length > 0 && (
              <span className="text-xs bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full font-bold">
                {alerts.length}
              </span>
            )}
          </div>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded">
            <X size={14} className="text-gray-400" />
          </button>
        </div>

        {}
        <div className="flex gap-1">
          {[
            { key: 'all', label: 'All', count: alerts.length },
            { key: 'high', label: 'High', count: severityCounts.high },
            { key: 'medium', label: 'Med', count: severityCounts.medium },
            { key: 'low', label: 'Low', count: severityCounts.low },
          ].map((f) => (
            <button
              key={f.key}
              onClick={() => setFilterSeverity(f.key)}
              className={`flex-1 text-xs py-1 rounded-md font-medium transition-colors ${
                filterSeverity === f.key
                  ? 'bg-gray-800 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {f.label} ({f.count})
            </button>
          ))}
        </div>
      </div>

      {}
      <div className="flex-1 overflow-y-auto">
        {filteredAlerts.length === 0 ? (
          <div className="p-8 text-center">
            <Shield
              size={32}
              className="mx-auto mb-2 text-green-400 opacity-50"
            />
            <p className="text-sm text-gray-500">No alerts</p>
            <p className="text-xs text-gray-400 mt-1">All clear for now</p>
          </div>
        ) : (
          <div className="p-2 space-y-1.5">
            {filteredAlerts.map((alert) => {
              const isExpanded = expandedAlert === alert.id;
              return (
                <div
                  key={alert.id}
                  className={`border-l-4 rounded-r-lg border border-gray-200 transition-all ${severityColor(alert.severity)}`}
                >
                  <button
                    onClick={() =>
                      setExpandedAlert(isExpanded ? null : alert.id)
                    }
                    className="w-full text-left p-2.5"
                  >
                    <div className="flex items-start gap-2">
                      <div className="mt-0.5 flex-shrink-0">
                        {alertIcon(alert.type)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <span className="text-xs font-semibold text-gray-800 truncate">
                            {alert.title}
                          </span>
                          <span
                            className={`text-[9px] px-1 py-0 rounded font-bold uppercase flex-shrink-0 ${severityBadge(alert.severity)}`}
                          >
                            {alert.severity}
                          </span>
                        </div>
                        <p className="text-xs text-gray-600 line-clamp-2">
                          {alert.description}
                        </p>
                      </div>
                      <div className="flex-shrink-0 mt-1">
                        {isExpanded ? (
                          <ChevronDown size={12} className="text-gray-400" />
                        ) : (
                          <ChevronRight size={12} className="text-gray-400" />
                        )}
                      </div>
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="px-2.5 pb-2.5 pt-0">
                      <div className="bg-white rounded-lg border border-gray-200 p-2 text-xs text-gray-600">
                        <p className="mb-2">{alert.description}</p>
                        {alert.date && onNavigateToShift && alert.projectId && (
                          <button
                            onClick={() =>
                              onNavigateToShift(alert.date!, alert.projectId!)
                            }
                            className="text-primary hover:text-primary/90 font-medium flex items-center gap-1"
                          >
                            View in Schedule
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default SchedulerAlerts;
