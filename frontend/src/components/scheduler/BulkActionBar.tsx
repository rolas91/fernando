import React, { useState, useMemo } from 'react';
import { useAppContext } from '@/contexts/AppContext';
import { useToast } from '@/hooks/use-toast';
import { Worker, Shift, WorkOrder } from '@/lib/types';
import {
  getRoleRequiredCertificationIds,
  workerMeetsRoleCertificationRequirements,
} from '@/lib/workerCertificationMatch';
import {
  workerHasAssignmentRole,
  workerRoleNames,
} from '@/lib/workerRoleMatch';
import { getWorkerAvailability } from './AvailabilityIndicator';
import { prepareShiftDuplicate } from './shiftConfirmation';
import {
  UserPlus,
  UserMinus,
  Copy,
  Wand2,
  X,
  ChevronDown,
  Check,
  AlertTriangle,
  Sparkles,
} from 'lucide-react';

interface BulkActionBarProps {
  selectedShiftIds: Set<string>;
  onClearSelection: () => void;
  onModifiedShifts: (ids: string[]) => void;
}

const BulkActionBar: React.FC<BulkActionBarProps> = ({
  selectedShiftIds,
  onClearSelection,
  onModifiedShifts,
}) => {
  const {
    workers,
    workOrders,
    equipment,
    settings,
    updateWorkOrder,
    getWorkerById,
    getProjectById,
    availabilityRequests,
  } = useAppContext();
  const { toast } = useToast();

  const [showAssignModal, setShowAssignModal] = useState(false);
  const [showCopyModal, setShowCopyModal] = useState(false);
  const [showAutoFillModal, setShowAutoFillModal] = useState(false);

  const selectedShifts = useMemo(() => {
    const result: { shift: Shift; workOrder: WorkOrder }[] = [];
    selectedShiftIds.forEach((sid) => {
      for (const wo of workOrders) {
        const shift = wo.shifts.find((s) => s.id === sid);
        if (shift) {
          result.push({ shift, workOrder: wo });
          break;
        }
      }
    });
    return result;
  }, [selectedShiftIds, workOrders]);

  const stats = useMemo(() => {
    let totalRequired = 0;
    let totalAssigned = 0;
    selectedShifts.forEach(({ shift }) => {
      shift.roles.forEach((r) => {
        totalRequired += r.requiredCount;
        totalAssigned += r.assignedWorkers.length;
      });
    });
    return {
      totalRequired,
      totalAssigned,
      unfilled: totalRequired - totalAssigned,
    };
  }, [selectedShifts]);

  const handleBulkAssign = (workerId: string) => {
    const worker = getWorkerById(workerId);
    if (!worker) return;

    let assignedCount = 0;
    const modifiedIds: string[] = [];
    const woUpdates = new Map<string, WorkOrder>();

    selectedShifts.forEach(({ shift, workOrder }) => {
      const availability = getWorkerAvailability(
        workerId,
        [shift.date],
        availabilityRequests,
      );
      if (availability.level === 'red') return;

      const matchingRole = shift.roles.find((r) => {
        const isCompatible = workerHasAssignmentRole(worker, r.roleName);
        const hasSpace = r.assignedWorkers.length < r.requiredCount;
        const notAlreadyAssigned = !r.assignedWorkers.includes(workerId);
        return (
          isCompatible &&
          hasSpace &&
          notAlreadyAssigned &&
          workerMeetsRoleCertificationRequirements(
            worker,
            getRoleRequiredCertificationIds(r),
          )
        );
      });

      if (matchingRole) {
        const hasConflict = workOrders.some((wo) =>
          wo.shifts.some((s) => {
            if (s.id === shift.id) return false;
            if (s.date !== shift.date) return false;
            if (s.startTime >= shift.endTime || s.endTime <= shift.startTime)
              return false;
            return s.roles.some((r) => r.assignedWorkers.includes(workerId));
          }),
        );

        if (!hasConflict) {
          const updatedWo = woUpdates.get(workOrder.id) || { ...workOrder };
          updatedWo.shifts = updatedWo.shifts.map((s) => {
            if (s.id !== shift.id) return s;
            return {
              ...s,
              roles: s.roles.map((r) => {
                if (r.id !== matchingRole.id) return r;
                return {
                  ...r,
                  assignedWorkers: [...r.assignedWorkers, workerId],
                };
              }),
            };
          });
          woUpdates.set(workOrder.id, updatedWo);
          assignedCount++;
          modifiedIds.push(shift.id);
        }
      }
    });

    woUpdates.forEach((wo, id) => {
      updateWorkOrder(id, { shifts: wo.shifts });
    });

    onModifiedShifts(modifiedIds);
    toast({
      title: 'Bulk Assign Complete',
      description: `${worker.firstName} ${worker.lastName} assigned to ${assignedCount} of ${selectedShifts.length} shifts.`,
    });
    setShowAssignModal(false);
  };

  const handleBulkRemove = () => {
    let removedCount = 0;
    const modifiedIds: string[] = [];
    const woUpdates = new Map<string, WorkOrder>();

    selectedShifts.forEach(({ shift, workOrder }) => {
      const updatedWo = woUpdates.get(workOrder.id) || { ...workOrder };
      let modified = false;
      updatedWo.shifts = updatedWo.shifts.map((s) => {
        if (s.id !== shift.id) return s;
        return {
          ...s,
          roles: s.roles.map((r) => {
            if (r.assignedWorkers.length > 0) {
              modified = true;
              return { ...r, assignedWorkers: [] };
            }
            return r;
          }),
        };
      });
      if (modified) {
        woUpdates.set(workOrder.id, updatedWo);
        removedCount++;
        modifiedIds.push(shift.id);
      }
    });

    woUpdates.forEach((wo, id) => {
      updateWorkOrder(id, { shifts: wo.shifts });
    });

    onModifiedShifts(modifiedIds);
    toast({
      title: 'Assignments Removed',
      description: `Cleared all assignments from ${removedCount} shifts.`,
      variant: 'destructive',
    });
  };

  const handleCopyWeek = (targetWeekOffset: number) => {
    let copiedCount = 0;
    const modifiedIds: string[] = [];

    selectedShifts.forEach(({ shift, workOrder }) => {
      const sourceDate = new Date(shift.date);
      const targetDate = new Date(sourceDate);
      targetDate.setDate(targetDate.getDate() + targetWeekOffset * 7);
      const targetDateStr = targetDate.toISOString().split('T')[0];

      const existingShift = workOrder.shifts.find(
        (s) => s.date === targetDateStr,
      );
      if (!existingShift) {
        const newShiftId = `s_copy_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        const newShift = prepareShiftDuplicate(
          shift,
          {
            id: newShiftId,
            workOrderId: workOrder.id,
            shiftName: shift.shiftName,
            date: targetDateStr,
            startTime: shift.startTime,
            endTime: shift.endTime,
            roles: shift.roles.map((r) => ({
              ...r,
              id: `sr_copy_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
              assignedWorkers: [...r.assignedWorkers],
            })),
            plannedEquipment: [...(shift.plannedEquipment || [])],
            plannedMaterials: [...(shift.plannedMaterials || [])],
          },
          workOrder.shifts.map((item) => item.shiftName),
        );

        const updatedShifts = [...workOrder.shifts, newShift];
        updateWorkOrder(workOrder.id, { shifts: updatedShifts });
        copiedCount++;
        modifiedIds.push(newShiftId);
      }
    });

    onModifiedShifts(modifiedIds);
    toast({
      title: 'Shifts Copied',
      description: `${copiedCount} shifts copied to ${targetWeekOffset > 0 ? 'next' : 'previous'} week.`,
    });
    setShowCopyModal(false);
  };

  const handleAutoFill = () => {
    const activeWorkers = workers.filter((w) => w.status === 'active');
    let filledCount = 0;
    const modifiedIds: string[] = [];
    const woUpdates = new Map<string, WorkOrder>();

    const workerHoursThisWeek = new Map<string, number>();
    workOrders.forEach((wo) => {
      wo.shifts.forEach((s) => {
        const hours = calculateShiftHours(s.startTime, s.endTime);
        s.roles.forEach((r) => {
          r.assignedWorkers.forEach((wId) => {
            workerHoursThisWeek.set(
              wId,
              (workerHoursThisWeek.get(wId) || 0) + hours,
            );
          });
        });
      });
    });

    const overtimeLimit = (settings.overtimeRules.regularHoursLimit || 8) * 5;

    selectedShifts.forEach(({ shift, workOrder }) => {
      const updatedWo = woUpdates.get(workOrder.id) || { ...workOrder };
      let modified = false;

      updatedWo.shifts = updatedWo.shifts.map((s) => {
        if (s.id !== shift.id) return s;
        return {
          ...s,
          roles: s.roles.map((r) => {
            const needed = r.requiredCount - r.assignedWorkers.length;
            if (needed <= 0) return r;

            const shiftHours = calculateShiftHours(s.startTime, s.endTime);
            const newWorkers = [...r.assignedWorkers];

            const candidates = activeWorkers
              .filter((w) => {
                const availability = getWorkerAvailability(
                  w.id,
                  [s.date],
                  availabilityRequests,
                );
                return (
                  availability.level !== 'red' &&
                  !newWorkers.includes(w.id) &&
                  workerHasAssignmentRole(w, r.roleName) &&
                  workerMeetsRoleCertificationRequirements(
                    w,
                    getRoleRequiredCertificationIds(r),
                  )
                );
              })
              .map((w) => {
                let score = 0;

                if (workerHasAssignmentRole(w, r.roleName)) score += 100;

                if (getRoleRequiredCertificationIds(r).length > 0) score += 20;

                const currentHours = workerHoursThisWeek.get(w.id) || 0;
                if (currentHours + shiftHours > overtimeLimit) score -= 50;
                if (currentHours < overtimeLimit * 0.5) score += 10;

                const hasConflict = workOrders.some((wo) =>
                  wo.shifts.some((existingShift) => {
                    if (existingShift.date !== s.date) return false;
                    if (
                      existingShift.startTime >= s.endTime ||
                      existingShift.endTime <= s.startTime
                    )
                      return false;
                    return existingShift.roles.some((er) =>
                      er.assignedWorkers.includes(w.id),
                    );
                  }),
                );
                if (hasConflict) score -= 1000;

                return { worker: w, score };
              })
              .filter((c) => c.score > -500)
              .sort((a, b) => b.score - a.score);

            for (let i = 0; i < needed && i < candidates.length; i++) {
              newWorkers.push(candidates[i].worker.id);
              workerHoursThisWeek.set(
                candidates[i].worker.id,
                (workerHoursThisWeek.get(candidates[i].worker.id) || 0) +
                  shiftHours,
              );
              modified = true;
              filledCount++;
            }

            return { ...r, assignedWorkers: newWorkers };
          }),
        };
      });

      if (modified) {
        woUpdates.set(workOrder.id, updatedWo);
        modifiedIds.push(shift.id);
      }
    });

    woUpdates.forEach((wo, id) => {
      updateWorkOrder(id, { shifts: wo.shifts });
    });

    onModifiedShifts(modifiedIds);
    toast({
      title: 'Auto-Fill Complete',
      description: `${filledCount} worker${filledCount !== 1 ? 's' : ''} assigned across ${modifiedIds.length} shifts using smart scheduling.`,
    });
    setShowAutoFillModal(false);
  };

  if (selectedShiftIds.size === 0) return null;

  return (
    <>
      {}
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 bg-gray-900 text-white rounded-2xl shadow-2xl px-6 py-3 flex items-center gap-4 animate-in slide-in-from-bottom-4">
        <div className="flex items-center gap-2 pr-4 border-r border-gray-700">
          <span className="text-sm font-semibold">{selectedShiftIds.size}</span>
          <span className="text-xs text-gray-400">
            shift{selectedShiftIds.size > 1 ? 's' : ''} selected
          </span>
          {stats.unfilled > 0 && (
            <span className="flex items-center gap-1 text-xs text-yellow-400 ml-1">
              <AlertTriangle size={11} /> {stats.unfilled} unfilled
            </span>
          )}
        </div>

        <button
          onClick={() => setShowAssignModal(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-primary hover:bg-primary/90 rounded-lg text-sm font-medium transition-colors"
        >
          <UserPlus size={14} /> Assign Worker
        </button>

        <button
          onClick={handleBulkRemove}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600/20 hover:bg-red-600/40 text-red-300 rounded-lg text-sm font-medium transition-colors"
        >
          <UserMinus size={14} /> Remove All
        </button>

        <button
          onClick={() => setShowCopyModal(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm font-medium transition-colors"
        >
          <Copy size={14} /> Copy Week
        </button>

        <button
          onClick={() => setShowAutoFillModal(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-purple-600 to-primary hover:from-purple-500 hover:to-primary/90 rounded-lg text-sm font-medium transition-colors"
        >
          <Sparkles size={14} /> Auto-Fill
        </button>

        <button
          onClick={onClearSelection}
          className="p-1.5 hover:bg-gray-700 rounded-lg ml-2 transition-colors"
        >
          <X size={16} className="text-gray-400" />
        </button>
      </div>

      {}
      {showAssignModal && (
        <BulkAssignModal
          workers={workers.filter((w) => w.status === 'active')}
          selectedShifts={selectedShifts}
          onAssign={handleBulkAssign}
          onClose={() => setShowAssignModal(false)}
        />
      )}

      {}
      {showCopyModal && (
        <CopyWeekModal
          onCopy={handleCopyWeek}
          onClose={() => setShowCopyModal(false)}
        />
      )}

      {}
      {showAutoFillModal && (
        <AutoFillModal
          stats={stats}
          shiftCount={selectedShifts.length}
          onConfirm={handleAutoFill}
          onClose={() => setShowAutoFillModal(false)}
        />
      )}
    </>
  );
};

function calculateShiftHours(start: string, end: string): number {
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  return eh + em / 60 - (sh + sm / 60);
}

const BulkAssignModal: React.FC<{
  workers: Worker[];
  selectedShifts: { shift: Shift; workOrder: WorkOrder }[];
  onAssign: (workerId: string) => void;
  onClose: () => void;
}> = ({ workers, selectedShifts, onAssign, onClose }) => {
  const [search, setSearch] = useState('');

  const neededRoles = useMemo(() => {
    const roles = new Set<string>();
    selectedShifts.forEach(({ shift }) => {
      shift.roles.forEach((r) => {
        if (r.assignedWorkers.length < r.requiredCount) roles.add(r.roleName);
      });
    });
    return Array.from(roles);
  }, [selectedShifts]);

  const filteredWorkers = workers
    .filter((w) => {
      if (search) {
        const q = search.toLowerCase();
        return (
          `${w.firstName} ${w.lastName} ${workerRoleNames(w).join(' ')}`
            .toLowerCase()
            .includes(q) || w.type.toLowerCase().includes(q)
        );
      }
      return true;
    })
    .sort((a, b) => {
      const aMatch =
        neededRoles.includes(a.type) || neededRoles.includes(a.role) ? 1 : 0;
      const bMatch =
        neededRoles.includes(b.type) || neededRoles.includes(b.role) ? 1 : 0;
      return bMatch - aMatch;
    });

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-2 sm:p-4">
      <div
        className="bg-white rounded-xl w-full max-w-md max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 border-b border-gray-200 flex items-center justify-between flex-shrink-0 flex-wrap gap-3">
          <div>
            <h2 className="text-lg font-semibold text-gray-800">
              Bulk Assign Worker
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Assign to {selectedShifts.length} selected shifts
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 rounded-lg"
          >
            <X size={18} className="text-gray-400" />
          </button>
        </div>
        {neededRoles.length > 0 && (
          <div className="px-4 py-2 bg-blue-50 border-b border-blue-100 flex items-center gap-2 flex-shrink-0">
            <span className="text-xs text-primary font-medium">
              Roles needed:
            </span>
            {neededRoles.map((r) => (
              <span
                key={r}
                className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-xs font-medium"
              >
                {r}
              </span>
            ))}
          </div>
        )}
        <div className="p-3 border-b border-gray-100 flex-shrink-0">
          <input
            placeholder="Search workers..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
            autoFocus
          />
        </div>
        <div className="flex-1 overflow-y-auto">
          {filteredWorkers.map((w) => {
            const isMatch = [...neededRoles].some((role) =>
              workerHasAssignmentRole(w, role),
            );
            return (
              <button
                key={w.id}
                onClick={() => onAssign(w.id)}
                className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 text-left border-b border-gray-50 transition-colors"
              >
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${isMatch ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'}`}
                >
                  {w.firstName[0]}
                  {w.lastName[0]}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800">
                    {w.firstName} {w.lastName}
                  </p>
                  <p className="text-xs text-gray-400">{w.type}</p>
                </div>
                {isMatch && (
                  <span className="px-2 py-0.5 bg-green-50 text-green-600 rounded text-xs font-medium flex items-center gap-1">
                    <Check size={10} /> Match
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

const CopyWeekModal: React.FC<{
  onCopy: (offset: number) => void;
  onClose: () => void;
}> = ({ onCopy, onClose }) => {
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-2 sm:p-4">
      <div
        className="bg-white rounded-xl w-full max-w-sm"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-5 border-b border-gray-200 flex items-center justify-between flex-wrap gap-3">
          <h2 className="text-lg font-semibold text-gray-800">Copy Shifts</h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 rounded-lg"
          >
            <X size={18} className="text-gray-400" />
          </button>
        </div>
        <div className="p-5 space-y-3">
          <p className="text-sm text-gray-600">
            Copy selected shift configurations (including worker assignments) to
            another week.
          </p>
          <div className="space-y-2">
            <button
              onClick={() => onCopy(1)}
              className="w-full flex items-center gap-3 px-4 py-3 bg-blue-50 hover:bg-primary/15 rounded-lg text-left transition-colors border border-blue-200"
            >
              <Copy size={16} className="text-primary" />
              <div>
                <p className="text-sm font-medium text-blue-800">
                  Next Week (+7 days)
                </p>
                <p className="text-xs text-primary">
                  Copy all selected shifts forward one week
                </p>
              </div>
            </button>
            <button
              onClick={() => onCopy(2)}
              className="w-full flex items-center gap-3 px-4 py-3 bg-gray-50 hover:bg-gray-100 rounded-lg text-left transition-colors border border-gray-200"
            >
              <Copy size={16} className="text-gray-600" />
              <div>
                <p className="text-sm font-medium text-gray-800">
                  Two Weeks (+14 days)
                </p>
                <p className="text-xs text-gray-500">
                  Copy all selected shifts forward two weeks
                </p>
              </div>
            </button>
            <button
              onClick={() => onCopy(-1)}
              className="w-full flex items-center gap-3 px-4 py-3 bg-gray-50 hover:bg-gray-100 rounded-lg text-left transition-colors border border-gray-200"
            >
              <Copy size={16} className="text-gray-600" />
              <div>
                <p className="text-sm font-medium text-gray-800">
                  Previous Week (-7 days)
                </p>
                <p className="text-xs text-gray-500">
                  Copy all selected shifts back one week
                </p>
              </div>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

const AutoFillModal: React.FC<{
  stats: { totalRequired: number; totalAssigned: number; unfilled: number };
  shiftCount: number;
  onConfirm: () => void;
  onClose: () => void;
}> = ({ stats, shiftCount, onConfirm, onClose }) => {
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-2 sm:p-4">
      <div
        className="bg-white rounded-xl w-full max-w-sm"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-5 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center">
              <Sparkles size={20} className="text-white" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-800">
                Smart Auto-Fill
              </h2>
              <p className="text-xs text-gray-500">
                AI-powered shift assignment
              </p>
            </div>
          </div>
        </div>
        <div className="p-5 space-y-4">
          <div className="bg-gray-50 rounded-lg p-3 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Selected shifts</span>
              <span className="font-medium text-gray-800">{shiftCount}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Positions to fill</span>
              <span className="font-medium text-orange-600">
                {stats.unfilled}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Already assigned</span>
              <span className="font-medium text-green-600">
                {stats.totalAssigned}
              </span>
            </div>
          </div>

          <div className="space-y-1.5">
            <p className="text-xs font-semibold text-gray-700">
              Algorithm considers:
            </p>
            <div className="responsive-grid grid grid-cols-2 gap-1.5">
              {[
                'Role compatibility',
                'Worker availability',
                'Overtime limits',
                'Certifications',
                'Time conflicts',
                'Workload balance',
              ].map((item) => (
                <div
                  key={item}
                  className="flex items-center gap-1.5 text-xs text-gray-600"
                >
                  <Check size={10} className="text-green-500 flex-shrink-0" />
                  {item}
                </div>
              ))}
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={onConfirm}
              className="flex-1 px-4 py-2 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-lg text-sm font-medium hover:from-purple-500 hover:to-blue-500 flex items-center justify-center gap-1.5"
            >
              <Wand2 size={14} /> Auto-Fill Now
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BulkActionBar;
