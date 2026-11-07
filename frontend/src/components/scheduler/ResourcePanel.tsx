import React, { useMemo, useState } from 'react';
import {
  Filter,
  FolderKanban,
  GripVertical,
  Search,
  Users,
  X,
} from 'lucide-react';
import { useAppContext } from '@/contexts/AppContext';
import type { Shift, Worker } from '@/lib/types';
import {
  workerHasAssignmentRole,
  workerRoleNames,
} from '@/lib/workerRoleMatch';
import { getWorkerAvailability } from './AvailabilityIndicator';

export interface DraggingWorkerInfo {
  id: string;
  type: string;
  name: string;
}

interface ResourcePanelProps {
  selectedShiftIds: Set<string>;
  allShifts: { shift: Shift; workOrderId: string }[];
  onClose: () => void;
  focusedProjectId?: string | null;
  focusedWorkOrderId?: string | null;
  onWorkerDragStart?: (info: DraggingWorkerInfo) => void;
  onWorkerDragEnd?: () => void;
}

const workerName = (worker: Worker) =>
  `${worker.firstName} ${worker.lastName}`.trim();

const ResourcePanel: React.FC<ResourcePanelProps> = ({
  selectedShiftIds,
  allShifts,
  onClose,
  focusedProjectId,
  focusedWorkOrderId,
  onWorkerDragStart,
  onWorkerDragEnd,
}) => {
  const { workers, workOrders, availabilityRequests, getProjectById } =
    useAppContext();
  const [search, setSearch] = useState('');

  const selectedShifts = useMemo(
    () => allShifts.filter(({ shift }) => selectedShiftIds.has(shift.id)),
    [allShifts, selectedShiftIds],
  );
  const relevantWorkOrders = useMemo(
    () =>
      workOrders.filter((workOrder) =>
        focusedWorkOrderId
          ? workOrder.id === focusedWorkOrderId
          : focusedProjectId
            ? workOrder.projectId === focusedProjectId
            : false,
      ),
    [focusedProjectId, focusedWorkOrderId, workOrders],
  );
  const focusedProject = focusedProjectId
    ? getProjectById(focusedProjectId)
    : null;
  const assignmentWorkerIds = useMemo(() => {
    const ids = new Set<string>();
    relevantWorkOrders.forEach((workOrder) =>
      workOrder.shifts.forEach((shift) =>
        shift.roles.forEach((role) =>
          role.assignedWorkers.forEach((id) => ids.add(id)),
        ),
      ),
    );
    return ids;
  }, [relevantWorkOrders]);
  const neededRoles = useMemo(() => {
    const names = new Set<string>();
    selectedShifts.forEach(({ shift }) =>
      shift.roles.forEach((role) => {
        if (role.assignedWorkers.length < role.requiredCount)
          names.add(role.roleName);
      }),
    );
    return names;
  }, [selectedShifts]);
  const selectedDates = useMemo(
    () => [...new Set(selectedShifts.map(({ shift }) => shift.date))],
    [selectedShifts],
  );
  const filteredWorkers = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return workers
      .filter((worker) => worker.status === 'active')
      .filter((worker) => {
        const haystack =
          `${workerName(worker)} ${worker.type} ${workerRoleNames(worker).join(' ')}`.toLowerCase();
        return !needle || haystack.includes(needle);
      })
      .sort((left, right) => {
        const leftAssigned = assignmentWorkerIds.has(left.id) ? 0 : 1;
        const rightAssigned = assignmentWorkerIds.has(right.id) ? 0 : 1;
        return (
          leftAssigned - rightAssigned ||
          workerName(left).localeCompare(workerName(right))
        );
      });
  }, [assignmentWorkerIds, search, workers]);

  const dragWorker = (event: React.DragEvent, worker: Worker) => {
    const info: DraggingWorkerInfo = {
      id: worker.id,
      type: workerRoleNames(worker).join(', ') || worker.type,
      name: workerName(worker),
    };
    onWorkerDragStart?.(info);
    event.dataTransfer.setData(
      'application/json',
      JSON.stringify({
        type: 'worker',
        id: worker.id,
        workerType: info.type,
        workerName: info.name,
        linkedEquipmentId: null,
      }),
    );
    event.dataTransfer.effectAllowed = 'move';
  };

  return (
    <aside className="flex w-full max-h-[70dvh] lg:max-h-none lg:w-80 flex-shrink-0 flex-col border-l-2 border-gray-300 bg-white shadow-[inset_1px_0_0_rgba(17,24,39,0.08)]">
      <header className="border-b border-gray-200 p-3">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="flex items-center gap-2 font-semibold text-gray-800">
            <Users size={16} /> Workers
          </h3>
          <button
            onClick={onClose}
            className="rounded p-1 hover:bg-gray-100"
            aria-label="Close resources"
          >
            <X size={16} className="text-gray-400" />
          </button>
        </div>
        {focusedProject ? (
          <div className="mb-2 flex items-center gap-2 rounded-lg border border-purple-200 bg-purple-50 px-3 py-2">
            <FolderKanban size={14} className="text-purple-600" />
            <p className="min-w-0 flex-1 truncate text-xs font-semibold text-purple-800">
              {focusedProject.name}
            </p>
            <Filter size={12} className="text-purple-500" />
          </div>
        ) : null}
        <p className="rounded-lg border border-blue-100 bg-blue-50 px-2.5 py-1.5 text-[10px] text-primary">
          Drag workers onto open role slots. Role capacity is enforced.
        </p>
      </header>

      <div className="p-3">
        <label className="flex items-center rounded-lg bg-gray-100 px-2.5 py-2">
          <Search size={14} className="mr-2 text-gray-400" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search workers..."
            className="w-full bg-transparent text-sm outline-none placeholder:text-gray-400"
          />
        </label>
      </div>

      <div className="flex-1 space-y-1 overflow-y-auto px-3 pb-3">
        {selectedShifts.length > 0 && neededRoles.size > 0 ? (
          <p className="mb-2 text-xs text-primary">
            Needs: {[...neededRoles].join(', ')}
          </p>
        ) : null}
        {filteredWorkers.map((worker) => {
          const roles = workerRoleNames(worker);
          const compatible =
            neededRoles.size === 0 ||
            [...neededRoles].some((role) =>
              workerHasAssignmentRole(worker, role),
            );
          const availability = selectedDates.length
            ? getWorkerAvailability(
                worker.id,
                selectedDates,
                availabilityRequests,
              )
            : null;
          return (
            <div
              key={worker.id}
              draggable
              onDragStart={(event) => dragWorker(event, worker)}
              onDragEnd={() => onWorkerDragEnd?.()}
              className={`flex cursor-grab items-center gap-2 rounded-lg border p-2 transition-colors hover:bg-blue-50 ${
                compatible ? 'border-transparent' : 'border-gray-100 opacity-65'
              }`}
            >
              <GripVertical size={12} className="text-gray-300" />
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-500 text-xs font-bold text-white">
                {worker.firstName?.[0]}
                {worker.lastName?.[0]}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-gray-800">
                  {workerName(worker)}
                </p>
                <p className="truncate text-xs text-gray-500">
                  {roles.join(', ') || worker.type}
                </p>
              </div>
              {availability && availability.level !== 'green' ? (
                <span
                  className={`rounded px-1 text-[9px] font-semibold ${
                    availability.level === 'red'
                      ? 'bg-red-100 text-red-700'
                      : 'bg-amber-100 text-amber-700'
                  }`}
                >
                  {availability.label}
                </span>
              ) : null}
            </div>
          );
        })}
      </div>
    </aside>
  );
};

export default ResourcePanel;
