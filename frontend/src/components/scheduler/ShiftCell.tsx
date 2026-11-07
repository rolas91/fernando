import { WorkerConfirmationIcons } from './WorkerConfirmationIcons';
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useAppContext } from '@/contexts/AppContext';
import { Shift } from '@/lib/types';
import { getWorkerAvailability } from './AvailabilityIndicator';
import type { DraggingWorkerInfo } from './ResourcePanel';
import { workerHasAssignmentRole } from '@/lib/workerRoleMatch';
import {
  getShiftHeadcountTextClass,
  getRoleHeadcountTextClass,
  getEffectiveShiftStatus,
  getShiftStatusPresentation,
  getShiftRoleStartTime,
} from './shiftConfirmation';
import type { EffectiveShiftStatus } from './shiftConfirmation';
import { ShiftHoverTooltip } from './ShiftHoverTooltip';
import {
  Users,
  GripVertical,
  X,
  Clock,
  Edit2,
  Copy,
  Clipboard,
  CalendarPlus,
  CalendarRange,
  Trash2,
  AlertTriangle,
  ArrowRight,
  Send,
  Bell,
  UserCheck,
} from 'lucide-react';

interface ShiftCellProps {
  shift: Shift;
  workOrderId: string;
  isSelected: boolean;
  isWeekend: boolean;
  isNewlyCreated?: boolean;
  draggingWorker?: DraggingWorkerInfo | null;
  onSelect: (shiftId: string, e: React.MouseEvent) => void;
  onDrop: (
    shiftId: string,
    roleId: string,
    data: { type: string; id: string; linkedEquipmentId?: string | null },
  ) => void;
  onRemoveWorker: (shiftId: string, roleId: string, workerId: string) => void;
  onEditShift?: (shiftId: string, workOrderId: string) => void;
  onAddShiftSameDay?: (date: string, workOrderId: string) => void;
  onCopyShift?: (shiftId: string, workOrderId: string) => void;
  onPasteShift?: (targetDate: string, workOrderId: string) => void;
  onDuplicateToNextDay?: (shiftId: string, workOrderId: string) => void;
  onDuplicateToWeekDays?: (shiftId: string, workOrderId: string) => void;
  onClearShift?: (shiftId: string, workOrderId: string) => void;
  hasClipboard?: boolean;
  onShiftDragCopy?: (shiftId: string, workOrderId: string) => void;
  onOpenShiftDetails?: (shiftId: string, workOrderId: string) => void;
  effectiveStatus?: EffectiveShiftStatus;
}

const ShiftCell: React.FC<ShiftCellProps> = ({
  shift,
  workOrderId,
  isSelected,
  isWeekend,
  isNewlyCreated,
  draggingWorker,
  onSelect,
  onDrop,
  onRemoveWorker,
  onEditShift,
  onAddShiftSameDay,
  onCopyShift,
  onPasteShift,
  onDuplicateToNextDay,
  onDuplicateToWeekDays,
  onClearShift,
  hasClipboard,
  onShiftDragCopy,
  onOpenShiftDetails,
  effectiveStatus,
}) => {
  const { getWorkerById, availabilityRequests } = useAppContext();
  const [dragOverRoleId, setDragOverRoleId] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [isCopyDragging, setIsCopyDragging] = useState(false);
  const contextMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!contextMenu) return;
    const handleClick = (e: MouseEvent) => {
      if (
        contextMenuRef.current &&
        !contextMenuRef.current.contains(e.target as Node)
      ) {
        setContextMenu(null);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [contextMenu]);

  const workerAvailMap = useMemo(() => {
    const map = new Map<string, 'green' | 'yellow' | 'red'>();
    const shiftDates = [shift.date];
    shift.roles.forEach((role) => {
      role.assignedWorkers.forEach((wid) => {
        const info = getWorkerAvailability(
          wid,
          shiftDates,
          availabilityRequests,
        );
        map.set(wid, info.level);
      });
    });
    return map;
  }, [shift, availabilityRequests]);

  const isRoleCompatible = (roleName: string): boolean => {
    if (!draggingWorker) return true;
    const worker = getWorkerById(draggingWorker.id);
    return worker ? workerHasAssignmentRole(worker, roleName) : false;
  };

  const isWorkerAlreadyInRole = (roleId: string): boolean => {
    if (!draggingWorker) return false;
    const role = shift.roles.find((r) => r.id === roleId);
    return role ? role.assignedWorkers.includes(draggingWorker.id) : false;
  };

  const handleDragOver = (e: React.DragEvent, roleId: string) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    setDragOverRoleId(roleId);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOverRoleId(null);
  };

  const handleDrop = (e: React.DragEvent, roleId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverRoleId(null);

    try {
      const rawData = e.dataTransfer.getData('application/json');
      if (rawData) {
        const data = JSON.parse(rawData);
        if (data.type === 'shift_copy') {
          if (onPasteShift) {
            onPasteShift(shift.date, workOrderId);
          }
          return;
        }
        const targetRole = shift.roles.find((role) => role.id === roleId);
        if (
          data.type === 'worker' &&
          targetRole &&
          !isRoleCompatible(targetRole.roleName)
        ) {
          return;
        }
        onDrop(shift.id, roleId, data);
      }
    } catch (err) {
      console.error('Drop error:', err);
    }
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY });
  };

  const handleShiftDragStart = (e: React.DragEvent) => {
    if (e.altKey && onShiftDragCopy) {
      e.stopPropagation();
      setIsCopyDragging(true);
      const data = JSON.stringify({
        type: 'shift_copy',
        shiftId: shift.id,
        workOrderId,
      });
      e.dataTransfer.setData('application/json', data);
      e.dataTransfer.effectAllowed = 'copy';
      const el = document.createElement('div');
      el.className =
        'bg-blue-500 text-white px-3 py-1 rounded text-xs font-medium shadow-lg';
      el.textContent = 'Copy Shift';
      el.style.position = 'absolute';
      el.style.top = '-1000px';
      document.body.appendChild(el);
      e.dataTransfer.setDragImage(el, 40, 15);
      setTimeout(() => document.body.removeChild(el), 0);
      onShiftDragCopy(shift.id, workOrderId);
    }
  };

  const handleShiftDragEnd = () => {
    setIsCopyDragging(false);
  };

  const formatTime = (time: string) => {
    const [h, m] = time.split(':');
    const hour = parseInt(h);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
    return `${displayHour}:${m}${ampm}`;
  };

  const totalAssigned = shift.roles.reduce(
    (a, r) => a + r.assignedWorkers.length,
    0,
  );
  const totalRequired = shift.roles.reduce((a, r) => a + r.requiredCount, 0);
  const effectiveShiftStatus =
    effectiveStatus === undefined
      ? getEffectiveShiftStatus(shift)
      : effectiveStatus;
  const statusPresentation = getShiftStatusPresentation(effectiveShiftStatus);
  const isCompleted =
    effectiveShiftStatus === 'shift_completed' ||
    effectiveShiftStatus === 'pm_approved';

  const hasAvailabilityWarnings = useMemo(() => {
    let hasRed = false;
    let hasYellow = false;
    workerAvailMap.forEach((level) => {
      if (level === 'red') hasRed = true;
      if (level === 'yellow') hasYellow = true;
    });
    return { hasRed, hasYellow };
  }, [workerAvailMap]);

  const workerDotColor = (level: 'green' | 'yellow' | 'red') => {
    switch (level) {
      case 'green':
        return 'bg-green-500';
      case 'yellow':
        return 'bg-yellow-400';
      case 'red':
        return 'bg-red-500';
    }
  };

  const isWorkerDragActive = !!draggingWorker;

  return (
    <ShiftHoverTooltip
      shift={shift}
      effectiveStatus={effectiveShiftStatus}
      onOpenDetails={
        onOpenShiftDetails
          ? () => onOpenShiftDetails(shift.id, workOrderId)
          : undefined
      }
    >
      <div
        className={`flex-1 min-w-[140px] border-r border-gray-100 p-1.5 transition-colors cursor-pointer group/cell relative ${
          isCopyDragging
            ? 'bg-blue-50/50 ring-2 ring-inset ring-blue-300 ring-dashed'
            : isCompleted
              ? 'bg-gray-50/90'
              : effectiveShiftStatus
                ? statusPresentation.shell
                : isWeekend
                  ? 'bg-gray-50/50'
                  : 'hover:bg-gray-50/50'
        } ${isSelected ? 'ring-2 ring-inset ring-blue-400 border-blue-400' : ''}`}
        onClick={(e) => onSelect(shift.id, e)}
        onDoubleClick={(e) => {
          e.stopPropagation();
          onEditShift?.(shift.id, workOrderId);
        }}
        onContextMenu={handleContextMenu}
        draggable={true}
        onDragStart={handleShiftDragStart}
        onDragEnd={handleShiftDragEnd}
      >
        {}
        {isNewlyCreated && (
          <div className="absolute top-0 left-0 right-0 h-1 bg-green-500 animate-pulse rounded-t" />
        )}

        {}
        {isCopyDragging && (
          <div className="absolute inset-0 bg-blue-200/30 border-2 border-dashed border-blue-400 rounded z-10 flex items-center justify-center pointer-events-none">
            <div className="bg-blue-500 text-white px-2 py-0.5 rounded text-xs font-medium flex items-center gap-1">
              <Copy size={10} /> Copying...
            </div>
          </div>
        )}

        <div className="space-y-1.5">
          {}
          <div className="text-xs font-medium px-1 flex items-center justify-between text-gray-500">
            <span className="flex items-center gap-1">
              <Clock size={10} className="opacity-60" />
              Start {formatTime(getShiftRoleStartTime(shift))}
            </span>
            <div className="flex items-center gap-1">
              {}
              {hasAvailabilityWarnings.hasRed && (
                <div
                  className="w-4 h-4 rounded-full bg-red-100 flex items-center justify-center"
                  title="Worker has time-off/unavailable on this date"
                >
                  <AlertTriangle size={10} className="text-red-600" />
                </div>
              )}
              {!hasAvailabilityWarnings.hasRed &&
                hasAvailabilityWarnings.hasYellow && (
                  <div
                    className="w-4 h-4 rounded-full bg-yellow-100 flex items-center justify-center"
                    title="Worker has preferred hours or pending time-off"
                  >
                    <AlertTriangle size={10} className="text-yellow-600" />
                  </div>
                )}
              <span
                className={`text-xs font-bold ${getShiftHeadcountTextClass(shift)}`}
              >
                {totalAssigned}/{totalRequired}
              </span>
              {onEditShift && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onEditShift(shift.id, workOrderId);
                  }}
                  className="opacity-0 group-hover/cell:opacity-100 p-0.5 hover:bg-primary/15 rounded transition-opacity"
                  title="Edit shift"
                >
                  <Edit2 size={10} className="text-blue-500" />
                </button>
              )}
              {onAddShiftSameDay && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onAddShiftSameDay(shift.date, workOrderId);
                  }}
                  className="opacity-0 group-hover/cell:opacity-100 p-0.5 hover:bg-emerald-50 rounded transition-opacity"
                  title="Add another shift same day"
                >
                  <CalendarPlus size={10} className="text-emerald-600" />
                </button>
              )}
            </div>
          </div>

          <div className="px-1">
            <span
              className={`inline-flex rounded-full px-1.5 py-0.5 text-[9px] font-semibold ${statusPresentation.badge}`}
            >
              {statusPresentation.label}
            </span>
          </div>

          {shift.roles.map((role) => {
            const isDragOver = dragOverRoleId === role.id;
            const needsMore = role.assignedWorkers.length < role.requiredCount;
            const compatible = isRoleCompatible(role.roleName);
            const alreadyAssigned = isWorkerAlreadyInRole(role.id);

            let roleClasses = '';
            if (isWorkerDragActive) {
              if (alreadyAssigned) {
                roleClasses = 'border-gray-200 bg-gray-50 opacity-50';
              } else if (compatible) {
                roleClasses = isDragOver
                  ? 'border-green-500 bg-green-50 shadow-lg ring-2 ring-green-300 scale-[1.02]'
                  : 'border-green-300 bg-green-50/50 shadow-sm ring-1 ring-green-200';
              } else {
                roleClasses = 'border-gray-200 bg-gray-50/50 opacity-40';
              }
            } else {
              roleClasses = isDragOver
                ? 'border-blue-400 bg-blue-50 shadow-md ring-2 ring-blue-200'
                : 'border-gray-200';
            }

            return (
              <div
                key={role.id}
                className={`bg-white border rounded-lg p-2 shadow-sm transition-all duration-150 ${roleClasses}`}
                onDragOver={(e) => handleDragOver(e, role.id)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, role.id)}
              >
                {}
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`text-xs font-semibold px-1.5 py-0.5 rounded ${
                        role.roleName === 'Foreman'
                          ? 'bg-purple-100 text-purple-700'
                          : role.roleName === 'Flagger'
                            ? 'bg-blue-100 text-blue-700'
                            : role.roleName === 'Traffic Controller'
                              ? 'bg-teal-100 text-teal-700'
                              : role.roleName === 'Truck Driver'
                                ? 'bg-orange-100 text-orange-700'
                                : 'bg-gray-100 text-gray-700'
                      }`}
                    >
                      {role.roleName}
                    </span>
                    {}
                    {isWorkerDragActive && !alreadyAssigned && compatible && (
                      <span className="flex items-center gap-0.5 text-[9px] text-green-600 font-medium bg-green-100 px-1 py-0 rounded animate-pulse">
                        <UserCheck size={8} /> Match
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <Users size={10} className="text-gray-400" />
                    <span
                      className={`text-xs font-bold ${getRoleHeadcountTextClass(role)}`}
                    >
                      {role.assignedWorkers.length}/{role.requiredCount}
                    </span>
                  </div>
                </div>

                {}
                {role.assignedWorkers.map((wid) => {
                  const worker = getWorkerById(wid);
                  const availLevel = workerAvailMap.get(wid) || 'green';
                  return worker ? (
                    <div
                      key={wid}
                      className="flex items-center gap-1.5 py-0.5 group/item"
                    >
                      <div
                        className={`w-2 h-2 rounded-full flex-shrink-0 ${workerDotColor(availLevel)}`}
                      />
                      <span
                        className={`text-xs flex-1 truncate ${
                          availLevel === 'red'
                            ? 'text-red-600 font-medium'
                            : availLevel === 'yellow'
                              ? 'text-yellow-700'
                              : 'text-gray-700'
                        }`}
                      >
                        {worker.firstName} {worker.lastName}
                      </span>
                      {availLevel === 'red' && (
                        <span className="text-[8px] px-0.5 py-0 rounded bg-red-100 text-red-500 font-bold flex-shrink-0">
                          !
                        </span>
                      )}
                      <WorkerConfirmationIcons
                        confirmation={role.workerConfirmations?.find(
                          (entry) => entry.workerId === wid,
                        )}
                        cancelled={Boolean(
                          shift.cancelled ||
                          shift.status === 'shift_cancelled' ||
                          effectiveShiftStatus === 'shift_cancelled',
                        )}
                        showPending={
                          effectiveShiftStatus === 'awaiting_response'
                        }
                      />
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onRemoveWorker(shift.id, role.id, wid);
                        }}
                        className="opacity-0 group-hover/item:opacity-100 p-0.5 hover:bg-red-100 rounded transition-opacity"
                        title="Remove worker"
                      >
                        <X size={10} className="text-red-500" />
                      </button>
                    </div>
                  ) : null;
                })}

                {}
                {(needsMore || isDragOver) && (
                  <div
                    className={`mt-1 border border-dashed rounded p-1.5 text-center transition-all ${
                      isDragOver && isWorkerDragActive && compatible
                        ? 'border-green-400 bg-green-100/50'
                        : isDragOver
                          ? 'border-blue-400 bg-blue-100/50'
                          : isWorkerDragActive && compatible
                            ? 'border-green-300 bg-green-50/30'
                            : 'border-gray-300'
                    }`}
                  >
                    <div className="flex items-center justify-center gap-1">
                      {isDragOver && isWorkerDragActive ? (
                        <span className="text-xs font-medium flex items-center gap-1">
                          {compatible ? (
                            <>
                              <UserCheck size={10} className="text-green-600" />
                              <span className="text-green-600">
                                Drop {draggingWorker?.name?.split(' ')[0]} here
                              </span>
                            </>
                          ) : (
                            <>
                              <AlertTriangle
                                size={10}
                                className="text-amber-500"
                              />
                              <span className="text-amber-600">
                                Type mismatch — drop anyway?
                              </span>
                            </>
                          )}
                        </span>
                      ) : isDragOver ? (
                        <span className="text-xs font-medium text-primary">
                          Drop here to assign
                        </span>
                      ) : isWorkerDragActive && compatible ? (
                        <span className="text-xs text-green-500 flex items-center gap-1">
                          <ArrowRight size={10} />
                          Drop {draggingWorker?.name?.split(' ')[0]} here
                        </span>
                      ) : (
                        <>
                          <GripVertical size={10} className="text-gray-400" />
                          <span className="text-xs text-gray-400">
                            Drag resource here
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                )}

                {}
                {isDragOver && isWorkerDragActive && draggingWorker && (
                  <div className="absolute z-50 -top-10 left-1/2 -translate-x-1/2 bg-gray-900 text-white px-3 py-1.5 rounded-lg shadow-xl text-xs whitespace-nowrap pointer-events-none">
                    <div className="flex items-center gap-1.5">
                      <span className="font-medium">{draggingWorker.name}</span>
                      <ArrowRight size={10} />
                      <span
                        className={
                          compatible
                            ? 'text-green-400 font-medium'
                            : 'text-amber-400 font-medium'
                        }
                      >
                        {role.roleName}
                      </span>
                      {!compatible && (
                        <span className="text-amber-300 text-[10px]">
                          (mismatch)
                        </span>
                      )}
                    </div>
                    <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 w-2 h-2 bg-gray-900 rotate-45" />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {}
        <div className="absolute bottom-0.5 right-1 opacity-0 group-hover/cell:opacity-60 transition-opacity">
          <span className="text-[9px] text-gray-400 flex items-center gap-0.5">
            <Copy size={8} /> Alt+drag
          </span>
        </div>

        {}
        {contextMenu && (
          <div
            ref={contextMenuRef}
            className="fixed z-50 bg-white rounded-lg shadow-xl border border-gray-200 py-1 min-w-[180px]"
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            <button
              onClick={(e) => {
                e.stopPropagation();
                onCopyShift?.(shift.id, workOrderId);
                setContextMenu(null);
              }}
              className="w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-primary/10 hover:text-primary/90 flex items-center gap-2"
            >
              <Copy size={14} /> Copy Shift
            </button>
            {hasClipboard && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onPasteShift?.(shift.date, workOrderId);
                  setContextMenu(null);
                }}
                className="w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-primary/10 hover:text-primary/90 flex items-center gap-2"
              >
                <Clipboard size={14} /> Paste Shift
              </button>
            )}
            <div className="border-t border-gray-100 my-1" />
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDuplicateToNextDay?.(shift.id, workOrderId);
                setContextMenu(null);
              }}
              className="w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-green-50 hover:text-green-700 flex items-center gap-2"
            >
              <CalendarPlus size={14} /> Duplicate to Next Day
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDuplicateToWeekDays?.(shift.id, workOrderId);
                setContextMenu(null);
              }}
              className="w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-green-50 hover:text-green-700 flex items-center gap-2"
            >
              <CalendarRange size={14} /> Duplicate to All Week Days
            </button>
            <div className="border-t border-gray-100 my-1" />
            <button
              onClick={(e) => {
                e.stopPropagation();
                onClearShift?.(shift.id, workOrderId);
                setContextMenu(null);
              }}
              className="w-full px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
            >
              <Trash2 size={14} /> Clear Shift
            </button>
          </div>
        )}
      </div>
    </ShiftHoverTooltip>
  );
};

export default ShiftCell;
