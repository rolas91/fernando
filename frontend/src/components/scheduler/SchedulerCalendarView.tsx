import DataPagination from '@/components/shared/DataPagination';
import { useAssignmentChatRead } from '@/hooks/use-assignment-chat-read';
import { AppContextOverride } from '@/contexts/AppContext';
import { useScheduleScope, useAssignmentRecords, usePagePosition, useConflictAssignments } from '@/hooks/use-assignment-paging';
import { AssignmentReadState } from '@/components/shared/AssignmentReadState';
import { useScheduleSubmissionIndex } from '@/hooks/use-assignment-documents';
import { DocumentReadNotice } from './DocumentReadNotice';
import { WorkerConfirmationIcons } from './WorkerConfirmationIcons';
import React, {
  useState,
  useMemo,
  useCallback,
  useEffect,
  useRef,
} from 'react';
import { useAppContext } from '@/contexts/AppContext';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { getLocalDateString, getWeekDates } from '@/lib/dates';
import {
  cancelShift,
  dbBulkCreateShifts,
  fetchShiftStats,
  type ShiftAggregateCounters,
} from '@/lib/db';
import {
  WorkOrder,
  Shift,
  type Project,
  type Certification,
  type Worker,
  type StatusCatalogItem,
} from '@/lib/types';
import NotifyWorkerModal, {
  NotificationRecipient,
  NotificationLogEntry,
  sendNotificationAction,
} from './NotifyWorkerModal';
import { applyNotificationRequestEntriesToWorkOrder } from './notificationConfirmationUpdates';
import WorkOrderFileUploadsField from '@/components/workorders/WorkOrderFileUploadsField';
import ShiftFormTemplatesPicker from '@/components/forms/ShiftFormTemplatesPicker';
import { AssignmentAddressField } from '@/components/workorders/AssignmentAddressField';
import { DEFAULT_ASSIGNMENT_COUNTRY } from '@/lib/googlePlaceAddress';
import { getDefaultShiftFormTemplateIds } from '@/lib/defaultShiftForms';
import { findBulkShiftWorkerConflicts } from '@/lib/bulkShiftWorkerConflicts';
import {
  BulkShiftConflictDialog,
  type BulkShiftConflict,
} from './BulkShiftConflictDialog';
import { workOrderUpdateErrorFeedback } from '@/lib/workOrderUpdateError';
import {
  assignmentDateRangeLabel,
  formatAssignmentDateRangeShort,
  isAssignmentRangeWithinProject,
  isShiftDateWithinAssignmentRange,
  projectHasScheduleBounds,
  workOrderHasAssignmentDateRange,
} from '@/lib/workOrderShiftDateRange';
import {
  getShiftConfirmationSummary,
  getShiftCardAccent,
  getShiftHeadcountTextClass,
  getWorkerConfirmationStatus,
  getShiftMissingWorkerSlots,
  getRoleHeadcountTextClass,
  getEffectiveShiftStatus,
  getShiftStatusPresentation,
  getShiftRoleStartTime,
  canCancelShiftStatus,
  hasWorkersPendingInitialNotification,
  hasWorkerConfirmationRequest,
  isWorkerPendingInitialNotification,
  reactivateCancelledShiftWithManualStatus,
  prepareShiftDuplicate,
} from './shiftConfirmation';
import { ShiftHoverTooltip } from './ShiftHoverTooltip';
import { ShiftDetailsSheet } from './ShiftDetailsSheet';
import { AssignmentDetailSidebar } from './AssignmentDetailSidebar';
import { ShiftChatAside } from './ShiftChatAside';
import { fetchShiftChatUnreadCount } from '@/lib/shiftChat';
import { computeScheduleDashboardStats } from './scheduleDashboardStats';
import { buildCompletedWorkOrderShiftKeys } from '@/lib/shiftCompletion';
import { CertificationMultiSelect } from '@/components/skills/SkillMultiSelect';
import {
  ShiftResourcePlanner,
  type PlannedResource,
} from './ShiftResourcePlanner';
import {
  getRoleRequiredCertificationIds,
  getWorkerActiveCertificationIdSet,
  workerMeetsRoleCertificationRequirements,
} from '@/lib/workerCertificationMatch';
import {
  assignmentRoleOptions,
  workerHasAssignmentRole,
  workerRoleNames,
} from '@/lib/workerRoleMatch';
import {
  formatShiftEndedAgo,
  getRestHoursSinceLastShift,
  getWeeklyAssignedShiftCount,
} from '@/lib/workerRest';
import {
  Users,
  Clock,
  MapPin,
  Plus,
  CalendarDays,
  Truck,
  Eye,
  Search,
  X,
  Filter,
  GripVertical,
  Edit2,
  Copy,
  Trash2,
  UserPlus,
  FolderKanban,
  Package,
  Repeat,
  AlertTriangle,
  Check,
  MoreHorizontal,
  Settings2,
  Bell,
  CheckCircle2,
  UserX,
  Mail,
  CalendarClock,
  Info,
  MessageCircle,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

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
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import ShiftOverviewTab, { emptyShiftAddress } from './ShiftOverviewTab';
import {
  availableRoleNamesForCard,
  duplicateRoleNames,
  nextUnusedRoleName,
} from '@/lib/shiftRoleSelection';

interface SchedulerCalendarViewProps {
  onOpenNewWO?: () => void;
  onFocusProject?: (projectId: string) => void;
}

const startOfWeek = (date: Date) => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day));
  return d;
};

const assignmentTouchesDateScope = (wo: WorkOrder, dateStrs: string[]) => {
  if (dateStrs.length === 0) return false;
  const dateSet = new Set(dateStrs);
  if ((wo.shifts || []).some((shift) => dateSet.has(shift.date))) return true;
  if (!workOrderHasAssignmentDateRange(wo)) return false;
  const scopeStart = dateStrs[0];
  const scopeEnd = dateStrs[dateStrs.length - 1];
  return wo.startDate <= scopeEnd && wo.endDate >= scopeStart;
};

const DEFAULT_SHIFT_DURATION_MINUTES = 9 * 60;

const parseTimeToMinutes = (time?: string | null) => {
  if (!time) return null;
  const [hours, minutes] = time.split(':').map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  return hours * 60 + minutes;
};

const addMinutesToTime = (time: string, minutesToAdd: number) => {
  const totalMinutes = parseTimeToMinutes(time) ?? 0;
  const normalized =
    (((totalMinutes + minutesToAdd) % (24 * 60)) + 24 * 60) % (24 * 60);
  const hours = `${Math.floor(normalized / 60)}`.padStart(2, '0');
  const minutes = `${normalized % 60}`.padStart(2, '0');
  return `${hours}:${minutes}`;
};

const formatTimeLabel = (time?: string | null) => {
  if (!time) return '--';
  const [hours, minutes] = time.split(':').map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return time;
  const value = new Date();
  value.setHours(hours, minutes, 0, 0);
  return value.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
  });
};

const getShiftTemplateDurationMinutes = (
  template?: {
    durationHours?: number | null;
    startTime?: string | null;
    endTime?: string | null;
  } | null,
) => {
  const startMinutes = parseTimeToMinutes(template?.startTime);
  const endMinutes = parseTimeToMinutes(template?.endTime);
  if (startMinutes !== null && endMinutes !== null) {
    const diff = endMinutes - startMinutes;
    return diff > 0 ? diff : diff + 24 * 60;
  }
  if (
    typeof template?.durationHours === 'number' &&
    template.durationHours > 0
  ) {
    return template.durationHours * 60;
  }
  return DEFAULT_SHIFT_DURATION_MINUTES;
};

const getShiftTemplateRangeLabel = (
  template?: {
    startTime?: string | null;
    endTime?: string | null;
  } | null,
) => {
  if (!template?.startTime || !template?.endTime) {
    return 'No predefined range';
  }
  return `${formatTimeLabel(template.startTime)} - ${formatTimeLabel(template.endTime)}`;
};

function formatWorkOrderSiteAddress(
  wo: WorkOrder,
  project?: Project | null,
): string {
  const street = (wo.assignmentAddress ?? '').trim();
  const cityState = [wo.assignmentCity, wo.assignmentState]
    .filter(Boolean)
    .join(', ');
  const tail = [cityState, wo.assignmentZipCode]
    .filter(Boolean)
    .join(' ')
    .trim();
  if (street) {
    return tail ? `${street} · ${tail}` : street;
  }
  const ploc = (project?.location ?? '').trim();
  const pcity = (project?.city ?? '').trim();
  const pstate = (project?.state ?? '').trim();
  const pzip = (project?.zipCode ?? '').trim();
  const parts: string[] = [];
  if (ploc) parts.push(ploc);
  const cityLine = [pcity, pstate].filter(Boolean).join(', ');
  if (cityLine) parts.push(cityLine);
  if (pzip) parts.push(pzip);
  return parts.length > 0 ? parts.join(' · ') : '—';
}

const isCancelledAssignment = (
  wo: Pick<WorkOrder, 'status'> | null | undefined,
) => {
  const status = String(wo?.status ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');
  return status === 'cancelled' || status === 'canceled';
};

function certificationNamesFromCatalog(
  ids: string[] | undefined,
  catalog: Certification[],
): string[] {
  if (!ids?.length) return [];
  const map = new Map(catalog.map((s) => [s.id, s.name]));
  return ids.map((id) => map.get(id) ?? id);
}

function workerCertificationDisplayLabels(
  worker: Worker,
  catalog: Certification[],
): string[] {
  const expanded = (worker.certifications ?? [])
    .filter((s) => s.status !== 'inactive')
    .map((s) => s.name.trim())
    .filter(Boolean);
  if (expanded.length > 0) {
    return [...new Set(expanded)].sort((a, b) => a.localeCompare(b));
  }
  return [...getWorkerActiveCertificationIdSet(worker)]
    .map((id) => catalog.find((s) => s.id === id)?.name ?? id)
    .sort((a, b) => a.localeCompare(b));
}

function missingRequirementCertificationNames(
  worker: Worker,
  requiredIds: string[] | undefined,
  catalog: Certification[],
): string[] {
  if (!requiredIds?.length) return [];
  const have = getWorkerActiveCertificationIdSet(worker);
  return certificationNamesFromCatalog(
    requiredIds.filter((id) => !have.has(id)),
    catalog,
  );
}

const RoleRequiredCertificationsInfo: React.FC<{
  requiredCertificationIds?: string[];
  certificationCatalog: Certification[];
}> = ({ requiredCertificationIds, certificationCatalog }) => {
  const names = certificationNamesFromCatalog(
    requiredCertificationIds,
    certificationCatalog,
  );
  return (
    <Tooltip delayDuration={150}>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="-m-0.5 inline-flex shrink-0 rounded p-0.5 text-gray-400 transition-colors hover:bg-gray-200/80 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Required certifications for this role"
          onPointerDown={(e) => e.stopPropagation()}
        >
          <Info size={14} strokeWidth={2} className="shrink-0" />
        </button>
      </TooltipTrigger>
      <TooltipContent
        side="top"
        align="start"
        className="max-w-[17rem] space-y-1.5 px-3 py-2 text-left text-[11px] leading-snug"
      >
        <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
          Certifications required (role)
        </p>
        {names.length === 0 ? (
          <p className="text-popover-foreground">
            No catalog certifications configured for this role.
          </p>
        ) : (
          <ul className="list-inside list-disc space-y-0.5 font-medium text-popover-foreground">
            {names.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        )}
        <p className="border-border/50 border-t pt-1.5 text-[10px] text-muted-foreground">
          Workers must have every listed certification to be assigned to this
          slot.
        </p>
      </TooltipContent>
    </Tooltip>
  );
};

const AssignedWorkerCertificationsInfo: React.FC<{
  worker: Worker;
  roleName: string;
  requiredCertificationIds?: string[];
  certificationCatalog: Certification[];
}> = ({ worker, roleName, requiredCertificationIds, certificationCatalog }) => {
  const workerLabels = workerCertificationDisplayLabels(
    worker,
    certificationCatalog,
  );
  const requiredNames = certificationNamesFromCatalog(
    requiredCertificationIds,
    certificationCatalog,
  );
  const meets = workerMeetsRoleCertificationRequirements(
    worker,
    requiredCertificationIds,
  );
  const missing = missingRequirementCertificationNames(
    worker,
    requiredCertificationIds,
    certificationCatalog,
  );
  return (
    <Tooltip delayDuration={150}>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="-m-0.5 inline-flex shrink-0 rounded p-0.5 text-gray-400 transition-colors hover:bg-emerald-100/90 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={`Certifications for ${worker.firstName} ${worker.lastName}`}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <Info size={14} strokeWidth={2} />
        </button>
      </TooltipTrigger>
      <TooltipContent
        side="left"
        align="start"
        className="max-w-[17rem] space-y-2 px-3 py-2 text-left text-[11px] leading-snug"
      >
        <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
          Worker certifications
        </p>
        <p className="font-semibold text-popover-foreground">
          {worker.firstName} {worker.lastName}
        </p>
        {workerLabels.length === 0 ? (
          <p className="text-muted-foreground">
            No active certifications on profile.
          </p>
        ) : (
          <ul className="list-inside list-disc space-y-0.5 text-popover-foreground">
            {workerLabels.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        )}
        {requiredNames.length > 0 ? (
          <div className="border-border/50 space-y-1 border-t pt-2">
            <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
              vs {roleName}
            </p>
            <p className="text-popover-foreground">
              <span className="font-medium">Required: </span>
              {requiredNames.join(', ')}
            </p>
            {meets ? (
              <p className="flex items-center gap-1 font-medium text-emerald-700">
                <Check size={12} /> Covers all required certifications
              </p>
            ) : (
              <p className="font-medium text-destructive">
                Missing: {missing.length ? missing.join(', ') : 'see profile'}
              </p>
            )}
          </div>
        ) : null}
      </TooltipContent>
    </Tooltip>
  );
};

const PoolWorkerCertificationsInfo: React.FC<{
  worker: Worker;
  requiredCertificationIds?: string[];
  roleName?: string;
  certificationCatalog: Certification[];
}> = ({ worker, requiredCertificationIds, roleName, certificationCatalog }) => {
  const workerLabels = workerCertificationDisplayLabels(
    worker,
    certificationCatalog,
  );
  const requiredNames = certificationNamesFromCatalog(
    requiredCertificationIds,
    certificationCatalog,
  );
  const showRoleCompare = Boolean(roleName);
  const meets = showRoleCompare
    ? workerMeetsRoleCertificationRequirements(worker, requiredCertificationIds)
    : null;
  const missing =
    meets === false
      ? missingRequirementCertificationNames(
          worker,
          requiredCertificationIds,
          certificationCatalog,
        )
      : [];

  return (
    <Tooltip delayDuration={150}>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="-m-0.5 inline-flex shrink-0 rounded p-0.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={`Certifications for ${worker.firstName} ${worker.lastName}`}
          onPointerDown={(e) => {
            e.stopPropagation();
          }}
        >
          <Info size={13} strokeWidth={2} />
        </button>
      </TooltipTrigger>
      <TooltipContent
        side="left"
        className="max-w-[17rem] space-y-2 px-3 py-2 text-left text-[11px] leading-snug"
      >
        <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
          Worker certifications
        </p>
        <p className="font-semibold text-popover-foreground">
          {worker.firstName} {worker.lastName}
        </p>
        {workerLabels.length === 0 ? (
          <p className="text-muted-foreground">
            No active certifications on profile.
          </p>
        ) : (
          <ul className="list-inside list-disc space-y-0.5 text-popover-foreground">
            {workerLabels.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        )}
        {showRoleCompare ? (
          <div className="border-border/50 space-y-1 border-t pt-2">
            <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
              Target role: {roleName}
            </p>
            {requiredNames.length === 0 ? (
              <p className="text-muted-foreground">
                This role lists no mandatory catalog certifications.
              </p>
            ) : (
              <>
                <p className="text-popover-foreground">
                  <span className="font-medium">Required: </span>
                  {requiredNames.join(', ')}
                </p>
                {meets ? (
                  <p className="font-medium text-emerald-700">
                    Matches requirements for that slot.
                  </p>
                ) : (
                  <p className="font-medium text-destructive">
                    Missing:{' '}
                    {missing.length
                      ? missing.join(', ')
                      : 'required certifications'}
                  </p>
                )}
              </>
            )}
          </div>
        ) : (
          <p className="text-[10px] text-muted-foreground">
            Open slots filled — hover while a role shows an open vacancy to
            compare required vs worker certifications.
          </p>
        )}
      </TooltipContent>
    </Tooltip>
  );
};

const SchedulerCalendarView: React.FC<SchedulerCalendarViewProps> = ({
  onOpenNewWO,
}) => {
  const assignmentRowsRef = useRef<HTMLDivElement>(null);
  const [recordIds, setRecordIds] = useState<string[]>([]);
  const completeRecords = useAssignmentRecords(recordIds);
  const chatRead = useAssignmentChatRead();
  const loadedWorkOrders = useMemo(() => (completeRecords.data ?? []).filter(row => recordIds.includes(row.id)), [completeRecords.data, recordIds]);
  const workOrders = useMemo(() => chatRead.record && !loadedWorkOrders.some(row => row.id === chatRead.record.id) ? [...loadedWorkOrders, chatRead.record] : loadedWorkOrders, [loadedWorkOrders, chatRead.record]);
  const {
    projects,
    shifts: shiftCatalog,
    workOrderTypes,
    getProjectById,
    getClientById,
    getWorkerById,
    equipment,
    workers,
    workerRoles,
    addWorkOrder,
    updateWorkOrder,
    deleteWorkOrder,
    settings,
    setSchedulerDateNav,
    schedulerSearchQuery,
    setSchedulerSearchQuery,
    formTemplates,
    notifications,
  } = useAppContext();
  const activeWorkerRoleNames = useMemo(
    () => assignmentRoleOptions(workerRoles),
    [workerRoles],
  );

  const submissionIndex = useScheduleSubmissionIndex();
  const formSubmissions = useMemo(() => submissionIndex.data ?? [], [submissionIndex.data]);
  const { toast } = useToast();
  const todayDate = useMemo(() => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    return now;
  }, []);
  const today = useMemo(
    () => todayDate.toISOString().split('T')[0],
    [todayDate],
  );

  const [calendarMode, setCalendarMode] = useState<'day' | 'week'>(() =>
    window.matchMedia('(max-width: 639px)').matches ? 'day' : 'week',
  );
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [dayDate, setDayDate] = useState(() => new Date(todayDate));
  const [selectedProject, setSelectedProject] = useState<string | null>(null);
  const [filterStartDate, setFilterStartDate] = useState('');
  const [filterEndDate, setFilterEndDate] = useState('');
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [hoveredCell, setHoveredCell] = useState<string | null>(null);
  const [draggedShift, setDraggedShift] = useState<{
    shiftId: string;
    woId: string;
  } | null>(null);
  const [dragOverShiftCell, setDragOverShiftCell] = useState<string | null>(
    null,
  );
  const [editingShift, setEditingShift] = useState<{
    shift: Shift;
    woId: string;
  } | null>(null);
  const [quickAddCell, setQuickAddCell] = useState<{
    date: string;
    woId: string;
  } | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [selectedWorkOrderId, setSelectedWorkOrderId] = useState<string | null>(
    null,
  );
  const [detailSidebarWoId, setDetailSidebarWoId] = useState<string | null>(
    null,
  );
  const [pendingDeleteWO, setPendingDeleteWO] = useState<{
    id: string;
    title: string;
  } | null>(null);
  const [pendingDeleteShift, setPendingDeleteShift] = useState<{
    shiftId: string;
    woId: string;
    label: string;
  } | null>(null);
  const [editingWO, setEditingWO] = useState<WorkOrder | null>(null);
  const [editWOForm, setEditWOForm] = useState({
    projectId: '',
    workOrderTypeId: '',
    title: '',
    orderNumber: '',
    startDate: '',
    endDate: '',
    notes: '',
    dispatchNote: '',
    fileUploads: [] as string[],
    assignmentAddress: '',
    latitude: null as number | null,
    longitude: null as number | null,
    assignmentCity: '',
    assignmentState: '',
    assignmentZipCode: '',
    assignmentCountry: DEFAULT_ASSIGNMENT_COUNTRY,
  });
  const [selectedShiftIds, setSelectedShiftIds] = useState<Set<string>>(
    new Set(),
  );
  const [lastSelectedShiftId, setLastSelectedShiftId] = useState<string | null>(
    null,
  );
  const [notifyRecipients, setNotifyRecipients] = useState<
    NotificationRecipient[]
  >([]);
  const [notifyIsBulk, setNotifyIsBulk] = useState(false);
  const [shiftDetailsPanel, setShiftDetailsPanel] = useState<{
    shift: Shift;
    woId: string;
  } | null>(null);
  const [shiftChatPanel, setShiftChatPanel] = useState<{
    shift: Shift;
    woId: string;
  } | null>(null);
  const [shiftChatUnread, setShiftChatUnread] = useState<
    Record<string, number>
  >({});
  const [scheduleStripTab, setScheduleStripTab] = useState<
    'all' | 'pending' | 'missing_workers' | 'missing_equipment' | 'confirmed'
  >('all');
  const [shiftStatusCounters, setShiftStatusCounters] =
    useState<ShiftAggregateCounters | null>(null);
  const [effectiveShiftStatuses, setEffectiveShiftStatuses] = useState<
    Record<string, string | null>
  >({});
  const [selectedShiftStatusFilter, setSelectedShiftStatusFilter] = useState<
    string | null
  >(null);
  const [workersStatusCollapsed, setWorkersStatusCollapsed] = useState(() => {
    try {
      return (
        window.localStorage.getItem('schedule-workers-status-collapsed') ===
        'true'
      );
    } catch {
      return false;
    }
  });

  const toggleWorkersStatus = useCallback(() => {
    setWorkersStatusCollapsed((current) => {
      const next = !current;
      try {
        window.localStorage.setItem(
          'schedule-workers-status-collapsed',
          String(next),
        );
      } catch {}
      return next;
    });
  }, []);

  const days = useMemo(() => {
    if (calendarMode === 'day') return [dayDate];
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(weekStart);
      d.setDate(d.getDate() + i);
      return d;
    });
  }, [weekStart, calendarMode, dayDate]);

  const dateStrsInCalendarScope = useMemo(
    () => days.map((d) => d.toISOString().split('T')[0]),
    [days],
  );
  const dateStrsForFiltering = useMemo(
    () =>
      dateStrsInCalendarScope.filter(
        (date) =>
          (!filterStartDate || date >= filterStartDate) &&
          (!filterEndDate || date <= filterEndDate),
      ),
    [filterStartDate, filterEndDate, dateStrsInCalendarScope],
  );
  const scopeRead = useScheduleScope(dateStrsInCalendarScope[0], dateStrsInCalendarScope[dateStrsInCalendarScope.length - 1]);
  const workOrdersWithEffectiveStatus = useMemo(() => scopeRead.data?.data ?? [], [scopeRead.data]);
  const completedShiftKeys = useMemo(
    () =>
      buildCompletedWorkOrderShiftKeys(
        formSubmissions,
        formTemplates,
        workOrdersWithEffectiveStatus,
      ),
    [formSubmissions, formTemplates, workOrdersWithEffectiveStatus],
  );

  const scopedAssignmentStatuses = useMemo(() => {
    const dateSet = new Set(dateStrsForFiltering);
    return new Map(
      workOrdersWithEffectiveStatus.map((wo) => [
        wo.id,
        {
          status: null,
          reasons: [] as string[],
          shiftCount: (wo.shifts || []).filter((shift) =>
            dateSet.has(shift.date),
          ).length,
        },
      ]),
    );
  }, [workOrdersWithEffectiveStatus, dateStrsForFiltering]);

  const activeWOs = useMemo(() => {
    const filtered = workOrdersWithEffectiveStatus.filter((wo) => {
      if (selectedProject && wo.projectId !== selectedProject) return false;
      if (schedulerSearchQuery) {
        const project = getProjectById(wo.projectId);
        const q = schedulerSearchQuery.trim().toLowerCase();
        const projectNumber = project?.number || '';
        return [
          project?.name || '',
          projectNumber,
          projectNumber ? `#${projectNumber}` : '',
        ]
          .join(' ')
          .toLowerCase()
          .includes(q);
      }
      return true;
    });
    const latestShift = (wo: WorkOrder) =>
      (wo as WorkOrder & { latestShiftTimestamp?: string }).latestShiftTimestamp ?? wo.shifts.reduce((latest, shift) => {
        const value = `${shift.date}T${shift.startTime || '00:00'}`;
        return value > latest ? value : latest;
      }, '');
    return [...filtered].sort((a, b) => {
      const byCreated = (b.createdAt || '').localeCompare(a.createdAt || '');
      if (byCreated !== 0) return byCreated;
      const byLatestShift = latestShift(b).localeCompare(latestShift(a));
      if (byLatestShift !== 0) return byLatestShift;
      const byStartDate = (b.startDate || '').localeCompare(a.startDate || '');
      if (byStartDate !== 0) return byStartDate;
      const byProject = (a.projectId || '').localeCompare(b.projectId || '');
      if (byProject !== 0) return byProject;
      const byOrderNumber = (a.orderNumber || '').localeCompare(
        b.orderNumber || '',
      );
      if (byOrderNumber !== 0) return byOrderNumber;
      return a.id.localeCompare(b.id);
    });
  }, [
    workOrdersWithEffectiveStatus,
    selectedProject,
    schedulerSearchQuery,
    getProjectById,
    getClientById,
  ]);

  const visibleWOs = useMemo(
    () =>
      activeWOs.filter((wo) =>
        assignmentTouchesDateScope(wo, dateStrsForFiltering),
      ),
    [activeWOs, dateStrsForFiltering],
  );

  const filteredCalendarWorkOrders = useMemo(() => {
    const equipMap = new Map(equipment.map((e) => [e.id, e]));
    let base: WorkOrder[];
    switch (scheduleStripTab) {
      case 'all':
        base = visibleWOs;
        break;

      case 'pending':
        base = visibleWOs.filter((wo) =>
          wo.shifts.some((s) => {
            if (!dateStrsForFiltering.includes(s.date)) return false;
            const summary = getShiftConfirmationSummary(s);
            return summary.assigned > 0 && summary.status !== 'confirmed';
          }),
        );
        break;

      case 'confirmed':
        base = visibleWOs.filter((wo) =>
          wo.shifts.some((s) => {
            if (!dateStrsForFiltering.includes(s.date)) return false;
            const summary = getShiftConfirmationSummary(s);
            return summary.assigned > 0 && summary.status === 'confirmed';
          }),
        );
        break;
      case 'missing_workers':
        base = visibleWOs.filter((wo) =>
          wo.shifts.some(
            (s) =>
              dateStrsForFiltering.includes(s.date) &&
              getShiftMissingWorkerSlots(s) > 0,
          ),
        );
        break;
      case 'missing_equipment':
        base = visibleWOs.filter((wo) =>
          wo.shifts.some((s) => {
            if (!dateStrsForFiltering.includes(s.date)) return false;
            return (s.plannedEquipment || []).some(
              (plan) =>
                !equipment.some(
                  (item) =>
                    item.type === plan.type &&
                    item.status !== 'maintenance' &&
                    item.status !== 'retired',
                ),
            );
          }),
        );
        break;
      default:
        base = visibleWOs;
        break;
    }

    if (!selectedShiftStatusFilter) return base;
    return base
      .map((wo) => ({
        ...wo,
        shifts: wo.shifts.filter((shift) => {
          if (!dateStrsForFiltering.includes(shift.date)) return true;
          const status =
            effectiveShiftStatuses[shift.id] ??
            getEffectiveShiftStatus(
              shift,
              completedShiftKeys.has(`${wo.id}:${shift.id}`),
            );
          return status === selectedShiftStatusFilter;
        }),
      }))
      .filter((wo) =>
        wo.shifts.some((shift) => dateStrsForFiltering.includes(shift.date)),
      );
  }, [
    visibleWOs,
    scheduleStripTab,
    dateStrsForFiltering,
    equipment,
    selectedShiftStatusFilter,
    effectiveShiftStatuses,
    completedShiftKeys,
  ]);

  const pageScopeKey = JSON.stringify([dateStrsInCalendarScope, filterStartDate, filterEndDate, selectedProject, schedulerSearchQuery, scheduleStripTab, selectedShiftStatusFilter]);
  const pagination = usePagePosition(pageScopeKey, filteredCalendarWorkOrders.length);
  const pageSummaries = useMemo(() => filteredCalendarWorkOrders.slice((pagination.page - 1) * pagination.pageSize, pagination.page * pagination.pageSize), [filteredCalendarWorkOrders, pagination.page, pagination.pageSize]);
  const requestedIds = [...new Set([...pageSummaries.map(row => row.id), detailSidebarWoId, editingWO?.id, editingShift?.woId, quickAddCell?.woId, shiftDetailsPanel?.woId, shiftChatPanel?.woId].filter(Boolean) as string[])];
  const requestedKey = JSON.stringify(requestedIds);
  useEffect(() => { setRecordIds(previous => JSON.stringify(previous) === requestedKey ? previous : requestedIds); }, [requestedKey]);
  useEffect(() => { setSelectedShiftIds(new Set()); setLastSelectedShiftId(null); if (assignmentRowsRef.current) assignmentRowsRef.current.scrollTop = 0; }, [pageScopeKey, pagination.page, pagination.pageSize]);
  const pageLoaded = requestedKey === JSON.stringify(recordIds) && pageSummaries.every(row => workOrders.some(full => full.id === row.id));
  const calendarWorkOrders = useMemo(() => pageLoaded ? pageSummaries.flatMap(summary => {
    const full = workOrders.find(row => row.id === summary.id);
    if (!full) return [];
    if (!selectedShiftStatusFilter) return [full];
    const visibleIds = new Set(summary.shifts.map(shift => shift.id));
    return [{ ...full, shifts: full.shifts.filter(shift => !dateStrsForFiltering.includes(shift.date) || visibleIds.has(shift.id)) }];
  }) : [], [pageLoaded, pageSummaries, workOrders, selectedShiftStatusFilter, dateStrsForFiltering]);

  const openShiftChatById = useCallback(
    async (shiftId: string, workOrderId?: string) => {
      const workOrder =
        (workOrderId
          ? workOrders.find((item) => item.id === workOrderId)
          : undefined) ||
        workOrders.find((item) =>
          item.shifts.some((shift) => shift.id === shiftId),
        ) || await chatRead.resolve(shiftId, workOrderId);
      const shift = workOrder?.shifts.find((item) => item.id === shiftId);
      if (!workOrder || !shift) return;
      setShiftChatPanel({ shift, woId: workOrder.id });
    },
    [workOrders, chatRead.resolve],
  );

  useEffect(() => {
    let active = true;
    const shifts = calendarWorkOrders.flatMap((workOrder) =>
      workOrder.shifts
        .filter((shift) => dateStrsForFiltering.includes(shift.date))
        .map((shift) => shift.id),
    );
    if (shifts.length === 0) {
      setShiftChatUnread({});
      return () => {
        active = false;
      };
    }
    void Promise.all(
      shifts.map(async (shiftId) => {
        try {
          const result = await fetchShiftChatUnreadCount(shiftId);
          return [shiftId, result.unreadCount] as const;
        } catch {
          return [shiftId, 0] as const;
        }
      }),
    ).then((entries) => {
      if (active) setShiftChatUnread(Object.fromEntries(entries));
    });
    return () => {
      active = false;
    };
  }, [calendarWorkOrders, dateStrsForFiltering, notifications]);

  useEffect(() => {
    const openPendingChat = () => {
      try {
        const raw = sessionStorage.getItem('pending_shift_chat');
        if (!raw) return;
        const pending = JSON.parse(raw) as {
          shiftId?: string;
          workOrderId?: string;
        };
        if (!pending.shiftId) return;
        sessionStorage.removeItem('pending_shift_chat');
        openShiftChatById(pending.shiftId, pending.workOrderId);
      } catch {}
    };
    const onOpenChat = (event: Event) => {
      const detail = (
        event as CustomEvent<{ shiftId?: string; workOrderId?: string }>
      ).detail;
      if (detail?.shiftId)
        openShiftChatById(detail.shiftId, detail.workOrderId);
    };
    openPendingChat();
    window.addEventListener('open-shift-chat', onOpenChat);
    return () => window.removeEventListener('open-shift-chat', onOpenChat);
  }, [openShiftChatById]);

  const handleShiftChatRead = useCallback((shiftId: string) => {
    setShiftChatUnread((current) => ({ ...current, [shiftId]: 0 }));
  }, []);

  const currentYear = todayDate.getFullYear();
  const activeWorkOrderTypes = useMemo(
    () =>
      workOrderTypes
        .filter((type) => type.status === 'active')
        .sort((a, b) => a.name.localeCompare(b.name)),
    [workOrderTypes],
  );
  const selectedEditProjectData = editWOForm.projectId
    ? getProjectById(editWOForm.projectId)
    : null;
  const selectedEditClientData = selectedEditProjectData
    ? getClientById(selectedEditProjectData.clientId)
    : null;

  useEffect(() => {
    if (
      selectedWorkOrderId &&
      !calendarWorkOrders.some((wo) => wo.id === selectedWorkOrderId)
    ) {
      setSelectedWorkOrderId(null);
    }
  }, [calendarWorkOrders, selectedWorkOrderId]);

  const detailSidebarWo = useMemo(
    () =>
      detailSidebarWoId
        ? (workOrders.find((w) => w.id === detailSidebarWoId) ?? null)
        : null,
    [workOrders, detailSidebarWoId],
  );

  useEffect(() => {
    if (detailSidebarWoId && !detailSidebarWo) {
      setDetailSidebarWoId(null);
    }
  }, [detailSidebarWoId, detailSidebarWo]);

  const allShiftsFlat = useMemo(() => {
    const result: { shift: Shift; wo: WorkOrder; index: number }[] = [];
    let idx = 0;
    (calendarWorkOrders || []).forEach((wo) => {
      (wo.shifts || []).forEach((shift) => {
        result.push({ shift, wo, index: idx++ });
      });
    });
    return result;
  }, [calendarWorkOrders]);

  const groupedWOs = useMemo(() => {
    if (calendarWorkOrders.length === 0)
      return [] as Array<[string, WorkOrder[]]>;
    return [['assignments', calendarWorkOrders]] as Array<
      [string, WorkOrder[]]
    >;
  }, [calendarWorkOrders]);

  const assignmentsTouchingCalendarScope = useMemo(() => {
    return workOrdersWithEffectiveStatus.filter((wo) => {
      if (selectedProject && wo.projectId !== selectedProject) return false;
      if (schedulerSearchQuery) {
        const project = getProjectById(wo.projectId);
        const client = project ? getClientById(project.clientId) : undefined;
        const q = schedulerSearchQuery.toLowerCase();
        if (
          !(
            wo.title +
            (project?.name || '') +
            (client?.name || '') +
            (wo.orderNumber || '')
          )
            .toLowerCase()
            .includes(q)
        ) {
          return false;
        }
      }
      return (scopedAssignmentStatuses.get(wo.id)?.shiftCount ?? 0) > 0;
    });
  }, [
    workOrdersWithEffectiveStatus,
    selectedProject,
    schedulerSearchQuery,
    getProjectById,
    getClientById,
    scopedAssignmentStatuses,
  ]);

  const assignmentScopeTotal = assignmentsTouchingCalendarScope.length;

  const weekStats = useMemo(() => {
    return computeScheduleDashboardStats(
      workOrdersWithEffectiveStatus.filter((wo) => !isCancelledAssignment(wo)),
      dateStrsForFiltering,
      equipment,
      completedShiftKeys,
    );
  }, [dateStrsForFiltering, workOrdersWithEffectiveStatus, equipment, completedShiftKeys]);

  const headerDateLabel = useMemo(
    () =>
      calendarMode === 'day'
        ? dayDate.toLocaleDateString('en-US', {
            weekday: 'long',
            month: 'long',
            day: 'numeric',
            year: 'numeric',
          })
        : `${weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${new Date(weekStart.getTime() + 6 * 86400000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`,
    [calendarMode, dayDate, weekStart],
  );

  const navigate = useCallback(
    (dir: number) => {
      if (calendarMode === 'day') {
        setDayDate((prev) => {
          const d = new Date(prev);
          d.setDate(d.getDate() + dir);
          return d;
        });
      } else {
        setWeekStart((prev) => {
          const d = new Date(prev);
          d.setDate(d.getDate() + dir * 7);
          return d;
        });
      }
    },
    [calendarMode],
  );

  const goToToday = useCallback(() => {
    if (calendarMode === 'day') {
      setDayDate(new Date(todayDate));
      return;
    }
    setWeekStart(startOfWeek(todayDate));
  }, [calendarMode, todayDate]);

  useEffect(() => {
    setSchedulerDateNav({
      dateLabel: headerDateLabel,
      onPrev: () => navigate(-1),
      onNext: () => navigate(1),
      onToday: goToToday,
    });
  }, [setSchedulerDateNav, headerDateLabel, navigate, goToToday]);

  useEffect(() => {
    return () => {
      setSchedulerDateNav(null);
      setSchedulerSearchQuery('');
    };
  }, [setSchedulerDateNav, setSchedulerSearchQuery]);

  const getShiftsForDay = (wo: WorkOrder, date: Date): Shift[] => {
    const dateStr = date.toISOString().split('T')[0];
    return wo.shifts.filter((s) => s.date === dateStr);
  };

  const toggleRow = (id: string) => {
    setExpandedRows((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  const formatTime = (t: string) => {
    const [h, m] = t.split(':');
    const hr = parseInt(h);
    return `${hr > 12 ? hr - 12 : hr || 12}:${m}${hr >= 12 ? 'p' : 'a'}`;
  };

  const roleColor = (role: string) => {
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

  const handleQuickAdd = useCallback(
    (dateStr: string, woId: string) => {
      if (dateStr < today) {
        toast({
          title: 'Date Locked',
          description: 'Cannot create shifts on past dates.',
          variant: 'destructive',
        });
        return;
      }
      const wo = workOrders.find((w) => w.id === woId);
      if (!wo) return;
      if (isCancelledAssignment(wo)) {
        toast({
          title: 'Assignment cancelled',
          description: 'Cancelled assignments cannot receive new shifts.',
          variant: 'destructive',
        });
        return;
      }
      if (!isShiftDateWithinAssignmentRange(dateStr, wo)) {
        toast({
          title: 'Outside assignment dates',
          description: workOrderHasAssignmentDateRange(wo)
            ? `Shifts must be between ${assignmentDateRangeLabel(wo)}.`
            : 'Invalid assignment dates.',
          variant: 'destructive',
        });
        return;
      }
      const activeShiftTemplate = activeWorkerRoleNames[0];
      const seedShift: Shift = {
        id: `draft_new_${Date.now()}`,
        workOrderId: woId,
        shiftName: '',
        date: dateStr,
        defaultRoleStartTime: '',
        startTime: '',
        endTime: '',
        roles: [
          {
            id: `sr_draft_${Date.now()}`,
            roleName: activeShiftTemplate,
            requiredCount: 1,
            startTime: '',
            requiredCertificationIds: [],
            requiredSkillIds: [],
            assignedWorkers: [],
          },
        ],
      };
      setEditingShift({ shift: seedShift, woId });
    },
    [workOrders, today, toast, activeWorkerRoleNames],
  );

  const handleCreateShift = useCallback(
    (
      dateStr: string,
      woId: string,
      payload: {
        shiftName: string;
        shiftTemplateId?: string;
        defaultRoleStartTime?: string;
        plannedEquipment?: PlannedResource[];
        plannedMaterials?: PlannedResource[];
        formTemplateIds?: string[];
        roles: Array<{
          roleName: string;
          requiredCount: number;
          startTime: string;
          requiredCertificationIds?: string[];
          requiredSkillIds?: string[];
          assignedWorkers: string[];
        }>;
      },
    ) => {
      const wo = workOrders.find((w) => w.id === woId);
      if (!wo) return;
      if (isCancelledAssignment(wo)) {
        toast({
          title: 'Assignment cancelled',
          description: 'Cancelled assignments cannot receive new shifts.',
          variant: 'destructive',
        });
        return;
      }
      if (!isShiftDateWithinAssignmentRange(dateStr, wo)) {
        toast({
          title: 'Outside assignment dates',
          description: workOrderHasAssignmentDateRange(wo)
            ? `Shifts must be between ${assignmentDateRangeLabel(wo)}.`
            : 'Invalid assignment dates.',
          variant: 'destructive',
        });
        return;
      }
      const selectedTemplate = shiftCatalog.find(
        (item) => item.id === payload.shiftTemplateId,
      );
      if (
        !selectedTemplate ||
        !payload.defaultRoleStartTime ||
        payload.roles.some((role) => !role.startTime)
      ) {
        toast({
          title: 'Missing shift schedule',
          description:
            'Select a shift type and enter a start time before creating the shift.',
          variant: 'destructive',
        });
        return;
      }
      const durationMinutes = getShiftTemplateDurationMinutes(selectedTemplate);
      const roleStartTimes = payload.roles.map((r) => r.startTime).sort();
      const shiftStartTime = roleStartTimes[0] || payload.defaultRoleStartTime;
      const shiftEndTime = addMinutesToTime(shiftStartTime, durationMinutes);
      const newShift: Shift = {
        id: `s_cal_${Date.now()}`,
        workOrderId: woId,
        shiftName: payload.shiftName.trim(),
        shiftTemplateId: payload.shiftTemplateId || undefined,
        defaultRoleStartTime: payload.defaultRoleStartTime || shiftStartTime,
        date: dateStr,
        startTime: shiftStartTime,
        endTime: shiftEndTime,
        plannedEquipment: [...(payload.plannedEquipment || [])],
        plannedMaterials: [...(payload.plannedMaterials || [])],
        formTemplateIds: [...(payload.formTemplateIds || [])],
        roles: payload.roles.map((role, idx) => ({
          id: `sr_cal_${Date.now()}_${idx}`,
          roleName: role.roleName,
          requiredCount: role.requiredCount,
          startTime: role.startTime,
          requiredCertificationIds: [...getRoleRequiredCertificationIds(role)],
          requiredSkillIds: [...(role.requiredSkillIds ?? [])],
          assignedWorkers: [...role.assignedWorkers],
        })),
      };
      updateWorkOrder(woId, { shifts: [...wo.shifts, newShift] });
      toast({ title: 'Shift Created', description: `New shift on ${dateStr}` });
      setQuickAddCell(null);
    },
    [workOrders, updateWorkOrder, toast, shiftCatalog],
  );

  const deleteShiftNow = useCallback(
    async (shiftId: string, woId: string) => {
      const wo = workOrders.find((w) => w.id === woId);
      if (!wo) return;
      try {
        await updateWorkOrder(woId, {
          shifts: wo.shifts.filter((s) => s.id !== shiftId),
        });
        toast({
          title: 'Shift Deleted',
          description: 'Shift deleted successfully.',
        });
        setEditingShift(null);
      } catch (error) {
        toast({
          title: 'Unable to delete shift',
          description:
            error instanceof Error ? error.message : 'Please try again.',
          variant: 'destructive',
        });
      }
    },
    [workOrders, updateWorkOrder, toast],
  );

  const handleDeleteShift = useCallback(
    (shiftId: string, woId: string) => {
      const wo = workOrders.find((w) => w.id === woId);
      if (!wo) return;
      const shift = wo.shifts.find((item) => item.id === shiftId);
      setPendingDeleteShift({
        shiftId,
        woId,
        label: shift?.date || 'this shift',
      });
    },
    [workOrders, toast],
  );

  const deleteAssignmentNow = useCallback(
    async (assignment: { id: string; title: string }) => {
      const result = await deleteWorkOrder(assignment.id);
      toast({
        title: result?.trashed ? 'Moved to Recycle Bin' : 'Assignment Deleted',
        description: result?.trashed
          ? `${assignment.title} can be restored from Assignments.`
          : `${assignment.title} was deleted.`,
      });
    },
    [deleteWorkOrder, toast],
  );

  const handleAssignmentDeleteRequest = useCallback(
    (wo: WorkOrder, title: string) => {
      const assignment = { id: wo.id, title };
      if ((wo.shifts ?? []).length > 0) {
        setPendingDeleteWO(assignment);
        return;
      }
      void deleteAssignmentNow(assignment);
    },
    [deleteAssignmentNow],
  );

  const handleDuplicateShift = useCallback(
    async (shift: Shift, woId: string) => {
      const wo = workOrders.find((w) => w.id === woId);
      if (!wo) return;
      const duplicateId = `s_dup_${Date.now()}`;
      const newShift = prepareShiftDuplicate(
        shift,
        {
          ...shift,
          id: duplicateId,
          date: shift.date,
          plannedEquipment: [...(shift.plannedEquipment || [])],
          plannedMaterials: [...(shift.plannedMaterials || [])],
          roles: shift.roles.map((r) => ({
            ...r,
            id: `sr_dup_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
            assignedWorkers: [...r.assignedWorkers],
            requiredCertificationIds: [...getRoleRequiredCertificationIds(r)],
            requiredSkillIds: [...(r.requiredSkillIds || [])],
          })),
        },
        wo.shifts.map((item) => item.shiftName),
      );
      const sourceIndex = wo.shifts.findIndex((item) => item.id === shift.id);
      const nextShifts = [...wo.shifts];
      nextShifts.splice(
        sourceIndex >= 0 ? sourceIndex + 1 : nextShifts.length,
        0,
        newShift,
      );
      try {
        await updateWorkOrder(woId, { shifts: nextShifts });
        setEditingShift({ shift: newShift, woId });
        toast({
          title: 'Shift Duplicated',
          description:
            'The copy was placed below the original with the same date.',
        });
      } catch (error) {
        toast({
          title: 'Could not duplicate shift',
          description:
            error instanceof Error ? error.message : 'Please try again.',
          variant: 'destructive',
        });
      }
    },
    [
      workOrders,
      updateWorkOrder,
      toast,
      effectiveShiftStatuses,
      completedShiftKeys,
    ],
  );

  const handleMoveShift = useCallback(
    async (woId: string, shiftId: string, targetDate: string) => {
      const wo = workOrders.find((item) => item.id === woId);
      const shift = wo?.shifts.find((item) => item.id === shiftId);
      if (!wo || !shift || shift.date === targetDate) return;
      if (targetDate < today) {
        toast({
          title: 'Date Locked',
          description: 'Shifts cannot be moved to a past date.',
          variant: 'destructive',
        });
        return;
      }
      if (!isShiftDateWithinAssignmentRange(targetDate, wo)) {
        toast({
          title: 'Outside assignment dates',
          description: `Shifts must be between ${assignmentDateRangeLabel(wo)}.`,
          variant: 'destructive',
        });
        return;
      }
      const effectiveStatus = effectiveShiftStatuses[shift.id];
      if (
        effectiveStatus === 'shift_completed' ||
        effectiveStatus === 'pm_approved' ||
        completedShiftKeys.has(`${woId}:${shift.id}`)
      ) {
        toast({
          title: 'Shift locked',
          description: 'Completed shifts cannot be moved.',
          variant: 'destructive',
        });
        return;
      }

      const remaining = wo.shifts.filter((item) => item.id !== shift.id);
      const movedShift = { ...shift, date: targetDate };
      const lastTargetIndex = remaining.reduce(
        (lastIndex, item, index) =>
          item.date === targetDate ? index : lastIndex,
        -1,
      );
      remaining.splice(
        lastTargetIndex >= 0 ? lastTargetIndex + 1 : remaining.length,
        0,
        movedShift,
      );
      try {
        await updateWorkOrder(woId, { shifts: remaining });
        toast({
          title: 'Shift Moved',
          description: `Shift moved to ${targetDate}.`,
        });
      } catch (error) {
        toast({
          title: 'Could not move shift',
          description:
            error instanceof Error ? error.message : 'Please try again.',
          variant: 'destructive',
        });
      }
    },
    [
      workOrders,
      today,
      effectiveShiftStatuses,
      completedShiftKeys,
      updateWorkOrder,
      toast,
    ],
  );

  const openEditWOModal = useCallback((wo: WorkOrder) => {
    setEditingWO(wo);
    setEditWOForm({
      projectId: wo.projectId,
      workOrderTypeId: wo.workOrderTypeId || '',
      title: wo.title,
      orderNumber: wo.orderNumber || '',
      startDate: wo.startDate,
      endDate: wo.endDate,
      notes: wo.notes || '',
      dispatchNote: wo.dispatchNote || '',
      fileUploads: [...(wo.fileUploads || [])],
      assignmentAddress: wo.assignmentAddress ?? '',
      latitude: wo.latitude ?? null,
      longitude: wo.longitude ?? null,
      assignmentCity: wo.assignmentCity ?? '',
      assignmentState: wo.assignmentState ?? '',
      assignmentZipCode: wo.assignmentZipCode ?? '',
      assignmentCountry:
        wo.assignmentCountry?.trim() || DEFAULT_ASSIGNMENT_COUNTRY,
    });
  }, []);

  const handleSaveEditedWO = useCallback(() => {
    if (!editingWO) return;
    if (!editWOForm.projectId) {
      toast({
        title: 'Missing project',
        description: 'Please select a project.',
        variant: 'destructive',
      });
      return;
    }
    if (!editWOForm.title.trim()) {
      toast({
        title: 'Missing title',
        description: 'Please enter an assignment title.',
        variant: 'destructive',
      });
      return;
    }
    if (editWOForm.endDate < editWOForm.startDate) {
      toast({
        title: 'Invalid dates',
        description: 'End date cannot be earlier than start date.',
        variant: 'destructive',
      });
      return;
    }
    const rangeWo = {
      startDate: editWOForm.startDate,
      endDate: editWOForm.endDate,
    };
    if (workOrderHasAssignmentDateRange(rangeWo)) {
      const bad = editingWO.shifts.find(
        (s) => !isShiftDateWithinAssignmentRange(s.date, rangeWo),
      );
      if (bad) {
        toast({
          title: 'Shifts outside new dates',
          description: `At least one shift (${bad.date}) is outside ${assignmentDateRangeLabel(rangeWo)}. Adjust or remove shifts first.`,
          variant: 'destructive',
        });
        return;
      }
    }
    const calSaveProject = getProjectById(editWOForm.projectId);
    if (calSaveProject && projectHasScheduleBounds(calSaveProject)) {
      const woCal = {
        startDate: editWOForm.startDate,
        endDate: editWOForm.endDate,
      };
      if (!isAssignmentRangeWithinProject(woCal, calSaveProject)) {
        toast({
          title: 'Outside project dates',
          description: `Assignment dates must fall within ${assignmentDateRangeLabel(calSaveProject)}.`,
          variant: 'destructive',
        });
        return;
      }
    }
    updateWorkOrder(editingWO.id, {
      projectId: editWOForm.projectId,
      workOrderTypeId: editWOForm.workOrderTypeId || undefined,
      title: editWOForm.title.trim(),
      orderNumber: editWOForm.orderNumber.trim() || undefined,
      startDate: editWOForm.startDate,
      endDate: editWOForm.endDate,
      notes: editWOForm.notes.trim(),
      dispatchNote: editWOForm.dispatchNote.trim(),
      fileUploads: editWOForm.fileUploads,
      assignmentAddress: editWOForm.assignmentAddress.trim(),
      latitude: editWOForm.latitude,
      longitude: editWOForm.longitude,
      assignmentCity: editWOForm.assignmentCity.trim(),
      assignmentState: editWOForm.assignmentState.trim(),
      assignmentZipCode: editWOForm.assignmentZipCode.trim(),
      assignmentCountry:
        editWOForm.assignmentCountry.trim() || DEFAULT_ASSIGNMENT_COUNTRY,
    });
    toast({
      title: 'Assignment Updated',
      description: `${editWOForm.title.trim()} was updated.`,
    });
    setEditingWO(null);
  }, [editingWO, editWOForm, updateWorkOrder, toast, getProjectById]);

  const handleDuplicateWorkOrder = useCallback(
    async (wo: WorkOrder) => {
      const now = Date.now();
      const suffix = Math.random().toString(36).slice(2, 7);
      const newWoId = `wo_copy_${now}_${suffix}`;
      const newShifts: Shift[] = [];
      wo.shifts.forEach((shift, shiftIdx) => {
        const newShiftId = `s_copy_${now}_${shiftIdx}_${Math.random().toString(36).slice(2, 6)}`;
        newShifts.push(
          prepareShiftDuplicate(
            shift,
            {
              ...shift,
              id: newShiftId,
              workOrderId: newWoId,
              roles: shift.roles.map((role, roleIdx) => ({
                ...role,
                id: `sr_copy_${now}_${shiftIdx}_${roleIdx}_${Math.random().toString(36).slice(2, 6)}`,
              })),
            },
            [...wo.shifts, ...newShifts].map((item) => item.shiftName),
          ),
        );
      });
      const duplicateWO: WorkOrder = {
        id: newWoId,
        projectId: wo.projectId,
        workOrderTypeId: wo.workOrderTypeId,
        title: `${wo.title} (Copy)`,
        orderNumber: undefined,
        status: 'pending',
        startDate: wo.startDate,
        endDate: wo.endDate,
        notes: wo.notes ?? '',
        dispatchNote: wo.dispatchNote ?? '',
        fileUploads: [...(wo.fileUploads || [])],
        requesterName: wo.requesterName,
        contactEmail: wo.contactEmail,
        contactPhoneNumber: wo.contactPhoneNumber,
        assignmentAddress: wo.assignmentAddress ?? '',
        latitude: wo.latitude ?? null,
        longitude: wo.longitude ?? null,
        assignmentCity: wo.assignmentCity ?? '',
        assignmentState: wo.assignmentState ?? '',
        assignmentZipCode: wo.assignmentZipCode ?? '',
        assignmentCountry:
          wo.assignmentCountry?.trim() || DEFAULT_ASSIGNMENT_COUNTRY,
        attachments: wo.attachments?.length ? [...wo.attachments] : undefined,
        shifts: newShifts,
      };
      const calDupProject = getProjectById(wo.projectId);
      if (calDupProject && projectHasScheduleBounds(calDupProject)) {
        if (
          !isAssignmentRangeWithinProject(
            { startDate: wo.startDate, endDate: wo.endDate },
            calDupProject,
          )
        ) {
          toast({
            title: 'Cannot duplicate',
            description: `This assignment falls outside project dates (${assignmentDateRangeLabel(calDupProject)}). Adjust dates first.`,
            variant: 'destructive',
          });
          return;
        }
      }
      try {
        await addWorkOrder(duplicateWO);
        toast({
          title: 'Assignment Duplicated',
          description: `${wo.title} was duplicated.`,
        });
      } catch (e) {
        console.error(e);
        toast({
          title: 'Could not duplicate',
          description: e instanceof Error ? e.message : 'Request failed.',
          variant: 'destructive',
        });
      }
    },
    [addWorkOrder, toast, getProjectById],
  );

  const handleShiftSelect = useCallback(
    (shiftId: string, e: React.MouseEvent) => {
      e.stopPropagation();

      setSelectedShiftIds((prev) => {
        const next = new Set(prev);

        if (e.metaKey || e.ctrlKey) {
          if (next.has(shiftId)) next.delete(shiftId);
          else next.add(shiftId);
        } else if (e.shiftKey && lastSelectedShiftId) {
          const allIds = allShiftsFlat.map((s) => s.shift.id);
          const startIdx = allIds.indexOf(lastSelectedShiftId);
          const endIdx = allIds.indexOf(shiftId);
          if (startIdx !== -1 && endIdx !== -1) {
            const [from, to] =
              startIdx < endIdx ? [startIdx, endIdx] : [endIdx, startIdx];
            for (let i = from; i <= to; i++) next.add(allIds[i]);
          }
        } else {
          next.clear();
          next.add(shiftId);
        }

        return next;
      });

      setLastSelectedShiftId(shiftId);
    },
    [allShiftsFlat, lastSelectedShiftId],
  );

  const openNotifyForSelection = useCallback(() => {
    if (selectedShiftIds.size === 0) return;

    const recipients: NotificationRecipient[] = [];

    selectedShiftIds.forEach((sid) => {
      for (const wo of workOrders) {
        const shift = wo.shifts.find((s) => s.id === sid);
        if (!shift) continue;
        const effective =
          effectiveShiftStatuses[shift.id] ??
          getEffectiveShiftStatus(
            shift,
            completedShiftKeys.has(`${wo.id}:${shift.id}`),
          );
        if (
          (effective !== 'ready_to_notify' &&
            effective !== 'awaiting_response') ||
          !hasWorkersPendingInitialNotification(shift)
        )
          continue;

        const project = getProjectById(wo.projectId);
        (shift.roles || []).forEach((role) => {
          (role.assignedWorkers || []).forEach((wid) => {
            if (!isWorkerPendingInitialNotification(role, wid)) return;
            const worker = getWorkerById(wid);
            if (!worker) return;
            recipients.push({
              worker,
              workOrderId: wo.id,
              shiftId: shift.id,
              roleId: role.id,
              shiftDate: shift.date,
              shiftTime: `${shift.startTime}-${shift.endTime}`,
              roleStartTime:
                role.startTime || shift.defaultRoleStartTime || shift.startTime,
              roleName: role.roleName,
              projectName: project?.name || wo.title,
              location: (shift.address || '').trim(),
              action: 'assigned',
              notificationSent: false,
            });
          });
        });
      }
    });

    if (recipients.length === 0) {
      toast({
        title: 'No Workers to Notify',
        description:
          'Every pending worker in the selected shifts has already been notified.',
        variant: 'destructive',
      });
      return;
    }

    setNotifyRecipients(recipients);
    setNotifyIsBulk(recipients.length > 1);
  }, [
    selectedShiftIds,
    workOrders,
    getProjectById,
    getWorkerById,
    toast,
    effectiveShiftStatuses,
    completedShiftKeys,
  ]);

  const selectedShiftsReadyToNotify = useMemo(() => {
    if (selectedShiftIds.size === 0) return false;
    return Array.from(selectedShiftIds).some((shiftId) =>
      workOrders.some((workOrder) =>
        workOrder.shifts.some((shift) => {
          if (shift.id !== shiftId) return false;
          const effective =
            effectiveShiftStatuses[shift.id] ??
            getEffectiveShiftStatus(
              shift,
              completedShiftKeys.has(`${workOrder.id}:${shift.id}`),
            );
          return (
            (effective === 'ready_to_notify' ||
              effective === 'awaiting_response') &&
            hasWorkersPendingInitialNotification(shift)
          );
        }),
      ),
    );
  }, [
    selectedShiftIds,
    workOrders,
    effectiveShiftStatuses,
    completedShiftKeys,
  ]);

  const openRemindersForShift = useCallback(
    (shift: Shift, woId: string) => {
      const effective =
        effectiveShiftStatuses[shift.id] ??
        getEffectiveShiftStatus(
          shift,
          completedShiftKeys.has(`${woId}:${shift.id}`),
        );
      if (effective !== 'ready_to_notify' && effective !== 'awaiting_response')
        return;
      const wo = workOrders.find((w) => w.id === woId);
      if (!wo) return;
      const project = getProjectById(wo.projectId);
      const recipients: NotificationRecipient[] = [];
      (shift.roles || []).forEach((role) => {
        (role.assignedWorkers || []).forEach((wid) => {
          if (getWorkerConfirmationStatus(role, wid) !== 'pending') return;
          const worker = getWorkerById(wid);
          if (!worker) return;
          recipients.push({
            worker,
            workOrderId: wo.id,
            shiftId: shift.id,
            roleId: role.id,
            shiftDate: shift.date,
            shiftTime: `${shift.startTime}-${shift.endTime}`,
            roleStartTime:
              role.startTime || shift.defaultRoleStartTime || shift.startTime,
            roleName: role.roleName,
            projectName: project?.name || wo.title,
            location: (shift.address || '').trim(),
            action: 'assigned',
            notificationSent: hasWorkerConfirmationRequest(role, wid),
          });
        });
      });
      if (recipients.length === 0) {
        toast({
          title: 'No Pending Workers',
          description:
            'There are no workers still pending confirmation on this shift.',
          variant: 'destructive',
        });
        return;
      }
      setNotifyRecipients(recipients);
      setNotifyIsBulk(recipients.length > 1);
    },
    [
      workOrders,
      getProjectById,
      getWorkerById,
      toast,
      effectiveShiftStatuses,
      completedShiftKeys,
    ],
  );
  useEffect(() => {
    const sorted = [...dateStrsForFiltering].sort();
    setShiftStatusCounters(null);
    if (sorted.length === 0) {
      setEffectiveShiftStatuses({});
      return;
    }
    let active = true;
    fetchShiftStats({ from: sorted[0], to: sorted[sorted.length - 1] })
      .then((result) => {
        if (!active) return;
        setShiftStatusCounters(result.counters);
        setEffectiveShiftStatuses(
          Object.fromEntries(
            result.shifts.map((item) => [item.shiftId, item.status]),
          ),
        );
      })
      .catch(() => {
        if (!active) return;
        setShiftStatusCounters(null);
        setEffectiveShiftStatuses({});
      });
    return () => {
      active = false;
    };
  }, [dateStrsForFiltering, workOrders]);

  const handleNotificationSent = useCallback(
    (entries: NotificationLogEntry[]) => {
      workOrders.forEach((workOrder) => {
        const updated = applyNotificationRequestEntriesToWorkOrder(
          workOrder,
          entries,
        );
        if (updated)
          void updateWorkOrder(workOrder.id, { shifts: updated.shifts });
      });
    },
    [workOrders, updateWorkOrder],
  );

  const renderShiftBlock = (shift: Shift, wo: WorkOrder, isDay: boolean) => {
    const totalA = shift.roles.reduce(
      (a, r) => a + r.assignedWorkers.length,
      0,
    );
    const totalR = shift.roles.reduce((a, r) => a + r.requiredCount, 0);
    const confirmationSummary = getShiftConfirmationSummary(shift);
    const backendStatus = effectiveShiftStatuses[shift.id];
    const effectiveShiftStatus =
      backendStatus !== undefined
        ? (backendStatus as ReturnType<typeof getEffectiveShiftStatus>)
        : getEffectiveShiftStatus(
            shift,
            completedShiftKeys.has(`${wo.id}:${shift.id}`),
          );
    const isCompleted =
      effectiveShiftStatus === 'shift_completed' ||
      effectiveShiftStatus === 'pm_approved';
    const isCancelled = effectiveShiftStatus === 'shift_cancelled';
    const isLocked = isCompleted || isCancelledAssignment(wo);
    const cardAccent = getShiftCardAccent(shift);
    const accentChrome =
      cardAccent === 'completed'
        ? {
            shell: 'border-gray-200/80 bg-gray-50/90',
          }
        : cardAccent === 'understaffed'
          ? {
              shell: 'border-red-200/70 bg-red-50/85',
            }
          : cardAccent === 'declined'
            ? {
                shell: 'border-red-200/70 bg-red-50/85',
              }
            : cardAccent === 'confirmed'
              ? {
                  shell: 'border-emerald-200/70 bg-emerald-50/85',
                }
              : {
                  shell: 'border-amber-200/70 bg-amber-50/85',
                };
    const confirmationTone = isCompleted
      ? {
          badge:
            'bg-gray-100 text-gray-700 border border-gray-200/90 shadow-sm',
          label: 'Completed',
        }
      : confirmationSummary.status === 'confirmed'
        ? {
            badge:
              'bg-emerald-100 text-emerald-800 border border-emerald-200/90 shadow-sm',
            label: `Confirmed (${confirmationSummary.confirmed}/${confirmationSummary.assigned})`,
          }
        : confirmationSummary.status === 'declined'
          ? {
              badge:
                'bg-red-100 text-red-800 border border-red-200/90 shadow-sm',
              label: `Declined (${confirmationSummary.declined}/${confirmationSummary.assigned})`,
            }
          : {
              badge:
                'bg-amber-100 text-amber-900 border border-amber-200/90 shadow-sm',
              label: `Pending (${confirmationSummary.confirmed}/${confirmationSummary.assigned})`,
            };
    const statusPresentation = getShiftStatusPresentation(effectiveShiftStatus);

    return (
      <ShiftHoverTooltip
        key={shift.id}
        shift={shift}
        effectiveStatus={effectiveShiftStatus}
        onOpenDetails={() => setShiftDetailsPanel({ shift, woId: wo.id })}
      >
        <div
          draggable={!isLocked}
          className={`group/shift rounded-lg border transition-all cursor-pointer hover:shadow-md ${
            statusPresentation.shell
          } ${
            selectedShiftIds.has(shift.id)
              ? 'ring-1 ring-blue-400/80 border-blue-300/90 shadow-sm'
              : ''
          }`}
          onDragStart={(event) => {
            if (isLocked) {
              event.preventDefault();
              return;
            }
            event.stopPropagation();
            event.dataTransfer.effectAllowed = 'move';
            event.dataTransfer.setData(
              'application/x-dr-workops-shift',
              JSON.stringify({ shiftId: shift.id, woId: wo.id }),
            );
            setDraggedShift({ shiftId: shift.id, woId: wo.id });
          }}
          onDragEnd={() => {
            setDraggedShift(null);
            setDragOverShiftCell(null);
          }}
          onClick={(e) => handleShiftSelect(shift.id, e)}
          onDoubleClick={(e) => {
            e.stopPropagation();
            setEditingShift({ shift, woId: wo.id });
          }}
        >
          <div className={`p-2 ${isDay ? 'flex items-start gap-4' : ''}`}>
            <div className="w-full">
              <div className="mb-1 flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-[11px] font-bold text-gray-800">
                  {shift.shiftName}
                </span>
                <span
                  className={`shrink-0 text-[10px] font-bold ${getShiftHeadcountTextClass(shift)}`}
                >
                  {totalA}/{totalR}
                </span>
              </div>

              {}
              <div className="space-y-1">
                {shift.roles.map((role) => (
                  <div key={role.id}>
                    <div className="flex items-center gap-1 mb-0.5">
                      <span
                        className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${roleColor(role.roleName)}`}
                      />
                      <span className="text-[10px] font-semibold text-gray-700">
                        {role.roleName}
                      </span>
                      <span
                        className={`text-[9px] font-bold ${getRoleHeadcountTextClass(role)}`}
                      >
                        {role.assignedWorkers.length}/{role.requiredCount}
                      </span>
                    </div>
                    {}
                    <div className="ml-2.5 space-y-0.5">
                      {role.assignedWorkers.map((wid) => {
                        const w = getWorkerById(wid);
                        return w ? (
                          <div
                            key={wid}
                            className="flex w-full min-w-0 items-center justify-between gap-1 text-[10px] text-gray-700"
                          >
                            <span className="min-w-0 flex-1 truncate">
                              {w.firstName} {w.lastName}
                            </span>
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
                          </div>
                        ) : null;
                      })}
                      {role.assignedWorkers.length < role.requiredCount && (
                        <div className="w-5 h-5 rounded-full border-2 border-dashed border-gray-300 flex items-center justify-center">
                          <Plus size={8} className="text-gray-400" />
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {}
            <div className="opacity-0 group-hover/shift:opacity-100 flex items-center gap-0.5 mt-1 transition-opacity">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (!isLocked && !isCancelled)
                    handleQuickAdd(shift.date, wo.id);
                }}
                disabled={isLocked}
                className="p-0.5 hover:bg-emerald-50 rounded disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
                title={
                  isLocked
                    ? 'Completed shifts cannot be modified'
                    : isCancelled
                      ? 'Cancelled shifts cannot receive another shift'
                      : 'Add another shift'
                }
              >
                <Plus size={10} className="text-emerald-600" />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setEditingShift({ shift, woId: wo.id });
                }}
                className="p-0.5 hover:bg-gray-100 rounded"
                title={isLocked ? 'View completed shift' : 'Edit'}
              >
                <Edit2 size={10} className="text-gray-500" />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShiftChatPanel({ shift, woId: wo.id });
                }}
                className="relative p-0.5 hover:bg-blue-50 rounded"
                title="Shift chat"
              >
                <MessageCircle size={10} className="text-blue-600" />
                {(shiftChatUnread[shift.id] || 0) > 0 && (
                  <span className="absolute -right-1.5 -top-1.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-red-500 px-0.5 text-[8px] font-bold leading-none text-white">
                    {shiftChatUnread[shift.id] > 9
                      ? '9+'
                      : shiftChatUnread[shift.id]}
                  </span>
                )}
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleDuplicateShift(shift, wo.id);
                }}
                disabled={isLocked}
                className="p-0.5 hover:bg-gray-100 rounded disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
                title={
                  isLocked
                    ? 'Completed shifts cannot be duplicated'
                    : isCancelled
                      ? 'Duplicate as a new active shift'
                      : 'Duplicate'
                }
              >
                <Copy size={10} className="text-gray-500" />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleDeleteShift(shift.id, wo.id);
                }}
                disabled={isLocked || isCancelled}
                className="p-0.5 hover:bg-red-50 rounded disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
                title={
                  isLocked
                    ? 'Completed shifts cannot be deleted'
                    : isCancelled
                      ? 'Cancelled shifts cannot be deleted'
                      : 'Delete'
                }
              >
                <Trash2 size={10} className="text-red-400" />
              </button>
            </div>
          </div>
        </div>
      </ShiftHoverTooltip>
    );
  };

  // Completion data protects existing edit controls; never treat a failed read as empty.
  if (!submissionIndex.data) return <DocumentReadNotice pending={submissionIndex.isPending} failed={submissionIndex.isError} retry={submissionIndex.refetch} />;

  return (<AppContextOverride value={{ workOrders }}><div className="min-w-0 lg:h-full flex flex-col bg-[#f4f6f9]">
      <div className="flex-shrink-0 px-5 lg:px-8 py-3 space-y-3">
        <section aria-label="Overview statistics">
          <div
            className={`flex items-center justify-between ${workersStatusCollapsed ? '' : 'mb-2'}`}
          >
            <h3 className="text-[10px] font-bold text-gray-500 uppercase tracking-[0.12em]">
              Workers Status
            </h3>
            <button
              type="button"
              onClick={toggleWorkersStatus}
              aria-expanded={!workersStatusCollapsed}
              aria-controls="schedule-workers-status-overview schedule-shift-status-overview"
              className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 text-[10px] font-semibold text-gray-600 shadow-sm transition-colors hover:border-gray-300 hover:bg-gray-50 hover:text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
              title={workersStatusCollapsed ? 'Show overview' : 'Hide overview'}
            >
              {workersStatusCollapsed ? (
                <>
                  <ChevronDown size={13} />
                  Show overview
                </>
              ) : (
                <>
                  <ChevronUp size={13} />
                  Hide overview
                </>
              )}
            </button>
          </div>
          {!workersStatusCollapsed && (
            <div
              id="schedule-workers-status-overview"
              className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2"
            >
              <div className="flex items-start gap-2 rounded-lg border border-blue-200/70 bg-blue-50/85 px-2.5 py-2 shadow-sm">
                <Users
                  className="h-4 w-4 shrink-0 text-blue-600 mt-0.5"
                  strokeWidth={2}
                />
                <div className="min-w-0 leading-tight">
                  <span className="text-lg font-bold tabular-nums text-gray-900">
                    {weekStats.totalRequired}
                  </span>
                  <p className="text-[11px] font-bold text-gray-900">
                    Total Requested
                  </p>
                  <p className="text-[10px] text-gray-500 leading-snug">
                    All scheduled
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-2 rounded-lg border border-blue-200/70 bg-blue-50/85 px-2.5 py-2 shadow-sm">
                <Users
                  className="h-4 w-4 shrink-0 text-blue-600 mt-0.5"
                  strokeWidth={2}
                />
                <div className="min-w-0 leading-tight">
                  <span className="text-lg font-bold tabular-nums text-gray-900">
                    {weekStats.totalWorkers}
                  </span>
                  <p className="text-[11px] font-bold text-gray-900">
                    Total Scheduled
                  </p>
                  <p className="text-[10px] text-gray-500 leading-snug">
                    Assigned to shifts
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-2 rounded-lg border border-red-200/70 bg-red-50/85 px-2.5 py-2 shadow-sm">
                <UserX
                  className="h-4 w-4 shrink-0 text-red-600 mt-0.5"
                  strokeWidth={2}
                />
                <div className="min-w-0 leading-tight">
                  <span className="text-lg font-bold tabular-nums text-gray-900">
                    {weekStats.missingWorkerSlots}
                  </span>
                  <p className="text-[11px] font-bold text-gray-900">
                    Workers Missing
                  </p>
                  <p className="text-[10px] text-gray-500 leading-snug">
                    Roles unfilled
                  </p>
                </div>
              </div>

              <div
                className={`flex items-start gap-2 rounded-lg border px-2.5 py-2 shadow-sm ${
                  weekStats.awaitingWorkerResponses > 0
                    ? 'border-violet-200/70 bg-violet-50/85'
                    : 'border-violet-100/55 bg-violet-50/55'
                }`}
              >
                <Mail
                  className={`h-4 w-4 shrink-0 mt-0.5 ${
                    weekStats.awaitingWorkerResponses > 0
                      ? 'text-violet-600'
                      : 'text-violet-400/90'
                  }`}
                  strokeWidth={2}
                />
                <div className="min-w-0 leading-tight">
                  <span className="text-lg font-bold tabular-nums text-gray-900">
                    {weekStats.awaitingWorkerResponses}
                  </span>
                  <p className="text-[11px] font-bold text-gray-900">
                    Awaiting Response
                  </p>
                  <p className="text-[10px] text-gray-500 leading-snug">
                    Waiting for workers
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-2 rounded-lg border border-emerald-200/70 bg-emerald-50/85 px-2.5 py-2 shadow-sm">
                <CheckCircle2
                  className="h-4 w-4 shrink-0 text-emerald-600 mt-0.5"
                  strokeWidth={2}
                />
                <div className="min-w-0 leading-tight">
                  <span className="text-lg font-bold tabular-nums text-gray-900">
                    {weekStats.confirmedWorkers}
                  </span>
                  <p className="text-[11px] font-bold text-gray-900">
                    Workers Confirmed
                  </p>
                  <p className="text-[10px] text-gray-500 leading-snug">
                    Workers confirmed
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-2 rounded-lg border-2 border-dashed border-emerald-300 bg-emerald-50/70 px-2.5 py-2 shadow-sm">
                <Users
                  className="h-4 w-4 shrink-0 text-emerald-600 mt-0.5"
                  strokeWidth={2}
                />
                <div className="min-w-0 leading-tight">
                  <span className="text-lg font-bold tabular-nums text-gray-900">
                    {weekStats.confirmedWorkers} / {weekStats.totalRequired}
                  </span>
                  <p className="text-[11px] font-bold text-gray-900">
                    Workers Confirmed / Requested
                  </p>
                  <p className="text-[10px] text-gray-500 leading-snug">
                    {weekStats.totalRequired > 0
                      ? Math.round(
                          (weekStats.confirmedWorkers /
                            weekStats.totalRequired) *
                            100,
                        )
                      : 0}
                    % of requested confirmed
                  </p>
                </div>
              </div>
            </div>
          )}
        </section>

        {!workersStatusCollapsed && (
          <section
            id="schedule-shift-status-overview"
            aria-label="Schedule summary and filters"
          >
            <div className="rounded-2xl border border-gray-200/90 bg-white px-3 sm:px-4 py-2.5 shadow-sm flex flex-wrap items-center gap-x-4 gap-y-2.5 justify-between">
              <div className="flex flex-wrap items-center gap-x-5 gap-y-2 min-w-0 flex-1">
                <div className="min-w-0">
                  <p className="text-[10px] font-bold text-gray-500 uppercase tracking-[0.12em] mb-0.5">
                    Shift Status
                  </p>
                  <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0">
                    <span className="text-lg font-bold tabular-nums text-gray-900 leading-none">
                      {shiftStatusCounters?.totalShifts ??
                        weekStats.totalShifts}
                    </span>
                    <span className="text-sm font-semibold text-gray-900">
                      {(shiftStatusCounters?.totalShifts ??
                        weekStats.totalShifts) === 1
                        ? 'Shift'
                        : 'Shifts'}{' '}
                      {calendarMode === 'week' ? 'this week' : 'today'}
                    </span>
                  </div>
                  <p
                    className="text-[10px] text-gray-500 mt-0.5 truncate max-w-[min(100%,22rem)]"
                    title={headerDateLabel}
                  >
                    With shifts in view · {headerDateLabel}
                  </p>
                </div>
              </div>

              <div className="order-3 flex w-full flex-wrap items-center gap-2">
                {[
                  {
                    status: 'customer_pending',
                    label: 'Customer Pending',
                    count: shiftStatusCounters?.customerPending ?? 0,
                    dot: 'bg-orange-600',
                    pill: 'border-orange-300 bg-orange-100 text-orange-900',
                  },
                  {
                    status: 'dispatch_pending',
                    label: 'Dispatch Pending',
                    count: shiftStatusCounters?.dispatchPending ?? 0,
                    dot: 'bg-yellow-500',
                    pill: 'border-yellow-300 bg-yellow-100 text-yellow-950',
                  },
                  {
                    status: 'ready_to_notify',
                    label: 'Ready to Notify',
                    count: shiftStatusCounters?.readyToNotify ?? 0,
                    dot: 'bg-blue-600',
                    pill: 'border-blue-300 bg-blue-100 text-blue-900',
                  },
                  {
                    status: 'awaiting_response',
                    label: 'Awaiting Response',
                    count: shiftStatusCounters?.awaitingResponse ?? 0,
                    dot: 'bg-violet-600',
                    pill: 'border-violet-300 bg-violet-100 text-violet-900',
                  },
                  {
                    status: 'workers_confirmed',
                    label: 'Workers Confirmed',
                    count: shiftStatusCounters?.workersConfirmed ?? 0,
                    dot: 'bg-green-600',
                    pill: 'border-green-300 bg-green-100 text-green-900',
                  },
                  {
                    status: 'shift_cancelled',
                    label: 'Shift Cancelled',
                    count: shiftStatusCounters?.shiftCancelled ?? 0,
                    dot: 'bg-red-600',
                    pill: 'border-red-300 bg-red-100 text-red-900',
                  },
                  {
                    status: 'shift_completed',
                    label: 'Shift Completed',
                    count: shiftStatusCounters?.shiftCompleted ?? 0,
                    dot: 'bg-slate-600',
                    pill: 'border-slate-400 bg-slate-200 text-slate-900',
                  },
                  {
                    status: 'pm_approved',
                    label: 'PM Approved',
                    count: shiftStatusCounters?.pmApproved ?? 0,
                    dot: 'bg-teal-600',
                    pill: 'border-teal-400 bg-teal-100 text-teal-900',
                  },
                ].map((item) => (
                  <button
                    type="button"
                    key={item.status}
                    onClick={() =>
                      setSelectedShiftStatusFilter((current) =>
                        current === item.status ? null : item.status,
                      )
                    }
                    aria-pressed={selectedShiftStatusFilter === item.status}
                    className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[10px] font-semibold transition-all hover:brightness-95 ${item.pill} ${selectedShiftStatusFilter === item.status ? 'ring-2 ring-offset-1 ring-current shadow-sm' : ''}`}
                  >
                    <span
                      className={`h-2 w-2 rounded-full ${item.dot}`}
                      aria-hidden
                    />
                    <b className="tabular-nums">{item.count}</b> {item.label}
                  </button>
                ))}
              </div>

              <div className="flex flex-wrap items-center justify-end gap-2 shrink-0 w-full sm:w-auto">
                <div className="flex items-center bg-gray-100/90 border border-gray-200/60 rounded-full p-0.5">
                  {(['day', 'week'] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setCalendarMode(m)}
                      className={`px-3 py-1.5 text-xs rounded-full font-semibold transition-all capitalize ${
                        calendarMode === m
                          ? 'bg-white shadow-sm text-primary'
                          : 'text-gray-500 hover:text-gray-700'
                      }`}
                    >
                      {m}
                    </button>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={() => setShowFilters(!showFilters)}
                  className={`relative p-2 rounded-full border transition-colors shrink-0 ${
                    showFilters ||
                    scheduleStripTab !== 'all' ||
                    selectedProject ||
                    filterStartDate ||
                    filterEndDate ||
                    schedulerSearchQuery
                      ? 'bg-blue-50 border-blue-200'
                      : 'border-gray-200 hover:bg-gray-50 bg-white border shadow-sm'
                  }`}
                  aria-expanded={showFilters}
                  aria-label="Filters"
                >
                  <Filter
                    size={16}
                    className={
                      showFilters ||
                      scheduleStripTab !== 'all' ||
                      selectedProject ||
                      filterStartDate ||
                      filterEndDate ||
                      schedulerSearchQuery
                        ? 'text-primary'
                        : 'text-gray-500'
                    }
                  />
                </button>

                {onOpenNewWO && (
                  <button
                    type="button"
                    onClick={onOpenNewWO}
                    className="px-4 py-2 rounded-full text-sm font-bold bg-primary text-primary-foreground hover:bg-primary/90 flex items-center gap-1.5 shadow-md transition-all"
                  >
                    <Plus size={15} strokeWidth={2.5} /> New Assignment
                  </button>
                )}
                <button
                  type="button"
                  onClick={openNotifyForSelection}
                  disabled={!selectedShiftsReadyToNotify}
                  className={
                    selectedShiftsReadyToNotify
                      ? 'px-4 py-2 rounded-full text-sm font-bold text-white flex items-center gap-1.5 shadow-md transition-all bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700'
                      : 'px-4 py-2 rounded-full text-sm font-semibold text-gray-400 flex items-center gap-1.5 border border-gray-200 bg-gray-100 cursor-not-allowed'
                  }
                  title={
                    selectedShiftIds.size === 0
                      ? 'Select one or more shifts, then notify workers who are still pending confirmation'
                      : !selectedShiftsReadyToNotify
                        ? 'The selected shifts do not have workers pending an initial notification'
                        : 'Notify only workers who have not been notified yet'
                  }
                >
                  <Bell size={14} />
                  Notify
                </button>
              </div>
            </div>

            {showFilters && (
              <div className="mt-3 w-full">
                <div className="flex flex-col gap-2 rounded-2xl border border-gray-200/90 bg-white px-4 py-2.5 shadow-sm">
                  <div className="flex flex-wrap items-center gap-4">
                    <div className="flex min-w-0 w-full sm:min-w-[18rem] flex-1 items-center gap-2">
                      <label className="text-xs font-medium text-gray-600 whitespace-nowrap">
                        Project:
                      </label>
                      <select
                        value={selectedProject || ''}
                        onChange={(e) =>
                          setSelectedProject(e.target.value || null)
                        }
                        className="w-full min-w-0 sm:min-w-[12rem] text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white"
                      >
                        <option value="">All Projects</option>
                        {projects.map((p) => (
                          <option key={p.id} value={p.id}>
                            #{p.number} - {p.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="flex min-w-0 w-full sm:min-w-[18rem] flex-1 items-center gap-2">
                      <label
                        className="text-xs font-medium text-gray-600 whitespace-nowrap"
                        htmlFor="schedule-project-search"
                      >
                        Search project:
                      </label>
                      <input
                        id="schedule-project-search"
                        type="search"
                        value={schedulerSearchQuery}
                        onChange={(e) =>
                          setSchedulerSearchQuery(e.target.value)
                        }
                        placeholder="Project name or code"
                        className="w-full min-w-0 sm:min-w-[11rem] text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <label
                        className="text-xs font-medium text-gray-600 whitespace-nowrap"
                        htmlFor="schedule-start-date-filter"
                      >
                        Start Date:
                      </label>
                      <input
                        id="schedule-start-date-filter"
                        type="date"
                        value={filterStartDate}
                        onChange={(e) => {
                          const value = e.target.value;
                          setFilterStartDate(value);
                          if (filterEndDate && value > filterEndDate)
                            setFilterEndDate(value);
                          if (!value) return;
                          const nextDate = new Date(`${value}T00:00:00`);
                          setDayDate(nextDate);
                          setWeekStart(startOfWeek(nextDate));
                        }}
                        className="min-w-[9.5rem] text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <label
                        className="text-xs font-medium text-gray-600 whitespace-nowrap"
                        htmlFor="schedule-end-date-filter"
                      >
                        End Date:
                      </label>
                      <input
                        id="schedule-end-date-filter"
                        type="date"
                        min={filterStartDate || undefined}
                        value={filterEndDate}
                        onChange={(e) => setFilterEndDate(e.target.value)}
                        className="min-w-[9.5rem] text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedProject(null);
                        setFilterStartDate('');
                        setFilterEndDate('');
                        setScheduleStripTab('all');
                        setSelectedWorkOrderId(null);
                        setDetailSidebarWoId(null);
                        setSchedulerSearchQuery('');
                        setShowFilters(false);
                      }}
                      className="text-xs text-gray-500 hover:text-gray-700 ml-auto"
                    >
                      Clear All
                    </button>
                  </div>
                </div>
              </div>
            )}
          </section>
        )}
      </div>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col lg:flex-row">
        {}
        <div ref={assignmentRowsRef} className="min-w-0 flex-1 overflow-auto px-3 sm:px-5 lg:px-8 pb-8 min-h-80 lg:min-h-0">
          <div
            className={`${calendarMode === 'week' ? 'min-w-[932px]' : 'min-w-full'} rounded-2xl border border-gray-200/80 bg-white shadow-sm overflow-clip mb-6`}
          >
            {}
            <div className="sticky top-0 z-20 bg-white border-b border-gray-200 flex">
              {}
              <div className="w-40 min-w-[10rem] sm:w-72 sm:min-w-[18rem] flex-shrink-0 px-4 py-3 border-r border-gray-200 bg-gray-50">
                <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                  Project / Assignment
                </span>
              </div>
              {}
              {days.map((d, i) => {
                const dateStr = d.toISOString().split('T')[0];
                const isToday = dateStr === today;
                const isWeekend = d.getDay() === 0 || d.getDay() === 6;

                let dayShifts = 0,
                  dayWorkers = 0,
                  dayRequired = 0;
                filteredCalendarWorkOrders.forEach((wo) => {
                  wo.shifts.forEach((s) => {
                    if (s.date === dateStr) {
                      dayShifts++;
                      s.roles.forEach((r) => {
                        dayWorkers += r.assignedWorkers.length;
                        dayRequired += r.requiredCount;
                      });
                    }
                  });
                });

                return (
                  <div
                    key={i}
                    className={`flex-1 min-w-[120px] text-center py-2.5 border-r border-gray-100 last:border-r-0 ${
                      isToday
                        ? 'bg-blue-50/90 shadow-[inset_0_-2px_0_0_rgb(147,197,253)]'
                        : isWeekend
                          ? 'bg-gray-50/70'
                          : 'bg-white'
                    }`}
                  >
                    {calendarMode === 'day' ? (
                      <p
                        className={`text-xs font-bold ${isToday ? 'text-blue-800' : isWeekend ? 'text-gray-400' : 'text-gray-600'}`}
                      >
                        {d.toLocaleDateString('en-US', {
                          weekday: 'long',
                          month: 'long',
                          day: 'numeric',
                        })}
                      </p>
                    ) : (
                      <div className="flex items-baseline justify-center gap-1.5">
                        <span
                          className={`text-xs font-bold ${isToday ? 'text-blue-800' : isWeekend ? 'text-gray-400' : 'text-gray-600'}`}
                        >
                          {d.toLocaleDateString('en-US', { weekday: 'short' })}
                        </span>
                        <span
                          className={`text-sm font-bold ${isToday ? 'text-blue-700' : 'text-gray-800'}`}
                        >
                          {d.getDate()}
                        </span>
                      </div>
                    )}
                    {dayShifts > 0 && (
                      <div className="flex items-center justify-center gap-1.5 mt-0.5">
                        <span className="text-[10px] text-gray-400">
                          {dayShifts}s
                        </span>
                        <span
                          className={`text-[10px] font-bold ${dayWorkers >= dayRequired ? 'text-emerald-600' : 'text-orange-600'}`}
                        >
                          {dayWorkers}/{dayRequired}
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {}
            {groupedWOs.map(([groupKey, wos]) => {
              const project = getProjectById(groupKey);
              const client = project
                ? getClientById(project.clientId)
                : undefined;
              const groupLabel = project?.name || groupKey;

              return (
                <div key={groupKey}>
                  {}
                  {groupedWOs.length > 1 && (
                    <div className="flex bg-gray-100/80 border-b border-gray-200 sticky top-[72px] z-10">
                      <div className="w-40 min-w-[10rem] sm:w-72 sm:min-w-[18rem] flex-shrink-0 px-4 py-2 border-r border-gray-200 flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full flex-shrink-0 bg-blue-500" />
                        <span className="text-xs font-bold text-gray-700 uppercase truncate">
                          {groupLabel}
                        </span>
                        {project && (
                          <span className="text-[10px] text-gray-400 font-mono">
                            #{project.number}
                          </span>
                        )}
                        <span className="text-[10px] bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded-full ml-auto">
                          {wos.length}
                        </span>
                      </div>
                      <div className="flex-1" />
                    </div>
                  )}

                  {}
                  {wos.map((wo) => {
                    const scopedStatus = scopedAssignmentStatuses.get(wo.id);
                    const woProject = getProjectById(wo.projectId);
                    const siteAddressLine = formatWorkOrderSiteAddress(
                      wo,
                      woProject,
                    );
                    const isSelectedWorkOrder = selectedWorkOrderId === wo.id;

                    return (
                      <div
                        key={wo.id}
                        className={`border-b border-gray-200 transition-colors ${
                          isSelectedWorkOrder
                            ? 'bg-sky-50/90'
                            : 'hover:bg-white/50'
                        }`}
                      >
                        <div className="flex">
                          {}
                          <div
                            className={`w-40 min-w-[10rem] sm:w-72 sm:min-w-[18rem] flex-shrink-0 border-r cursor-pointer transition-colors ${
                              isSelectedWorkOrder
                                ? 'border-sky-200/70 bg-white shadow-[inset_3px_0_0_0_rgb(125,211,252)]'
                                : 'border-gray-200 bg-white'
                            }`}
                            onClick={() =>
                              setSelectedWorkOrderId((prev) =>
                                prev === wo.id ? null : wo.id,
                              )
                            }
                          >
                            <div className="px-3 py-2.5">
                              <div className="mb-1 flex items-center gap-2">
                                <span
                                  className={`min-w-0 flex-1 truncate text-sm font-semibold ${
                                    isSelectedWorkOrder
                                      ? 'text-gray-900'
                                      : 'text-gray-800'
                                  }`}
                                >
                                  {woProject
                                    ? [
                                        woProject.number
                                          ? `#${woProject.number}`
                                          : '',
                                        woProject.name,
                                      ]
                                        .filter(Boolean)
                                        .join(' - ')
                                    : wo.title}
                                </span>
                              </div>
                              <div className="ml-4 flex flex-wrap items-center gap-2">
                                <span className="rounded border border-gray-200 bg-gray-50 px-1.5 py-0.5 text-[10px] font-medium text-gray-700 tabular-nums">
                                  {formatAssignmentDateRangeShort(wo)}
                                </span>
                                <span
                                  className={`truncate text-xs font-extrabold tabular-nums tracking-tight ${
                                    isSelectedWorkOrder
                                      ? 'text-sky-950'
                                      : 'text-gray-900'
                                  }`}
                                >
                                  {scopedStatus?.shiftCount === 1
                                    ? '1 shift'
                                    : `${scopedStatus?.shiftCount ?? 0} shifts`}
                                </span>
                              </div>
                              <div className="mt-1.5 ml-4 flex min-w-0 gap-2 pr-2">
                                <MapPin
                                  size={10}
                                  className="mt-0.5 shrink-0 opacity-90 text-gray-400"
                                  aria-hidden
                                />
                                <div className="min-w-0 flex-1">
                                  <p
                                    className={`line-clamp-3 text-[10px] leading-snug break-words ${
                                      isSelectedWorkOrder
                                        ? 'text-gray-700'
                                        : 'text-gray-600'
                                    }`}
                                    title={siteAddressLine}
                                  >
                                    {siteAddressLine}
                                  </p>
                                </div>
                              </div>
                              {}
                              <div className="mt-1.5 ml-4 pr-2">
                                <div className="-mx-0.5 flex w-full flex-nowrap items-center justify-start gap-1">
                                  <Tooltip delayDuration={200}>
                                    <TooltipTrigger asChild>
                                      <button
                                        type="button"
                                        aria-label="View assignment details"
                                        title="View"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setDetailSidebarWoId(wo.id);
                                        }}
                                        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-sky-100/80 bg-sky-50 text-sky-700 hover:bg-sky-100"
                                      >
                                        <Eye size={14} strokeWidth={2} />
                                      </button>
                                    </TooltipTrigger>
                                    <TooltipContent
                                      side="top"
                                      className="text-xs font-medium"
                                    >
                                      View
                                    </TooltipContent>
                                  </Tooltip>
                                  <Tooltip delayDuration={200}>
                                    <TooltipTrigger asChild>
                                      <button
                                        type="button"
                                        aria-label="Edit assignment"
                                        title="Edit"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          openEditWOModal(wo);
                                        }}
                                        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-blue-100/80 bg-blue-50 text-blue-600 hover:bg-blue-100"
                                      >
                                        <Edit2 size={14} />
                                      </button>
                                    </TooltipTrigger>
                                    <TooltipContent
                                      side="top"
                                      className="text-xs font-medium"
                                    >
                                      Edit
                                    </TooltipContent>
                                  </Tooltip>
                                  <Tooltip delayDuration={200}>
                                    <TooltipTrigger asChild>
                                      <button
                                        type="button"
                                        aria-label="Duplicate assignment"
                                        title="Duplicate"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          void handleDuplicateWorkOrder(wo);
                                        }}
                                        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-emerald-100/80 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                                      >
                                        <Copy size={14} />
                                      </button>
                                    </TooltipTrigger>
                                    <TooltipContent
                                      side="top"
                                      className="text-xs font-medium"
                                    >
                                      Duplicate
                                    </TooltipContent>
                                  </Tooltip>
                                  <Tooltip delayDuration={200}>
                                    <TooltipTrigger asChild>
                                      <button
                                        type="button"
                                        aria-label="Delete assignment"
                                        title="Delete"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleAssignmentDeleteRequest(
                                            wo,
                                            woProject?.name || wo.title,
                                          );
                                        }}
                                        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-red-100/80 bg-red-50 text-red-600 hover:bg-red-100"
                                      >
                                        <Trash2 size={14} />
                                      </button>
                                    </TooltipTrigger>
                                    <TooltipContent
                                      side="top"
                                      className="text-xs font-medium"
                                    >
                                      Delete
                                    </TooltipContent>
                                  </Tooltip>
                                </div>
                              </div>
                            </div>
                          </div>

                          {}
                          {days.map((d, di) => {
                            const dateStr = d.toISOString().split('T')[0];
                            const shiftsForDay = getShiftsForDay(wo, d);
                            const isCancelled = isCancelledAssignment(wo);
                            const isToday = dateStr === today;
                            const isWeekend =
                              d.getDay() === 0 || d.getDay() === 6;
                            const isPastDate = dateStr < today;
                            const cellKey = `${wo.id}_${dateStr}`;
                            const isHovered = hoveredCell === cellKey;
                            const isShiftDragTarget =
                              dragOverShiftCell === cellKey &&
                              draggedShift?.woId === wo.id &&
                              !isPastDate &&
                              isShiftDateWithinAssignmentRange(dateStr, wo);

                            const dayCellSurface = isHovered
                              ? isSelectedWorkOrder
                                ? isToday
                                  ? 'bg-sky-100/95'
                                  : isWeekend
                                    ? 'bg-sky-50/95'
                                    : 'bg-sky-50/90'
                                : isToday
                                  ? 'bg-blue-100/90'
                                  : isWeekend
                                    ? 'bg-gray-100/90'
                                    : 'bg-blue-50/85'
                              : isSelectedWorkOrder
                                ? isToday
                                  ? 'bg-sky-50/95'
                                  : isWeekend
                                    ? 'bg-sky-50/75'
                                    : 'bg-sky-50/70'
                                : isToday
                                  ? 'bg-blue-50/85'
                                  : isWeekend
                                    ? 'bg-gray-50/30'
                                    : '';

                            return (
                              <div
                                key={di}
                                className={`flex-1 min-w-[120px] border-r border-gray-100 last:border-r-0 p-1.5 transition-colors ${dayCellSurface}${
                                  isToday && !isSelectedWorkOrder && !isHovered
                                    ? ' ring-1 ring-inset ring-blue-300/50'
                                    : ''
                                }${isShiftDragTarget ? ' ring-2 ring-inset ring-emerald-400 bg-emerald-50/80' : ''}`}
                                onMouseEnter={() => setHoveredCell(cellKey)}
                                onMouseLeave={() => setHoveredCell(null)}
                                onDragOver={(event) => {
                                  if (
                                    draggedShift?.woId !== wo.id ||
                                    isPastDate ||
                                    !isShiftDateWithinAssignmentRange(
                                      dateStr,
                                      wo,
                                    )
                                  )
                                    return;
                                  event.preventDefault();
                                  event.dataTransfer.dropEffect = 'move';
                                  setDragOverShiftCell(cellKey);
                                }}
                                onDragLeave={(event) => {
                                  if (
                                    !event.currentTarget.contains(
                                      event.relatedTarget as Node | null,
                                    )
                                  ) {
                                    setDragOverShiftCell((current) =>
                                      current === cellKey ? null : current,
                                    );
                                  }
                                }}
                                onDrop={(event) => {
                                  event.preventDefault();
                                  event.stopPropagation();
                                  const moving = draggedShift;
                                  setDraggedShift(null);
                                  setDragOverShiftCell(null);
                                  if (!moving || moving.woId !== wo.id) return;
                                  void handleMoveShift(
                                    wo.id,
                                    moving.shiftId,
                                    dateStr,
                                  );
                                }}
                                onClick={() => {
                                  if (isPastDate || isCancelled) return;
                                  handleQuickAdd(dateStr, wo.id);
                                }}
                              >
                                {shiftsForDay.length > 0 ? (
                                  <div className="space-y-1.5">
                                    {shiftsForDay.map((shift) =>
                                      renderShiftBlock(
                                        shift,
                                        wo,
                                        calendarMode === 'day',
                                      ),
                                    )}
                                    {!isPastDate && !isCancelled && (
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleQuickAdd(dateStr, wo.id);
                                        }}
                                        className="w-full mt-1 border border-dashed border-blue-200 rounded-lg py-1 text-[11px] font-medium text-blue-500 hover:bg-blue-50"
                                      >
                                        + Add another shift
                                      </button>
                                    )}
                                  </div>
                                ) : (
                                  <div
                                    className={`h-full min-h-[60px] flex items-center justify-center rounded-lg border-2 border-dashed transition-all cursor-pointer ${
                                      isPastDate
                                        ? 'border-gray-200 bg-gray-50/80 cursor-not-allowed'
                                        : isCancelled
                                          ? 'border-gray-200 bg-red-50/50 cursor-not-allowed'
                                          : isHovered
                                            ? 'border-blue-400/80 bg-blue-100/70'
                                            : 'border-transparent'
                                    }`}
                                  >
                                    {isPastDate ? (
                                      <div className="flex items-center gap-1 text-gray-400">
                                        <span className="text-xs font-medium">
                                          Past date
                                        </span>
                                      </div>
                                    ) : isCancelled ? (
                                      <div className="flex items-center gap-1 text-red-400">
                                        <span className="text-xs font-medium">
                                          Cancelled
                                        </span>
                                      </div>
                                    ) : (
                                      isHovered && (
                                        <div className="flex items-center gap-1 text-blue-400">
                                          <Plus size={14} />
                                          <span className="text-xs font-medium">
                                            Add Shift
                                          </span>
                                        </div>
                                      )
                                    )}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })}

            {}
            <AssignmentReadState refreshing={scopeRead.isFetching || completeRecords.isFetching} pending={scopeRead.isPending || (!pageLoaded && completeRecords.isFetching)} failed={scopeRead.isError || completeRecords.isError} retry={() => { void scopeRead.refetch(); void completeRecords.refetch(); }} />
            {!scopeRead.isPending && !scopeRead.isError && pageLoaded && calendarWorkOrders.length === 0 && (
              <div className="flex items-center justify-center py-20">
                <div className="text-center">
                  <CalendarDays
                    size={48}
                    className="mx-auto mb-3 text-gray-300"
                  />
                  <p className="text-gray-500 font-medium">
                    No assignments in this date range
                  </p>
                  <p className="text-sm text-gray-400 mt-1">
                    Use the arrows or create an assignment for {headerDateLabel}
                  </p>
                  {onOpenNewWO && (
                    <button
                      onClick={onOpenNewWO}
                      className="mt-4 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 flex items-center gap-1.5 mx-auto"
                    >
                      <Plus size={14} /> New Assignment
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {detailSidebarWo && (
          <AssignmentDetailSidebar
            workOrder={detailSidebarWo}
            project={getProjectById(detailSidebarWo.projectId) ?? null}
            client={(() => {
              const p = getProjectById(detailSidebarWo.projectId);
              return p ? (getClientById(p.clientId) ?? null) : null;
            })()}
            equipment={equipment}
            onClose={() => setDetailSidebarWoId(null)}
          />
        )}
      </div>

        <div className="shrink-0"><DataPagination page={pagination.page} total={filteredCalendarWorkOrders.length} pageSize={pagination.pageSize} onPage={pagination.setPage} onPageSize={pagination.setPageSize} busy={scopeRead.isFetching || completeRecords.isFetching || !pageLoaded} itemLabel="assignments" className="border-t border-gray-200 px-4" /></div>

      {}
      {quickAddCell && (
        <QuickAddModal
          date={quickAddCell.date}
          woId={quickAddCell.woId}
          onAdd={handleCreateShift}
          onClose={() => setQuickAddCell(null)}
        />
      )}

      {}
      {editingShift && (
        <EditShiftModal
          key={editingShift.shift.id}
          shift={editingShift.shift}
          woId={editingShift.woId}
          effectiveStatus={
            effectiveShiftStatuses[editingShift.shift.id] as
              import('./shiftConfirmation').EffectiveShiftStatus | undefined
          }
          isLocked={
            isCancelledAssignment(
              workOrders.find(
                (workOrder) => workOrder.id === editingShift.woId,
              ),
            ) ||
            effectiveShiftStatuses[editingShift.shift.id] ===
              'shift_completed' ||
            effectiveShiftStatuses[editingShift.shift.id] === 'pm_approved' ||
            completedShiftKeys.has(
              `${editingShift.woId}:${editingShift.shift.id}`,
            )
          }
          onClose={() => setEditingShift(null)}
          onDelete={handleDeleteShift}
          onDuplicate={handleDuplicateShift}
          onCancelled={() =>
            setSelectedShiftIds((current) => {
              const next = new Set(current);
              next.delete(editingShift.shift.id);
              return next;
            })
          }
        />
      )}

      <ShiftDetailsSheet
        open={shiftDetailsPanel !== null}
        onOpenChange={(o) => {
          if (!o) setShiftDetailsPanel(null);
        }}
        shift={shiftDetailsPanel?.shift ?? null}
        woId={shiftDetailsPanel?.woId ?? null}
        isLocked={
          Boolean(shiftDetailsPanel) &&
          (isCancelledAssignment(
            workOrders.find(
              (workOrder) => workOrder.id === shiftDetailsPanel!.woId,
            ),
          ) ||
            effectiveShiftStatuses[shiftDetailsPanel!.shift.id] ===
              'shift_completed' ||
            effectiveShiftStatuses[shiftDetailsPanel!.shift.id] ===
              'pm_approved' ||
            completedShiftKeys.has(
              `${shiftDetailsPanel!.woId}:${shiftDetailsPanel!.shift.id}`,
            ) ||
            Boolean(shiftDetailsPanel!.shift.pmApprovedAt))
        }
        onEditShift={() => {
          if (!shiftDetailsPanel) return;
          const { shift: s, woId: wid } = shiftDetailsPanel;
          setShiftDetailsPanel(null);
          setEditingShift({ shift: s, woId: wid });
        }}
        onSendReminders={() => {
          if (!shiftDetailsPanel) return;
          openRemindersForShift(
            shiftDetailsPanel.shift,
            shiftDetailsPanel.woId,
          );
        }}
      />

      <ShiftChatAside
        open={shiftChatPanel !== null}
        shift={shiftChatPanel?.shift ?? null}
        workOrder={
          shiftChatPanel
            ? (workOrders.find((item) => item.id === shiftChatPanel.woId) ??
              null)
            : null
        }
        onClose={() => setShiftChatPanel(null)}
        onRead={handleShiftChatRead}
      />

      {notifyRecipients.length > 0 && (
        <NotifyWorkerModal
          recipients={notifyRecipients}
          onClose={() => setNotifyRecipients([])}
          onNotificationSent={handleNotificationSent}
          isBulk={notifyIsBulk}
        />
      )}

      {editingWO && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-2 sm:p-4">
          <div
            className="bg-white rounded-2xl w-full max-w-2xl max-h-[90dvh] flex flex-col shadow-2xl border border-gray-200 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between flex-shrink-0 flex-wrap gap-3">
              <div>
                <h2 className="text-base font-semibold text-gray-800">
                  Edit Assignment
                </h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  Update the general assignment information
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingWO(null)}
                className="p-1 hover:bg-gray-100 rounded"
              >
                <X size={14} className="text-gray-500" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-5">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                  Project Name *
                </label>
                <select
                  value={editWOForm.projectId}
                  onChange={(e) =>
                    setEditWOForm((prev) => ({
                      ...prev,
                      projectId: e.target.value,
                    }))
                  }
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">Select project...</option>
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      #{project.number} - {project.name}
                    </option>
                  ))}
                </select>
              </div>
              {selectedEditProjectData && (
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <FolderKanban size={14} className="text-primary" />
                    <span className="text-sm font-semibold text-blue-800">
                      {selectedEditProjectData.name}
                    </span>
                  </div>
                  <div className="responsive-grid grid grid-cols-2 gap-1 text-xs text-blue-700">
                    <span>
                      Project #:{' '}
                      <strong>{selectedEditProjectData.number}</strong>
                    </span>
                    <span>
                      Client:{' '}
                      <strong>{selectedEditClientData?.name || '-'}</strong>
                    </span>
                    <span>
                      Location: {selectedEditProjectData.location},{' '}
                      {selectedEditProjectData.city}
                    </span>
                    <span>
                      Status:{' '}
                      <span className="capitalize">
                        {selectedEditProjectData.status.replace('_', ' ')}
                      </span>
                    </span>
                  </div>
                </div>
              )}
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                  Assignment #
                </label>
                <input
                  value={editWOForm.orderNumber}
                  onChange={(e) =>
                    setEditWOForm((prev) => ({
                      ...prev,
                      orderNumber: e.target.value,
                    }))
                  }
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Automatic from Settings"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                  Assignment Type
                </label>
                <select
                  value={editWOForm.workOrderTypeId}
                  onChange={(e) =>
                    setEditWOForm((prev) => ({
                      ...prev,
                      workOrderTypeId: e.target.value,
                    }))
                  }
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">Select type...</option>
                  {activeWorkOrderTypes.map((type) => (
                    <option key={type.id} value={type.id}>
                      {type.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                  Title *
                </label>
                <input
                  value={editWOForm.title}
                  onChange={(e) =>
                    setEditWOForm((prev) => ({
                      ...prev,
                      title: e.target.value,
                    }))
                  }
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Assignment title"
                />
              </div>
              <AssignmentAddressField
                id="cal-edit-assignment-address"
                value={{
                  assignmentAddress: editWOForm.assignmentAddress,
                  latitude: editWOForm.latitude,
                  longitude: editWOForm.longitude,
                  assignmentCity: editWOForm.assignmentCity,
                  assignmentState: editWOForm.assignmentState,
                  assignmentZipCode: editWOForm.assignmentZipCode,
                  assignmentCountry: editWOForm.assignmentCountry,
                }}
                onChange={(v) =>
                  setEditWOForm((prev) => ({
                    ...prev,
                    assignmentAddress: v.assignmentAddress,
                    latitude: v.latitude,
                    longitude: v.longitude,
                    assignmentCity: v.assignmentCity,
                    assignmentState: v.assignmentState,
                    assignmentZipCode: v.assignmentZipCode,
                    assignmentCountry: v.assignmentCountry,
                  }))
                }
              />
              <div className="responsive-grid grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                    Start Date *
                  </label>
                  <input
                    type="date"
                    value={editWOForm.startDate}
                    onChange={(e) =>
                      setEditWOForm((prev) => ({
                        ...prev,
                        startDate: e.target.value,
                      }))
                    }
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                    End Date *
                  </label>
                  <input
                    type="date"
                    value={editWOForm.endDate}
                    onChange={(e) =>
                      setEditWOForm((prev) => ({
                        ...prev,
                        endDate: e.target.value,
                      }))
                    }
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                  Dispatch Note
                </label>
                <textarea
                  rows={4}
                  value={editWOForm.dispatchNote}
                  onChange={(e) =>
                    setEditWOForm((prev) => ({
                      ...prev,
                      dispatchNote: e.target.value,
                    }))
                  }
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Add the dispatch note for this assignment"
                />
              </div>
              <WorkOrderFileUploadsField
                value={editWOForm.fileUploads}
                workOrderId={editingWO.id}
                onChange={(fileUploads) =>
                  setEditWOForm((prev) => ({ ...prev, fileUploads }))
                }
              />
            </div>
            <div className="px-5 py-4 border-t border-gray-200 flex items-center justify-end gap-2 flex-shrink-0">
              <button
                type="button"
                onClick={() => setEditingWO(null)}
                className="px-4 py-2 text-sm border border-gray-200 rounded-xl text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveEditedWO}
                className="px-4 py-2 text-sm rounded-xl bg-primary text-primary-foreground hover:bg-primary/90"
              >
                Save changes
              </button>
            </div>
          </div>
        </div>
      )}

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

      <AlertDialog
        open={!!pendingDeleteShift}
        onOpenChange={(open) => !open && setPendingDeleteShift(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Shift?</AlertDialogTitle>
            <AlertDialogDescription>
              {`The shift on ${pendingDeleteShift?.label} will be permanently removed from this assignment.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={async () => {
                if (!pendingDeleteShift) return;
                await deleteShiftNow(
                  pendingDeleteShift.shiftId,
                  pendingDeleteShift.woId,
                );
                setPendingDeleteShift(null);
              }}
            >
              Delete Shift
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div></AppContextOverride>);
};

const QuickAddModal: React.FC<{
  date: string;
  woId: string;
  onAdd: (
    date: string,
    woId: string,
    payload: {
      shiftTemplateId?: string;
      shiftName: string;
      defaultRoleStartTime?: string;
      roles: Array<{
        roleName: string;
        requiredCount: number;
        startTime: string;
        requiredSkillIds?: string[];
        assignedWorkers: string[];
      }>;
      plannedEquipment?: PlannedResource[];
      plannedMaterials?: PlannedResource[];
      formTemplateIds?: string[];
    },
  ) => void;
  onClose: () => void;
}> = ({ date, woId, onAdd, onClose }) => {
  const {
    shifts: shiftCatalog,
    workerRoles,
    workers,
    materials: materialCatalog,
    settings,
    formTemplates,
    getWorkerById,
    getProjectById,
    workOrders,
    certifications,
  } = useAppContext();
  const conflictRead = useConflictAssignments();
  const conflictWorkOrders = conflictRead.data?.data ?? [];
  const { toast } = useToast();
  const wo = workOrders.find((w) => w.id === woId);
  const project = wo ? getProjectById(wo.projectId) : null;
  const activeShiftTemplates = useMemo(
    () => shiftCatalog.filter((item) => item.status === 'active'),
    [shiftCatalog],
  );
  const activeWorkerRoleNames = useMemo(
    () => assignmentRoleOptions(workerRoles),
    [workerRoles],
  );
  const [shiftTemplateId, setShiftTemplateId] = useState('');
  const [shiftName, setShiftName] = useState('');
  const [defaultRoleStartTime, setDefaultRoleStartTime] = useState('');
  const [roles, setRoles] = useState([
    {
      id: `sr_cal_modal_${Date.now()}`,
      roleName: activeWorkerRoleNames[0],
      requiredCount: 1,
      startTime: '',
      assignedWorkers: [] as string[],
      requiredCertificationIds: [] as string[],
      requiredSkillIds: [] as string[],
    },
  ]);
  const [plannedEquipment, setPlannedEquipment] = useState<PlannedResource[]>(
    [],
  );
  const [plannedMaterials, setPlannedMaterials] = useState<PlannedResource[]>(
    [],
  );
  const [workerSearch, setWorkerSearch] = useState('');
  const [formTemplateIds, setFormTemplateIds] = useState<string[]>(() =>
    getDefaultShiftFormTemplateIds(formTemplates),
  );

  const d = new Date(date + 'T12:00:00');
  const selectedTemplate = activeShiftTemplates.find(
    (item) => item.id === shiftTemplateId,
  );
  const isCancelled = isCancelledAssignment(wo);
  const applyStartTimeToRoles = (nextStartTime: string) => {
    setDefaultRoleStartTime(nextStartTime);
    setRoles((prev) =>
      prev.map((role) => ({ ...role, startTime: nextStartTime })),
    );
  };
  const roleColorClass = (roleName: string) => {
    switch (roleName) {
      case 'Foreman':
        return 'bg-purple-50 border-purple-200';
      case 'Flagger':
        return 'bg-blue-50 border-blue-200';
      case 'Traffic Controller':
        return 'bg-teal-50 border-teal-200';
      case 'Truck Driver':
        return 'bg-orange-50 border-orange-200';
      default:
        return 'bg-gray-50 border-gray-200';
    }
  };

  const addRole = () => {
    if (isCancelled) return;
    setRoles((prev) => {
      const roleName = nextUnusedRoleName(activeWorkerRoleNames, prev);
      if (!roleName) return prev;
      return [
        ...prev,
        {
          id: `sr_cal_modal_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          roleName,
          requiredCount: 1,
          startTime: defaultRoleStartTime,
          assignedWorkers: [],
          requiredCertificationIds: [],
          requiredSkillIds: [],
        },
      ];
    });
  };

  const removeRole = (idx: number) => {
    if (roles.length <= 1) return;
    setRoles((prev) => prev.filter((_, i) => i !== idx));
  };
  const roleBg = (role: string) => {
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
  const assignedWorkerIds = useMemo(
    () => new Set(roles.flatMap((r) => r.assignedWorkers)),
    [roles],
  );
  const availableWorkers = useMemo(
    () =>
      workers.filter(
        (w) =>
          w.status === 'active' &&
          !assignedWorkerIds.has(w.id) &&
          `${w.firstName} ${w.lastName} ${w.type} ${workerRoleNames(w).join(' ')}`
            .toLowerCase()
            .includes(workerSearch.toLowerCase()),
      ),
    [workers, assignedWorkerIds, workerSearch],
  );
  const handleAssignWorkerToBestRole = (workerId: string) => {
    const w = workers.find((x) => x.id === workerId);
    if (!w) return;
    const matchingRoleIdx = roles.findIndex(
      (r) =>
        workerHasAssignmentRole(w, r.roleName) &&
        r.assignedWorkers.length < r.requiredCount,
    );
    const targetIdx = matchingRoleIdx;
    if (targetIdx < 0) {
      toast({
        title: 'Role mismatch',
        description: `${w.firstName} ${w.lastName} does not have an open matching worker role for this shift.`,
        variant: 'destructive',
      });
      return;
    }
    const targetRole = roles[targetIdx];
    if (
      !workerMeetsRoleCertificationRequirements(
        w,
        getRoleRequiredCertificationIds(targetRole),
      )
    ) {
      toast({
        title: 'Certification requirements not met',
        description: `${w.firstName} ${w.lastName} does not have all required certifications for ${targetRole.roleName}.`,
        variant: 'destructive',
      });
      return;
    }
    const next = [...roles];
    if (
      !next[targetIdx].assignedWorkers.includes(workerId) &&
      next[targetIdx].assignedWorkers.length < next[targetIdx].requiredCount
    ) {
      next[targetIdx] = {
        ...next[targetIdx],
        assignedWorkers: [...next[targetIdx].assignedWorkers, workerId],
      };
      setRoles(next);
    }
  };
  const handleRemoveWorkerFromRole = (workerId: string, roleIdx: number) => {
    const next = [...roles];
    next[roleIdx] = {
      ...next[roleIdx],
      assignedWorkers: next[roleIdx].assignedWorkers.filter(
        (id) => id !== workerId,
      ),
    };
    setRoles(next);
  };
  const canAddRole = nextUnusedRoleName(activeWorkerRoleNames, roles) !== null;

  if (!conflictRead.ready) return <AssignmentReadState pending={conflictRead.isPending || conflictRead.isFetching} failed={conflictRead.isError} retry={conflictRead.refetch} />;
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-2 sm:p-4">
      <div
        className="bg-white rounded-2xl w-full max-w-2xl max-h-[90dvh] flex flex-col shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-5 border-b border-gray-100">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h2 className="text-base font-bold text-gray-800">Add Shift</h2>
              <p className="text-xs text-gray-500 mt-0.5">
                {project?.name} -{' '}
                {d.toLocaleDateString('en-US', {
                  weekday: 'long',
                  month: 'long',
                  day: 'numeric',
                })}
              </p>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 hover:bg-gray-100 rounded-lg"
            >
              <X size={16} className="text-gray-400" />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">
              Shift Name
            </label>
            <input
              value={shiftName}
              onChange={(e) => setShiftName(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="e.g., Harrison St Night Shift"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">
              Shift Type
            </label>
            <select
              value={shiftTemplateId}
              onChange={(e) => {
                const nextId = e.target.value;
                setShiftTemplateId(nextId);
                const selectedTemplate = activeShiftTemplates.find(
                  (item) => item.id === nextId,
                );
                if (selectedTemplate?.startTime) {
                  applyStartTimeToRoles(selectedTemplate.startTime);
                }
              }}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">Select shift type...</option>
              {activeShiftTemplates.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </div>
          <ShiftFormTemplatesPicker
            idAttr="calendar-quick-shift-form-templates"
            formTemplates={formTemplates}
            value={formTemplateIds}
            onChange={setFormTemplateIds}
          />
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">
                Start Time
              </label>
              <input
                type="time"
                value={defaultRoleStartTime}
                onChange={(e) => applyStartTimeToRoles(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
              <p className="mt-1 text-[11px] text-gray-500">
                Changing this updates all role start times. Each role can still
                be adjusted afterward.
              </p>
            </div>
            <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
              <div className="flex items-center gap-1 text-xs font-semibold text-gray-600">
                Shift Duration (Range)
              </div>
              <div className="mt-1 text-sm font-semibold text-gray-800">
                {getShiftTemplateRangeLabel(selectedTemplate)}
              </div>
              <p className="mt-1 text-[11px] text-gray-500">
                Range is predefined by the selected shift type and is shown for
                reference only.
              </p>
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between mb-2 flex-wrap gap-3">
              <label className="text-xs font-bold text-gray-700">Roles</label>
              <button
                type="button"
                onClick={addRole}
                disabled={isCancelled || !canAddRole}
                className="text-xs text-primary hover:text-primary/90 flex items-center gap-1 font-medium disabled:pointer-events-none disabled:text-gray-400"
              >
                <Plus size={12} /> Add Role
              </button>
            </div>
            <div className="space-y-2">
              {roles.map((role, idx) => (
                <div
                  key={role.id}
                  className={`border rounded-xl p-3 ${roleColorClass(role.roleName)}`}
                >
                  <div className="flex flex-wrap items-end gap-2">
                    <div className="min-w-0 flex-1 basis-[min(100%,12rem)]">
                      <label className="mb-0.5 block text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                        Role
                      </label>
                      <select
                        value={role.roleName}
                        onChange={(e) => {
                          const next = [...roles];
                          next[idx] = {
                            ...next[idx],
                            roleName: e.target.value,
                          };
                          setRoles(next);
                        }}
                        className="w-full text-sm border border-gray-200 rounded-lg px-2 py-1.5 bg-white"
                      >
                        {availableRoleNamesForCard(
                          activeWorkerRoleNames,
                          roles,
                          idx,
                        ).map((t) => (
                          <option key={t} value={t}>
                            {t}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="flex shrink-0 items-end gap-1 pb-0.5">
                      <span className="text-xs text-gray-500">Qty:</span>
                      <input
                        type="number"
                        min={1}
                        value={role.requiredCount}
                        onChange={(e) => {
                          const next = [...roles];
                          next[idx] = {
                            ...next[idx],
                            requiredCount: parseInt(e.target.value, 10) || 1,
                          };
                          setRoles(next);
                        }}
                        className="w-14 text-sm border border-gray-200 rounded-lg px-2 py-1.5 text-center bg-white"
                      />
                    </div>
                    <div className="w-full min-w-[7.5rem] shrink-0 sm:w-[8.75rem]">
                      <label className="mb-0.5 block text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                        Start
                      </label>
                      <input
                        type="time"
                        value={role.startTime}
                        onChange={(e) => {
                          const next = [...roles];
                          next[idx] = {
                            ...next[idx],
                            startTime: e.target.value,
                          };
                          setRoles(next);
                        }}
                        className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm bg-white"
                      />
                    </div>
                    {roles.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeRole(idx)}
                        className="ml-auto shrink-0 self-end p-1 hover:bg-red-100 rounded-lg"
                      >
                        <Trash2 size={14} className="text-red-400" />
                      </button>
                    )}
                  </div>
                  <div className="mt-2">
                    <CertificationMultiSelect
                      label="Certifications"
                      certifications={certifications}
                      selectedIds={getRoleRequiredCertificationIds(role)}
                      onChange={(ids) => {
                        const next = [...roles];
                        next[idx] = {
                          ...next[idx],
                          requiredCertificationIds: ids,
                          requiredSkillIds: [],
                        };
                        setRoles(next);
                      }}
                      placeholder="Required certifications (optional)..."
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <span className="text-xs font-bold text-gray-600">Workers</span>
              {roles.map((role, roleIdx) => (
                <div key={`w_${role.id}`} className="border rounded-lg p-2">
                  <div className="text-xs font-semibold mb-1">
                    {role.roleName} ({role.assignedWorkers.length}/
                    {role.requiredCount})
                  </div>
                  <div className="space-y-1">
                    {role.assignedWorkers.map((wid) => {
                      const w = getWorkerById(wid);
                      if (!w) return null;
                      return (
                        <div
                          key={wid}
                          className="flex items-center gap-2 text-xs"
                        >
                          <div
                            className={`w-5 h-5 rounded-full text-white flex items-center justify-center ${roleBg(w.type)}`}
                          >
                            {w.firstName[0]}
                          </div>
                          <span className="flex-1 truncate">
                            {w.firstName} {w.lastName}
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              handleRemoveWorkerFromRole(wid, roleIdx)
                            }
                            className="text-red-500"
                          >
                            x
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
              <div className="flex items-center bg-gray-100 rounded-lg px-2 py-1">
                <Search size={12} className="text-gray-400 mr-1" />
                <input
                  value={workerSearch}
                  onChange={(e) => setWorkerSearch(e.target.value)}
                  placeholder="Search workers..."
                  className="bg-transparent text-xs outline-none w-full"
                />
              </div>
              <div className="max-h-32 overflow-y-auto space-y-1">
                {availableWorkers.map((w) => {
                  const matchingRoleIdx = roles.findIndex(
                    (r) =>
                      workerHasAssignmentRole(w, r.roleName) &&
                      r.assignedWorkers.length < r.requiredCount,
                  );
                  const targetIdx = matchingRoleIdx;
                  const targetRole =
                    targetIdx >= 0 ? roles[targetIdx] : undefined;
                  const certificationsOk = targetRole
                    ? workerMeetsRoleCertificationRequirements(
                        w,
                        getRoleRequiredCertificationIds(targetRole),
                      )
                    : false;
                  const isDisabled = targetIdx < 0 || !certificationsOk;
                  const weeklyShiftCount = getWeeklyAssignedShiftCount(
                    w.id,
                    conflictWorkOrders,
                    date,
                  );
                  return (
                    <button
                      key={w.id}
                      type="button"
                      onClick={() => handleAssignWorkerToBestRole(w.id)}
                      disabled={isDisabled}
                      className={`w-full text-left text-xs border rounded px-2 py-1 ${isDisabled ? 'cursor-not-allowed border-gray-200 bg-gray-50 text-gray-400' : 'hover:bg-emerald-50'}`}
                      title={
                        targetIdx >= 0 && !certificationsOk
                          ? 'Worker is missing required certifications for the target role'
                          : undefined
                      }
                    >
                      <span className="block">
                        {w.firstName} {w.lastName} -{' '}
                        {workerRoleNames(w).join(', ') || w.type}
                        {targetIdx >= 0 && !certificationsOk ? ' (certs)' : ''}
                      </span>
                      <span className="mt-0.5 inline-block rounded bg-blue-50 px-1 text-[9px] font-medium text-blue-700">
                        {weeklyShiftCount}{' '}
                        {weeklyShiftCount === 1 ? 'shift' : 'shifts'} this week
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
          <ShiftResourcePlanner
            equipment={plannedEquipment}
            materials={plannedMaterials}
            equipmentOptions={settings.equipmentTypes || []}
            materialOptions={settings.materialTypes || []}
            materialCatalog={materialCatalog}
            onEquipmentChange={setPlannedEquipment}
            onMaterialsChange={setPlannedMaterials}
          />
        </div>
        <div className="p-5 border-t border-gray-100 flex gap-3">
          <div className="flex-1" />
          <button
            onClick={onClose}
            className="px-4 py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={() => {
              if (
                !shiftTemplateId ||
                !defaultRoleStartTime ||
                roles.some((role) => !role.startTime)
              ) {
                toast({
                  title: 'Missing shift schedule',
                  description:
                    'Select a shift type and enter a start time before creating the shift.',
                  variant: 'destructive',
                });
                return;
              }
              const duplicates = duplicateRoleNames(roles);
              if (duplicates.length > 0) {
                toast({
                  title: 'Duplicate roles',
                  description: `Each role can be added only once. Remove the duplicate: ${duplicates.join(', ')}.`,
                  variant: 'destructive',
                });
                return;
              }
              onAdd(date, woId, {
                shiftName: shiftName.trim(),
                shiftTemplateId: shiftTemplateId || undefined,
                defaultRoleStartTime,
                plannedEquipment,
                plannedMaterials,
                formTemplateIds,
                roles: roles.map((role) => ({
                  roleName: role.roleName,
                  requiredCount: role.requiredCount,
                  startTime: role.startTime,
                  requiredCertificationIds: [
                    ...getRoleRequiredCertificationIds(role),
                  ],
                  requiredSkillIds: [],
                  assignedWorkers: role.assignedWorkers,
                })),
              });
            }}
            disabled={isCancelled}
            className="px-4 py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-semibold hover:bg-primary/90 flex items-center justify-center gap-1.5 shadow-sm disabled:pointer-events-none disabled:opacity-50"
          >
            <Plus size={14} /> Add Shift
          </button>
        </div>
      </div>
    </div>
  );
};

const EditShiftModal: React.FC<{
  shift: Shift;
  woId: string;
  effectiveStatus?: import('./shiftConfirmation').EffectiveShiftStatus;
  isLocked: boolean;
  onClose: () => void;
  onDelete: (shiftId: string, woId: string) => void;
  onDuplicate: (shift: Shift, woId: string) => void;
  onCancelled?: () => void;
}> = ({
  shift,
  woId,
  effectiveStatus,
  isLocked,
  onClose,
  onDelete,
  onDuplicate,
  onCancelled,
}) => {
  const {
    workOrders,
    workers,
    workerRoles,
    shifts: shiftCatalog,
    certifications,
    materials: materialCatalog,
    settings,
    formTemplates,
    updateWorkOrder,
    getProjectById,
    getWorkerById,
    availabilityRequests,
  } = useAppContext();
  const { user } = useAuth();
  const conflictRead = useConflictAssignments();
  const conflictWorkOrders = conflictRead.data?.data ?? [];
  const { toast } = useToast();
  const wo = workOrders.find((w) => w.id === woId);
  const project = wo ? getProjectById(wo.projectId) : null;
  const activeShiftTemplates = useMemo(
    () => shiftCatalog.filter((item) => item.status === 'active'),
    [shiftCatalog],
  );
  const activeWorkerRoleNames = useMemo(
    () => assignmentRoleOptions(workerRoles),
    [workerRoles],
  );

  const [roles, setRoles] = useState(
    shift.roles.map((r) => ({
      ...r,
      startTime: r.startTime || shift.defaultRoleStartTime || shift.startTime,
      assignedWorkers: [...r.assignedWorkers],
      requiredCertificationIds: [...getRoleRequiredCertificationIds(r)],
      requiredSkillIds: [...(r.requiredSkillIds || [])],
    })),
  );
  const [plannedEquipment, setPlannedEquipment] = useState<PlannedResource[]>(
    () => [...(shift.plannedEquipment || [])],
  );
  const [plannedMaterials, setPlannedMaterials] = useState<PlannedResource[]>(
    () => [...(shift.plannedMaterials || [])],
  );
  const [workOrderTypes] = useState<string[]>(() => [
    ...(shift.workOrderTypes || []),
  ]);
  const [bulkConfirmation, setBulkConfirmation] = useState<{
    conflicts: BulkShiftConflict[];
    shiftCount: number;
    resolve: (confirmed: boolean) => void;
  } | null>(null);
  const [bulkSaving, setBulkSaving] = useState(false);
  const bulkInFlight = useRef(false);
  const [workOrderAuthorizedWorkerIds, setWorkOrderAuthorizedWorkerIds] =
    useState<string[]>(() => [...(shift.workOrderAuthorizedWorkerIds || [])]);
  const [workerSearch, setWorkerSearch] = useState('');
  const [workerRoleFilterId, setWorkerRoleFilterId] = useState<string | null>(
    null,
  );
  const [activeTab, setActiveTab] = useState<
    'overview' | 'details' | 'workers' | 'equipment'
  >('overview');
  const [shiftStatus, setShiftStatus] = useState(
    shift.cancelled ? 'shift_cancelled' : shift.status || '',
  );
  const [createdByUserId, setCreatedByUserId] = useState(
    shift.createdByUserId || '',
  );
  const [shiftAddress, setShiftAddress] = useState(shift.address || '');
  const [crossStreetLocationDetail, setCrossStreetLocationDetail] = useState(
    shift.crossStreetLocationDetail || '',
  );
  const [shiftRequesterName, setShiftRequesterName] = useState(
    shift.requesterName || wo?.requesterName || '',
  );
  const [shiftRequesterPhone, setShiftRequesterPhone] = useState(
    shift.requesterPhone || '',
  );
  const [shiftRequesterEmail, setShiftRequesterEmail] = useState(
    shift.requesterEmail || '',
  );
  const [visibleDocumentTypes, setVisibleDocumentTypes] = useState<string[]>(
    shift.visibleDocumentTypes || [],
  );
  const [formTemplateIds, setFormTemplateIds] = useState<string[]>(
    () =>
      shift.formTemplateIds ?? getDefaultShiftFormTemplateIds(formTemplates),
  );
  const [shiftNotes, setShiftNotes] = useState(shift.notes || '');
  const [shiftAddressValue, setShiftAddressValue] = useState(() => ({
    ...emptyShiftAddress(shift.address || ''),
    latitude: shift.addressLatitude ?? null,
    longitude: shift.addressLongitude ?? null,
    assignmentCity: shift.addressCity || '',
    assignmentState: shift.addressState || '',
    assignmentZipCode: shift.addressZipCode || '',
    assignmentCountry: shift.addressCountry || DEFAULT_ASSIGNMENT_COUNTRY,
  }));
  const [shiftTemplateId, setShiftTemplateId] = useState(
    shift.shiftTemplateId || '',
  );
  const [shiftName, setShiftName] = useState(shift.shiftName || '');
  const [shiftDate, setShiftDate] = useState(shift.date);
  const [defaultRoleStartTime, setDefaultRoleStartTime] = useState(
    shift.defaultRoleStartTime || shift.startTime,
  );
  const [draggingWorkerId, setDraggingWorkerId] = useState<string | null>(null);
  const isNewShiftDraft = shift.id.startsWith('draft_new_');
  const today = getLocalDateString();
  const [repeatForWeek, setRepeatForWeek] = useState(false);
  const [repeatDays, setRepeatDays] = useState<Record<number, boolean>>({});
  if (!wo) return null;
  const d = new Date(shiftDate + 'T12:00:00');
  const selectedTemplate = activeShiftTemplates.find(
    (item) => item.id === shiftTemplateId,
  );
  const applyStartTimeToRoles = (nextStartTime: string) => {
    setDefaultRoleStartTime(nextStartTime);
    setRoles((prev) =>
      prev.map((role) => ({ ...role, startTime: nextStartTime })),
    );
  };

  const totalA = roles.reduce((a, r) => a + r.assignedWorkers.length, 0);
  const totalR = roles.reduce((a, r) => a + r.requiredCount, 0);

  const assignedWorkerIds = new Set(roles.flatMap((r) => r.assignedWorkers));
  const canDelegateWorkOrderAccess =
    user?.role === 'admin' || user?.roles?.includes('admin');
  const toggleWorkOrderAccess = (workerId: string) => {
    if (!canDelegateWorkOrderAccess || isLocked) return;
    setWorkOrderAuthorizedWorkerIds((current) =>
      current.includes(workerId)
        ? current.filter((id) => id !== workerId)
        : [...current, workerId],
    );
  };
  const workerRoleFilter = workerRoleFilterId
    ? (roles.find((role) => role.id === workerRoleFilterId) ?? null)
    : null;
  const availableWorkers = workers.filter(
    (w) =>
      w.status === 'active' &&
      !assignedWorkerIds.has(w.id) &&
      (!workerRoleFilter ||
        workerHasAssignmentRole(w, workerRoleFilter.roleName)) &&
      (
        w.firstName +
        ' ' +
        w.lastName +
        ' ' +
        w.type +
        ' ' +
        workerRoleNames(w).join(' ')
      )
        .toLowerCase()
        .includes(workerSearch.toLowerCase()),
  );

  const getWorkerConflict = (wid: string, roleIdx: number): string | null => {
    const roleStart = roles[roleIdx]?.startTime || shift.startTime;
    const roleEnd = addMinutesToTime(
      roleStart,
      getShiftTemplateDurationMinutes(selectedTemplate),
    );
    for (const otherWo of conflictWorkOrders) {
      if (isCancelledAssignment(otherWo)) continue;
      for (const s of otherWo.shifts) {
        if (s.id === shift.id || s.date !== shiftDate) continue;
        if (s.startTime < roleEnd && s.endTime > roleStart) {
          for (const r of s.roles) {
            if (r.assignedWorkers.includes(wid)) {
              const p = getProjectById(otherWo.projectId);
              return `${p?.name || otherWo.title} (${s.startTime}-${s.endTime})`;
            }
          }
        }
      }
    }
    return null;
  };

  const handleAssignWorker = (wid: string, roleIdx: number) => {
    if (isLocked) return;
    const role = roles[roleIdx];
    if (!role) return;
    if (role.assignedWorkers.includes(wid)) return;
    if (role.assignedWorkers.length >= role.requiredCount) {
      toast({
        title: 'Role Full',
        description: `${role.roleName} already has the required number of workers.`,
        variant: 'destructive',
      });
      return;
    }
    const w = getWorkerById(wid);
    if (!w) {
      toast({
        title: 'Worker not found',
        description: 'Could not load this worker profile.',
        variant: 'destructive',
      });
      return;
    }
    if (!workerHasAssignmentRole(w, role.roleName)) {
      toast({
        title: 'Role mismatch',
        description: `${w.firstName} ${w.lastName} does not have the ${role.roleName} worker role.`,
        variant: 'destructive',
      });
      return;
    }
    if (
      !workerMeetsRoleCertificationRequirements(
        w,
        getRoleRequiredCertificationIds(role),
      )
    ) {
      toast({
        title: 'Certification requirements not met',
        description: `${w.firstName} ${w.lastName} does not have all required certifications for ${role.roleName}.`,
        variant: 'destructive',
      });
      return;
    }
    const next = [...roles];
    next[roleIdx] = {
      ...next[roleIdx],
      assignedWorkers: [...next[roleIdx].assignedWorkers, wid],
    };
    setRoles(next);
  };

  const handleRemoveWorker = (wid: string, roleIdx: number) => {
    if (isLocked) return;
    const next = [...roles];
    next[roleIdx] = {
      ...next[roleIdx],
      assignedWorkers: next[roleIdx].assignedWorkers.filter((w) => w !== wid),
    };
    setRoles(next);
  };

  const handleWorkerDropToRole = (
    roleIdx: number,
    e: React.DragEvent<HTMLDivElement>,
  ) => {
    e.preventDefault();
    const workerId = e.dataTransfer.getData('text/plain');
    if (!workerId) return;
    handleAssignWorker(workerId, roleIdx);
    setDraggingWorkerId(null);
  };

  const handleRoleListDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    if (isLocked) return;
    e.preventDefault();

    const roleList = e.currentTarget;
    const bounds = roleList.getBoundingClientRect();
    const edgeSize = 48;
    const scrollStep = 14;

    if (e.clientY < bounds.top + edgeSize) {
      roleList.scrollTop -= scrollStep;
    } else if (e.clientY > bounds.bottom - edgeSize) {
      roleList.scrollTop += scrollStep;
    }
  };

  const addRole = () => {
    if (isLocked) return;
    setRoles((prev) => {
      const roleName = nextUnusedRoleName(activeWorkerRoleNames, prev);
      if (!roleName) return prev;
      return [
        ...prev,
        {
          id: `sr_new_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          roleName,
          requiredCount: 1,
          startTime: defaultRoleStartTime,
          assignedWorkers: [],
          requiredCertificationIds: [],
          requiredSkillIds: [],
        },
      ];
    });
  };

  const removeRole = (idx: number) => {
    if (isLocked) return;
    if (roles.length <= 1) return;
    setRoles((prev) => prev.filter((_, i) => i !== idx));
  };
  const canAddRole = nextUnusedRoleName(activeWorkerRoleNames, roles) !== null;

  const handleSave = async () => {
    if (isLocked) return;
    const saveDate = getLocalDateString();
    if (isNewShiftDraft && shiftDate < saveDate) {
      toast({
        title: 'Date Locked',
        description: 'Cannot create shifts on past dates.',
        variant: 'destructive',
      });
      return;
    }
    if (
      !shiftTemplateId ||
      !defaultRoleStartTime ||
      roles.some((role) => !role.startTime)
    ) {
      setActiveTab('details');
      toast({
        title: 'Missing shift schedule',
        description:
          'Select a shift type and enter a start time before saving the shift.',
        variant: 'destructive',
      });
      return;
    }
    const duplicates = duplicateRoleNames(roles);
    if (duplicates.length > 0) {
      toast({
        title: 'Duplicate roles',
        description: `Each role can be added only once. Remove the duplicate: ${duplicates.join(', ')}.`,
        variant: 'destructive',
      });
      return;
    }
    if (isCancelledAssignment(wo)) {
      toast({
        title: 'Assignment cancelled',
        description:
          'Only a cancelled shift may remain editable; shifts inside a cancelled assignment cannot be modified.',
        variant: 'destructive',
      });
      return;
    }
    const wantsCancellation = shiftStatus === 'shift_cancelled';
    const isNewCancellation =
      wantsCancellation && !isNewShiftDraft && !shift.cancelled;
    if (wantsCancellation && isNewShiftDraft) {
      toast({
        title: 'Create the shift first',
        description: 'A new shift cannot be created as cancelled.',
        variant: 'destructive',
      });
      return;
    }
    const currentEffectiveStatus =
      effectiveStatus ?? getEffectiveShiftStatus(shift);
    if (isNewCancellation && !canCancelShiftStatus(currentEffectiveStatus)) {
      toast({
        title: 'Shift cannot be cancelled yet',
        description:
          'Shift Cancelled is available only in Awaiting Response or Workers Confirmed.',
        variant: 'destructive',
      });
      return;
    }
    if (
      isNewCancellation &&
      !window.confirm('Cancel this shift and notify every assigned worker?')
    )
      return;

    const requesterEmail = shiftRequesterEmail.trim();
    if (requesterEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(requesterEmail)) {
      toast({
        title: 'Invalid requester email',
        description: 'Enter a valid email address or leave the field empty.',
        variant: 'destructive',
      });
      return;
    }
    const originalWorkerIds = new Set(
      shift.roles.flatMap((role) => role.assignedWorkers),
    );
    const normalizedRoles = roles.map((r) => ({
      id: r.id,
      roleName: r.roleName,
      requiredCount: r.requiredCount,
      startTime: r.startTime,
      requiredCertificationIds: [...getRoleRequiredCertificationIds(r)],
      requiredSkillIds: [...(r.requiredSkillIds || [])],
      assignedWorkers: [...r.assignedWorkers],
    }));
    const normalizedAssignedWorkerIds = new Set(
      normalizedRoles.flatMap((role) => role.assignedWorkers),
    );
    const normalizedWorkOrderAuthorizedWorkerIds = Array.from(
      new Set(
        workOrderAuthorizedWorkerIds.filter((workerId) =>
          normalizedAssignedWorkerIds.has(workerId),
        ),
      ),
    );
    const validPlannedEquipment = plannedEquipment
      .filter((item) => item.type.trim())
      .map((item) => ({ ...item, type: item.type.trim() }));
    const validPlannedMaterials = plannedMaterials
      .filter((item) => item.type.trim())
      .map((item) => ({ ...item, type: item.type.trim() }));
    const overviewFields = {
      status: wantsCancellation
        ? shift.status
        : shift.cancelled && !shiftStatus
          ? shift.status
          : shiftStatus,
      createdByUserId: createdByUserId || undefined,
      requesterUserId: null,
      address: shiftAddressValue.assignmentAddress || undefined,
      crossStreetLocationDetail: crossStreetLocationDetail || undefined,
      addressLatitude: shiftAddressValue.latitude,
      addressLongitude: shiftAddressValue.longitude,
      addressCity: shiftAddressValue.assignmentCity,
      addressState: shiftAddressValue.assignmentState,
      addressZipCode: shiftAddressValue.assignmentZipCode,
      addressCountry: shiftAddressValue.assignmentCountry,
      requesterName: shiftRequesterName || undefined,
      requesterPhone: shiftRequesterPhone.trim() || undefined,
      requesterEmail: requesterEmail.toLowerCase() || undefined,
      visibleDocumentTypes,
      formTemplateIds,
      workOrderTypes,
      notes: shiftNotes || undefined,
      plannedEquipment: validPlannedEquipment,
      plannedMaterials: validPlannedMaterials,
      workOrderAuthorizedWorkerIds: normalizedWorkOrderAuthorizedWorkerIds,
    };
    const roleStartTimes = roles
      .map((r) => r.startTime || shift.startTime)
      .sort();
    const nextStartTime = roleStartTimes[0] || shift.startTime;
    const nextEndTime = addMinutesToTime(
      nextStartTime,
      getShiftTemplateDurationMinutes(selectedTemplate),
    );

    let datesToCreate: string[] = [shiftDate];
    if (isNewShiftDraft && repeatForWeek) {
      const week = getWeekDates(shiftDate);
      const extras = week
        .filter(
          ({ date, dayOfWeek }) =>
            date >= saveDate && date !== shiftDate && repeatDays[dayOfWeek],
        )
        .map(({ date }) => date);
      datesToCreate = Array.from(new Set([...datesToCreate, ...extras]));
    }

    const validDates = datesToCreate.filter((d) =>
      isShiftDateWithinAssignmentRange(d, wo),
    );
    const outOfRangeDates = datesToCreate.filter(
      (d) => !isShiftDateWithinAssignmentRange(d, wo),
    );

    if (validDates.length === 0) {
      toast({
        title: 'Outside assignment dates',
        description: workOrderHasAssignmentDateRange(wo)
          ? `Shifts must be between ${assignmentDateRangeLabel(wo)}.`
          : 'Invalid assignment dates.',
        variant: 'destructive',
      });
      return;
    }

    const useBulk = isNewShiftDraft && repeatForWeek && validDates.length > 1;

    if (useBulk) {
      if (bulkInFlight.current) return;
      bulkInFlight.current = true;
      const conflicts = findBulkShiftWorkerConflicts(
        validDates.map((date) => ({
          id: `bulk-preview-${date}`,
          date,
          startTime: nextStartTime,
          endTime: nextEndTime,
          roles: normalizedRoles,
        })),
        isCancelledAssignment(wo) ? [] : wo.shifts,
      );
      if (conflicts.length > 0) {
        const details = conflicts.map((conflict) => {
          const worker = getWorkerById(conflict.workerId);
          const name = worker
            ? `${worker.firstName} ${worker.lastName}`
            : conflict.workerId;
          return { ...conflict, workerName: name };
        });
        const confirmed = await new Promise<boolean>((resolve) => {
          setBulkConfirmation({
            conflicts: details,
            shiftCount: validDates.length,
            resolve,
          });
        });
        setBulkConfirmation(null);
        if (!confirmed) {
          bulkInFlight.current = false;
          return;
        }
      }
      setBulkSaving(true);
      void dbBulkCreateShifts(woId, {
        shiftName: shiftName.trim(),
        baseDate: shiftDate,
        dates: validDates,
        startTime: nextStartTime,
        endTime: nextEndTime,
        status: shiftStatus,
        createdByUserId: createdByUserId || undefined,
        requesterUserId: null,
        address: shiftAddress || undefined,
        crossStreetLocationDetail: crossStreetLocationDetail || undefined,
        addressLatitude: shiftAddressValue.latitude,
        addressLongitude: shiftAddressValue.longitude,
        addressCity: shiftAddressValue.assignmentCity,
        addressState: shiftAddressValue.assignmentState,
        addressZipCode: shiftAddressValue.assignmentZipCode,
        addressCountry: shiftAddressValue.assignmentCountry,
        requesterName: shiftRequesterName || undefined,
        requesterPhone: shiftRequesterPhone.trim() || undefined,
        requesterEmail: requesterEmail.toLowerCase() || undefined,
        visibleDocumentTypes,
        formTemplateIds,
        notes: shiftNotes || undefined,
        plannedEquipment: validPlannedEquipment,
        plannedMaterials: validPlannedMaterials,
        workOrderTypes,
        workOrderAuthorizedWorkerIds: normalizedWorkOrderAuthorizedWorkerIds,
        shiftTemplateId: shiftTemplateId || undefined,
        defaultRoleStartTime: defaultRoleStartTime || nextStartTime,
        roles: normalizedRoles,
        skipDuplicates: false,
      })
        .then((result) => {
          const createdCount = result?.created?.length ?? 0;
          const skippedCount = result?.skipped?.length ?? 0;
          const summary =
            outOfRangeDates.length > 0
              ? ` (${outOfRangeDates.length} skipped: outside range)`
              : '';
          toast({
            title: `${createdCount} shifts created${summary}`,
            description:
              skippedCount > 0
                ? `${skippedCount} day(s) skipped (already have a shift).`
                : undefined,
          });
          onClose();
        })
        .catch((error) => {
          toast({
            title: 'Could not create shifts',
            description:
              error instanceof Error
                ? error.message
                : 'Please review the data.',
            variant: 'destructive',
          });
        })
        .finally(() => {
          bulkInFlight.current = false;
          setBulkSaving(false);
        });
      return;
    }

    let found = false;
    const updatedShifts = wo.shifts.map((s) => {
      if (s.id !== shift.id) return s;
      found = true;
      return reactivateCancelledShiftWithManualStatus(
        s,
        {
          ...s,
          ...overviewFields,
          date: shiftDate,
          shiftName: shiftName.trim(),
          shiftTemplateId: shiftTemplateId || undefined,
          defaultRoleStartTime,
          startTime: nextStartTime,
          endTime: nextEndTime,
          roles: normalizedRoles.map((r) => ({
            ...r,
            id:
              r.id &&
              !r.id.startsWith('sr_new_') &&
              !r.id.startsWith('sr_cal_modal_')
                ? r.id
                : `sr_${s.id}_${Date.now()}_${r.roleName}`,
          })),
        },
        shiftStatus,
      );
    });
    const nextShift: Shift = found
      ? reactivateCancelledShiftWithManualStatus(
          shift,
          {
            ...shift,
            ...overviewFields,
            date: shiftDate,
            shiftName: shiftName.trim(),
            shiftTemplateId: shiftTemplateId || undefined,
            defaultRoleStartTime,
            startTime: nextStartTime,
            endTime: nextEndTime,
            roles: normalizedRoles.map((r) => ({
              ...r,
              id:
                r.id &&
                !r.id.startsWith('sr_new_') &&
                !r.id.startsWith('sr_cal_modal_')
                  ? r.id
                  : `sr_${shift.id}_${Date.now()}_${r.roleName}`,
            })),
          },
          shiftStatus,
        )
      : {
          id: `s_cal_${Date.now()}`,
          ...overviewFields,
          workOrderId: woId,
          shiftName: shiftName.trim(),
          date: shiftDate,
          shiftTemplateId: shiftTemplateId || undefined,
          defaultRoleStartTime,
          startTime: nextStartTime,
          endTime: nextEndTime,
          roles: normalizedRoles.map((r, roleIndex) => ({
            ...r,
            id: `sr_${Date.now()}_${roleIndex}_${Math.random().toString(36).slice(2, 6)}`,
          })),
        };
    const shiftsToPersist = found ? updatedShifts : [...wo.shifts, nextShift];
    try {
      await updateWorkOrder(woId, { shifts: shiftsToPersist }, [nextShift.id]);
      if (isNewCancellation) {
        await cancelShift({ workOrderId: woId, shiftId: shift.id });
      }
    } catch (error) {
      if (isNewCancellation) {
        toast({
          title: 'Unable to cancel shift',
          description:
            error instanceof Error ? error.message : 'Please try again.',
          variant: 'destructive',
        });
      } else {
        const feedback = workOrderUpdateErrorFeedback(error);
        toast({ ...feedback, variant: 'destructive' });
      }
      return;
    }
    if (found) {
      const remainingWorkerIds = new Set(
        normalizedRoles.flatMap((role) => role.assignedWorkers),
      );
      const removedWorkerIds = [...originalWorkerIds].filter(
        (workerId) => !remainingWorkerIds.has(workerId),
      );
      await Promise.allSettled(
        removedWorkerIds.map(async (workerId) => {
          const worker = getWorkerById(workerId);
          if (!worker) return;
          await sendNotificationAction({
            action: 'send_in_app',
            email: worker.email,
            workerName: `${worker.firstName} ${worker.lastName}`,
            message: `Hi ${worker.firstName}, you have been removed from the shift at ${project?.name || wo.title} on ${shiftDate} (${nextStartTime}-${nextEndTime}). Please contact dispatch with any questions.`,
          });
        }),
      );
    }
    if (isNewCancellation) {
      toast({
        title: 'Shift Cancelled',
        description: 'Assigned workers were notified automatically.',
      });
      onCancelled?.();
    } else if (outOfRangeDates.length > 0) {
      toast({
        title: found ? 'Shift Updated' : 'Shift Created',
        description: `${outOfRangeDates.length} day(s) skipped (outside assignment range).`,
      });
    } else {
      toast({ title: found ? 'Shift Updated' : 'Shift Created' });
    }
    onClose();
  };

  const roleColorClass = (role: string) => {
    switch (role) {
      case 'Foreman':
        return 'bg-purple-100 text-purple-700 border-purple-200';
      case 'Flagger':
        return 'bg-blue-100 text-blue-700 border-blue-200';
      case 'Traffic Controller':
        return 'bg-teal-100 text-teal-700 border-teal-200';
      case 'Truck Driver':
        return 'bg-orange-100 text-orange-700 border-orange-200';
      default:
        return 'bg-gray-100 text-gray-700 border-gray-200';
    }
  };

  const roleBg = (role: string) => {
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

  if (!conflictRead.ready) return <AssignmentReadState pending={conflictRead.isPending || conflictRead.isFetching} failed={conflictRead.isError} retry={conflictRead.refetch} />;
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-2 sm:p-4">
      {bulkConfirmation && (
        <BulkShiftConflictDialog
          conflicts={bulkConfirmation.conflicts}
          shiftCount={bulkConfirmation.shiftCount}
          onConfirm={() => bulkConfirmation.resolve(true)}
          onCancel={() => bulkConfirmation.resolve(false)}
        />
      )}
      <div
        className={`bg-white rounded-2xl w-full ${activeTab === 'workers' ? 'max-w-5xl' : 'max-w-2xl'} max-h-[90dvh] flex flex-col overflow-hidden shadow-2xl transition-[max-width]`}
        onClick={(e) => e.stopPropagation()}
      >
        {}
        <div className="p-5 border-b border-gray-100 flex-shrink-0">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h2 className="text-base font-bold text-gray-800">
                {isNewShiftDraft ? 'New Shift' : 'Edit Shift'}
              </h2>
              <p className="text-xs text-gray-500 mt-0.5">
                {project?.name} -{' '}
                {d.toLocaleDateString('en-US', {
                  weekday: 'long',
                  month: 'long',
                  day: 'numeric',
                })}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span
                className={`text-sm font-bold ${totalA >= totalR ? 'text-emerald-600' : 'text-orange-600'}`}
              >
                {totalA}/{totalR} workers
              </span>
              <button
                onClick={onClose}
                className="p-1.5 hover:bg-gray-100 rounded-lg"
              >
                <X size={16} className="text-gray-400" />
              </button>
            </div>
          </div>
          {}
          <div className="flex gap-1 mt-3 bg-gray-100 rounded-lg p-0.5">
            {[
              { key: 'overview' as const, label: 'Overview' },
              { key: 'details' as const, label: 'Details & Roles' },
              { key: 'workers' as const, label: `Workers (${totalA})` },
              { key: 'equipment' as const, label: 'Equipment & Materials' },
            ].map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-all ${activeTab === tab.key ? 'bg-white shadow-sm text-primary' : 'text-gray-500 hover:text-gray-700'}`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {}
        <div
          className={`flex-1 overflow-y-auto ${activeTab === 'overview' ? '' : 'p-5'}`}
        >
          {activeTab === 'overview' && (
            <div>
              <div className="grid gap-4 px-5 pt-5 sm:grid-cols-[minmax(0,1fr)_11rem]">
                <label className="block">
                  <span className="mb-1.5 block text-xs font-semibold text-gray-600">
                    Shift Name
                  </span>
                  <input
                    value={shiftName}
                    disabled={isLocked}
                    onChange={(e) => setShiftName(e.target.value)}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm disabled:bg-gray-100"
                    placeholder="e.g., Harrison St Night Shift"
                  />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-xs font-semibold text-gray-600">
                    Shift Date
                  </span>
                  <input
                    type="date"
                    value={shiftDate}
                    min={wo.startDate || undefined}
                    max={wo.endDate || undefined}
                    disabled={isLocked}
                    onChange={(e) => setShiftDate(e.target.value)}
                    className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm disabled:cursor-not-allowed disabled:bg-gray-100"
                  />
                </label>
              </div>
              <ShiftOverviewTab
                formsSelection={
                  <ShiftFormTemplatesPicker
                    idAttr="calendar-edit-shift-form-templates"
                    formTemplates={formTemplates}
                    value={formTemplateIds}
                    onChange={setFormTemplateIds}
                    disabled={isLocked}
                  />
                }
                disabled={isLocked}
                includeCancelled={!isNewShiftDraft}
                availableDocuments={[
                  ...(wo.fileUploads || []),
                  ...(wo.attachments || []),
                ]}
                value={{
                  status: shiftStatus,
                  createdByUserId,
                  requesterName: shiftRequesterName,
                  requesterPhone: shiftRequesterPhone,
                  requesterEmail: shiftRequesterEmail,
                  address: shiftAddressValue,
                  crossStreetLocationDetail,
                  visibleDocumentTypes,
                  notes: shiftNotes,
                }}
                onChange={(v) => {
                  if (isLocked) return;
                  setShiftStatus(v.status);
                  setCreatedByUserId(v.createdByUserId);
                  setShiftRequesterName(v.requesterName);
                  setShiftRequesterPhone(v.requesterPhone);
                  setShiftRequesterEmail(v.requesterEmail);
                  setShiftAddressValue(v.address);
                  setShiftAddress(v.address.assignmentAddress);
                  setCrossStreetLocationDetail(v.crossStreetLocationDetail);
                  setVisibleDocumentTypes(v.visibleDocumentTypes);
                  setShiftNotes(v.notes);
                }}
              />
            </div>
          )}
          {activeTab === 'details' && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                  Shift Type
                </label>
                <select
                  value={shiftTemplateId}
                  disabled={isLocked}
                  onChange={(e) => {
                    const nextId = e.target.value;
                    setShiftTemplateId(nextId);
                    const selectedTemplate = activeShiftTemplates.find(
                      (item) => item.id === nextId,
                    );
                    if (selectedTemplate?.startTime) {
                      applyStartTimeToRoles(selectedTemplate.startTime);
                    }
                  }}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-500"
                >
                  <option value="">Select shift type...</option>
                  {activeShiftTemplates.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                    Start Time
                  </label>
                  <input
                    type="time"
                    value={defaultRoleStartTime}
                    disabled={isLocked}
                    onChange={(e) => applyStartTimeToRoles(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-500"
                  />
                  <p className="mt-1 text-[11px] text-gray-500">
                    Changing this updates all role start times. Each role can
                    still be adjusted afterward.
                  </p>
                </div>
                <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
                  <div className="flex items-center gap-1 text-xs font-semibold text-gray-600">
                    Shift Duration (Range)
                  </div>
                  <div className="mt-1 text-sm font-semibold text-gray-800">
                    {getShiftTemplateRangeLabel(selectedTemplate)}
                  </div>
                  <p className="mt-1 text-[11px] text-gray-500">
                    Range is predefined by the selected shift type and is shown
                    for reference only.
                  </p>
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between mb-2 flex-wrap gap-3">
                  <label className="text-xs font-bold text-gray-700">
                    Roles
                  </label>
                  {!isLocked && (
                    <button
                      onClick={addRole}
                      disabled={!canAddRole}
                      className="text-xs text-primary hover:text-primary/90 flex items-center gap-1 font-medium disabled:pointer-events-none disabled:text-gray-400"
                    >
                      <Plus size={12} /> Add Role
                    </button>
                  )}
                </div>
                <div className="space-y-2">
                  {roles.map((role, idx) => (
                    <div
                      key={role.id}
                      className={`border rounded-xl p-3 ${roleColorClass(role.roleName)}`}
                    >
                      <div className="flex flex-wrap items-end gap-2">
                        <div className="min-w-0 flex-1 basis-[min(100%,12rem)]">
                          <label className="mb-0.5 block text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                            Role
                          </label>
                          <select
                            value={role.roleName}
                            disabled={isLocked}
                            onChange={(e) => {
                              const n = [...roles];
                              n[idx] = { ...n[idx], roleName: e.target.value };
                              setRoles(n);
                            }}
                            className="w-full text-sm border border-gray-200 rounded-lg px-2 py-1.5 bg-white disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-500"
                          >
                            {availableRoleNamesForCard(
                              activeWorkerRoleNames,
                              roles,
                              idx,
                            ).map((t) => (
                              <option key={t} value={t}>
                                {t}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="flex shrink-0 items-end gap-1 pb-0.5">
                          <span className="text-xs text-gray-500">Qty:</span>
                          <input
                            type="number"
                            min={1}
                            value={role.requiredCount}
                            disabled={isLocked}
                            onChange={(e) => {
                              const n = [...roles];
                              n[idx] = {
                                ...n[idx],
                                requiredCount: parseInt(e.target.value) || 1,
                              };
                              setRoles(n);
                            }}
                            className="w-14 text-sm border border-gray-200 rounded-lg px-2 py-1.5 text-center bg-white disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-500"
                          />
                        </div>
                        <div className="w-full min-w-[7.5rem] shrink-0 sm:w-[8.75rem]">
                          <label className="mb-0.5 block text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                            Start
                          </label>
                          <input
                            type="time"
                            value={role.startTime}
                            disabled={isLocked}
                            onChange={(e) => {
                              const n = [...roles];
                              n[idx] = { ...n[idx], startTime: e.target.value };
                              setRoles(n);
                            }}
                            className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm bg-white disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-500"
                          />
                        </div>
                        {!isLocked && roles.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeRole(idx)}
                            className="ml-auto shrink-0 self-end p-1 hover:bg-red-100 rounded-lg"
                          >
                            <Trash2 size={14} className="text-red-400" />
                          </button>
                        )}
                      </div>
                      <div
                        className={`mt-2 ${isLocked ? 'pointer-events-none opacity-60' : ''}`}
                      >
                        <CertificationMultiSelect
                          label="Certifications"
                          certifications={certifications}
                          selectedIds={getRoleRequiredCertificationIds(role)}
                          onChange={(ids) => {
                            if (isLocked) return;
                            const n = [...roles];
                            n[idx] = {
                              ...n[idx],
                              requiredCertificationIds: ids,
                              requiredSkillIds: [],
                            };
                            setRoles(n);
                          }}
                          placeholder="Required certifications (optional)..."
                        />
                      </div>
                      <div className="flex items-center gap-2 mt-2 text-xs text-gray-600">
                        <Users size={12} /> {role.assignedWorkers.length}{' '}
                        workers
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'equipment' && (
            <ShiftResourcePlanner
              equipment={plannedEquipment}
              materials={plannedMaterials}
              equipmentOptions={settings.equipmentTypes || []}
              materialOptions={settings.materialTypes || []}
              materialCatalog={materialCatalog}
              disabled={isLocked}
              onEquipmentChange={setPlannedEquipment}
              onMaterialsChange={setPlannedMaterials}
            />
          )}

          {activeTab === 'workers' && (
            <div className="space-y-4">
              <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800">
                {canDelegateWorkOrderAccess
                  ? 'WO access is optional. Select only the assigned workers who may save, submit, and edit the Work Order Form for this shift.'
                  : 'Workers marked with WO access may save, submit, and edit the Work Order Form only for this shift. Only an admin can change this permission.'}
              </div>
              <div className="grid min-h-0 gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(18rem,2fr)]">
                {}
                <section className="min-w-0 overflow-hidden rounded-xl border border-gray-200 bg-gray-50/40">
                  <div className="border-b border-gray-200 bg-white px-3 py-2">
                    <p className="text-xs font-bold text-gray-700">
                      Assigned workers by role
                    </p>
                    <p className="mt-0.5 text-[11px] text-gray-500">
                      Drag a worker from the right and drop it on the required
                      role.
                    </p>
                  </div>
                  <div
                    onDragOver={handleRoleListDragOver}
                    className="max-h-[52vh] space-y-3 overflow-y-auto p-3"
                  >
                    {roles.map((role, roleIdx) => (
                      <div
                        key={role.id}
                        onDragOver={(e) => {
                          if (!isLocked) e.preventDefault();
                        }}
                        onDrop={(e) => {
                          if (!isLocked) handleWorkerDropToRole(roleIdx, e);
                        }}
                        className={`rounded-lg border p-3 transition-colors ${draggingWorkerId ? 'border-dashed border-emerald-300 bg-emerald-50/60' : 'border-gray-200 bg-white'}`}
                      >
                        <div className="flex items-center gap-2 mb-2 flex-wrap">
                          <button
                            type="button"
                            onClick={() =>
                              setWorkerRoleFilterId((current) =>
                                current === role.id ? null : role.id,
                              )
                            }
                            aria-pressed={workerRoleFilterId === role.id}
                            title={`Filter available workers by ${role.roleName}`}
                            className={`text-xs font-bold px-2 py-0.5 rounded border transition-all ${roleColorClass(role.roleName)} ${workerRoleFilterId === role.id ? 'ring-2 ring-blue-500 ring-offset-1' : 'border-transparent hover:ring-1 hover:ring-blue-300'}`}
                          >
                            {role.roleName}
                          </button>
                          <span
                            className={`text-xs font-bold ${role.assignedWorkers.length >= role.requiredCount ? 'text-emerald-600' : 'text-orange-600'}`}
                          >
                            {role.assignedWorkers.length}/{role.requiredCount}
                          </span>
                          <RoleRequiredCertificationsInfo
                            requiredCertificationIds={getRoleRequiredCertificationIds(
                              role,
                            )}
                            certificationCatalog={certifications}
                          />
                        </div>
                        <div className="space-y-1 mb-3">
                          {role.assignedWorkers.map((wid) => {
                            const w = getWorkerById(wid);
                            if (!w) return null;
                            return (
                              <div
                                key={wid}
                                className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2"
                              >
                                <div
                                  className={`w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold ${roleBg(w.type)}`}
                                >
                                  {w.firstName[0]}
                                  {w.lastName[0]}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium text-gray-800">
                                    {w.firstName} {w.lastName}
                                  </p>
                                  <p className="text-xs text-gray-500">
                                    {workerRoleNames(w).join(', ') || w.type}
                                  </p>
                                </div>
                                <AssignedWorkerCertificationsInfo
                                  worker={w}
                                  roleName={role.roleName}
                                  requiredCertificationIds={getRoleRequiredCertificationIds(
                                    role,
                                  )}
                                  certificationCatalog={certifications}
                                />
                                {canDelegateWorkOrderAccess ? (
                                  <label className="flex cursor-pointer items-center gap-1.5 rounded border border-blue-200 bg-white px-2 py-1 text-[10px] font-semibold text-blue-700">
                                    <input
                                      type="checkbox"
                                      checked={workOrderAuthorizedWorkerIds.includes(
                                        wid,
                                      )}
                                      onChange={() =>
                                        toggleWorkOrderAccess(wid)
                                      }
                                      disabled={isLocked}
                                      className="h-3.5 w-3.5 accent-blue-600"
                                    />
                                    WO access
                                  </label>
                                ) : workOrderAuthorizedWorkerIds.includes(
                                    wid,
                                  ) ? (
                                  <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-semibold text-blue-700">
                                    WO access
                                  </span>
                                ) : null}
                                <span className="text-[10px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded font-medium">
                                  Assigned
                                </span>
                                {!isLocked && (
                                  <button
                                    onClick={() =>
                                      handleRemoveWorker(wid, roleIdx)
                                    }
                                    className="p-1 hover:bg-red-100 rounded"
                                  >
                                    <X size={12} className="text-red-500" />
                                  </button>
                                )}
                              </div>
                            );
                          })}
                          {role.assignedWorkers.length < role.requiredCount && (
                            <div className="border-2 border-dashed border-gray-200 rounded-lg p-2 text-center">
                              <span className="text-xs text-gray-400">
                                Need{' '}
                                {role.requiredCount -
                                  role.assignedWorkers.length}{' '}
                                more {role.roleName}(s)
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>

                {}
                <section className="min-w-0 self-start overflow-hidden rounded-xl border border-gray-200 bg-white">
                  <div className="p-3">
                    <div className="flex items-center justify-between mb-2 flex-wrap gap-3">
                      <span className="text-xs font-bold text-gray-600">
                        Available Workers
                        {workerRoleFilter
                          ? ` · ${workerRoleFilter.roleName}`
                          : ''}
                      </span>
                      {workerRoleFilter ? (
                        <button
                          type="button"
                          onClick={() => setWorkerRoleFilterId(null)}
                          className="text-[11px] font-semibold text-blue-600 hover:text-blue-800"
                        >
                          Clear role filter
                        </button>
                      ) : null}
                    </div>
                    <div className="flex items-center bg-gray-100 rounded-lg px-2.5 py-1.5 mb-2">
                      <Search size={12} className="text-gray-400 mr-1.5" />
                      <input
                        placeholder="Search workers..."
                        value={workerSearch}
                        onChange={(e) => setWorkerSearch(e.target.value)}
                        className="bg-transparent text-sm outline-none w-full"
                      />
                    </div>
                    <div className="max-h-[45vh] space-y-1 overflow-y-auto pr-1">
                      {availableWorkers.map((w) => {
                        const matchingRoleIdx = workerRoleFilter
                          ? roles.findIndex(
                              (r) =>
                                r.id === workerRoleFilter.id &&
                                r.assignedWorkers.length < r.requiredCount,
                            )
                          : roles.findIndex(
                              (r) =>
                                workerHasAssignmentRole(w, r.roleName) &&
                                r.assignedWorkers.length < r.requiredCount,
                            );
                        const targetIdx = matchingRoleIdx;
                        const targetRole =
                          targetIdx >= 0 ? roles[targetIdx] : undefined;
                        const certificationsOk = targetRole
                          ? workerMeetsRoleCertificationRequirements(
                              w,
                              getRoleRequiredCertificationIds(targetRole),
                            )
                          : false;
                        const hasOpenSlot = targetIdx >= 0 && certificationsOk;
                        const conflict = hasOpenSlot
                          ? getWorkerConflict(w.id, targetIdx)
                          : null;
                        const targetStartTime =
                          targetRole?.startTime ||
                          defaultRoleStartTime ||
                          shift.startTime;
                        const restHours = getRestHoursSinceLastShift(
                          w.id,
                          conflictWorkOrders,
                          shiftDate,
                          targetStartTime,
                        );
                        const minRest = settings?.minimumRestHours ?? 8;
                        const restBadge =
                          restHours !== null && restHours < minRest
                            ? {
                                label: formatShiftEndedAgo(restHours),
                                color: 'red' as const,
                              }
                            : null;
                        const weeklyShiftCount = getWeeklyAssignedShiftCount(
                          w.id,
                          conflictWorkOrders,
                          shiftDate,
                        );

                        return (
                          <div
                            key={w.id}
                            draggable={!isLocked}
                            onDragStart={(e) => {
                              if (isLocked) return;
                              e.dataTransfer.setData('text/plain', w.id);
                              e.dataTransfer.effectAllowed = 'move';
                              setDraggingWorkerId(w.id);
                            }}
                            onDragEnd={() => setDraggingWorkerId(null)}
                            className={`flex items-center gap-2 rounded-lg px-3 py-2 border transition-colors ${isLocked ? 'cursor-default opacity-70' : 'cursor-grab active:cursor-grabbing'} ${conflict ? 'border-orange-200 bg-orange-50/50' : !certificationsOk && targetIdx >= 0 ? 'border-rose-100 bg-rose-50/40' : 'border-gray-200 hover:border-blue-200 hover:bg-primary/10/30'}`}
                          >
                            <div
                              className={`w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold ${roleBg(w.type)}`}
                            >
                              {w.firstName[0]}
                              {w.lastName[0]}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-gray-800">
                                {w.firstName} {w.lastName}
                              </p>
                              <div className="flex items-center gap-1 flex-wrap">
                                <span className="text-xs text-gray-500">
                                  {workerRoleNames(w).join(', ') || w.type}
                                </span>
                                {matchingRoleIdx >= 0 && certificationsOk && (
                                  <span className="text-[9px] bg-emerald-100 text-emerald-700 px-1 py-0 rounded font-medium">
                                    Match
                                  </span>
                                )}
                                <span
                                  className="text-[9px] bg-blue-50 text-blue-700 px-1 py-0 rounded font-medium"
                                  title={`Assigned shifts in this week: ${weeklyShiftCount}`}
                                >
                                  {weeklyShiftCount}{' '}
                                  {weeklyShiftCount === 1 ? 'shift' : 'shifts'}{' '}
                                  this week
                                </span>
                                {targetIdx >= 0 && !certificationsOk && (
                                  <span className="text-[9px] bg-rose-100 text-rose-800 px-1 py-0 rounded font-medium">
                                    Certs
                                  </span>
                                )}
                                {conflict && (
                                  <span className="text-[9px] bg-orange-100 text-orange-700 px-1 py-0 rounded font-medium flex items-center gap-0.5">
                                    <AlertTriangle size={8} /> Conflict
                                  </span>
                                )}
                                {restBadge && (
                                  <span
                                    className={`text-[9px] px-1 py-0 rounded font-medium ${
                                      restBadge.color === 'red'
                                        ? 'bg-red-100 text-red-700'
                                        : restBadge.color === 'yellow'
                                          ? 'bg-yellow-100 text-yellow-700'
                                          : 'bg-green-100 text-green-700'
                                    }`}
                                    title={`${restBadge.label}. Minimum rest is ${minRest}h. This warning does not block assignment.`}
                                  >
                                    <AlertTriangle
                                      size={8}
                                      className="mr-0.5 inline"
                                    />
                                    {restBadge.label}
                                  </span>
                                )}
                              </div>
                            </div>
                            <PoolWorkerCertificationsInfo
                              worker={w}
                              certificationCatalog={certifications}
                              requiredCertificationIds={
                                targetRole
                                  ? getRoleRequiredCertificationIds(targetRole)
                                  : undefined
                              }
                              roleName={targetRole?.roleName}
                            />
                            <button
                              onClick={() =>
                                hasOpenSlot &&
                                !isLocked &&
                                handleAssignWorker(w.id, targetIdx)
                              }
                              disabled={!hasOpenSlot || isLocked}
                              className={`p-1.5 rounded-lg transition-colors ${!hasOpenSlot ? 'cursor-not-allowed opacity-50' : conflict ? 'hover:bg-orange-100' : 'hover:bg-emerald-100'}`}
                              title={
                                targetIdx < 0
                                  ? 'All roles are full'
                                  : !certificationsOk
                                    ? 'Worker is missing required certifications for the target role'
                                    : conflict
                                      ? `Conflict: ${conflict}`
                                      : 'Assign'
                              }
                            >
                              <UserPlus
                                size={14}
                                className={
                                  conflict
                                    ? 'text-orange-500'
                                    : 'text-emerald-600'
                                }
                              />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </section>
              </div>
            </div>
          )}
        </div>

        {}
        {isNewShiftDraft && (
          <div className="px-5 py-3 border-t border-gray-100 bg-gray-50/50 flex-shrink-0">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={repeatForWeek}
                onChange={(e) => setRepeatForWeek(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
              />
              <Repeat size={14} className="text-gray-500" />
              <span className="text-sm font-medium text-gray-700">
                Repeat this shift for the rest of the week
              </span>
            </label>
            {repeatForWeek &&
              (() => {
                const week = getWeekDates(shiftDate);
                const dayNames = [
                  'Sun',
                  'Mon',
                  'Tue',
                  'Wed',
                  'Thu',
                  'Fri',
                  'Sat',
                ];
                const selectedCount = week.filter(
                  ({ date, dayOfWeek }) =>
                    date >= today &&
                    isShiftDateWithinAssignmentRange(date, wo) &&
                    (date === shiftDate || repeatDays[dayOfWeek]),
                ).length;
                return (
                  <div className="mt-3 ml-6">
                    <div className="grid grid-cols-4 sm:grid-cols-7 gap-1.5">
                      {week.map(({ date, dayOfWeek }) => {
                        const isSource = date === shiftDate;
                        const inRange = isShiftDateWithinAssignmentRange(
                          date,
                          wo,
                        );
                        const isPast = date < today;
                        const disabled = isSource || !inRange || isPast;
                        const checked =
                          !isPast &&
                          inRange &&
                          (isSource || !!repeatDays[dayOfWeek]);
                        return (
                          <label
                            key={date}
                            className={`flex flex-col items-center gap-1 rounded-lg border p-2 text-xs ${
                              isSource
                                ? 'border-primary bg-primary/5 cursor-default'
                                : !inRange || isPast
                                  ? 'border-gray-200 bg-gray-100 opacity-50 cursor-not-allowed'
                                  : checked
                                    ? 'border-primary bg-primary/10 cursor-pointer'
                                    : 'border-gray-200 hover:border-gray-300 cursor-pointer'
                            }`}
                            title={
                              isPast
                                ? 'Cannot create shifts on past dates.'
                                : isSource
                                  ? 'Original shift date'
                                  : !inRange
                                    ? 'Outside assignment date range'
                                    : undefined
                            }
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              disabled={disabled}
                              onChange={(e) =>
                                setRepeatDays((prev) => ({
                                  ...prev,
                                  [dayOfWeek]: e.target.checked,
                                }))
                              }
                              className="h-3.5 w-3.5 rounded border-gray-300 text-primary focus:ring-primary disabled:opacity-60"
                            />
                            <span className="font-semibold text-gray-700">
                              {dayNames[dayOfWeek]}
                            </span>
                            <span className="text-[10px] text-gray-500">
                              {date.slice(5).replace('-', '/')}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                    <p className="mt-2 text-xs text-gray-500">
                      {selectedCount} shift{selectedCount === 1 ? '' : 's'} will
                      be created
                      {workOrderHasAssignmentDateRange(wo) && (
                        <>
                          {' '}
                          · Assignment range:{' '}
                          <span className="font-medium">
                            {assignmentDateRangeLabel(wo)}
                          </span>
                        </>
                      )}
                    </p>
                  </div>
                );
              })()}
          </div>
        )}

        {}
        <div className="p-4 border-t border-gray-100 flex items-center gap-3 flex-shrink-0">
          {!isNewShiftDraft && (
            <button
              onClick={() => onDelete(shift.id, woId)}
              disabled={isLocked}
              className="px-3 py-2 border border-red-200 text-red-600 rounded-xl text-sm font-medium hover:bg-red-50 flex items-center gap-1 disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:bg-transparent"
              title={isLocked ? 'Completed shifts cannot be deleted' : 'Delete'}
            >
              <Trash2 size={14} /> Delete
            </button>
          )}
          {!isNewShiftDraft && (
            <button
              onClick={() => {
                void onDuplicate(shift, woId);
              }}
              disabled={isLocked}
              className="px-3 py-2 border border-gray-200 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-50 flex items-center gap-1 disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:bg-transparent"
              title={
                isLocked ? 'Completed shifts cannot be duplicated' : 'Duplicate'
              }
            >
              <Copy size={14} /> Duplicate
            </button>
          )}
          <div className="flex-1" />
          <button
            onClick={onClose}
            className="px-4 py-2 border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          {(() => {
            const repeatCount = (() => {
              if (!isNewShiftDraft || !repeatForWeek) return 0;
              const week = getWeekDates(shiftDate);
              return week.filter(
                ({ date, dayOfWeek }) =>
                  date >= today &&
                  isShiftDateWithinAssignmentRange(date, wo) &&
                  (date === shiftDate || repeatDays[dayOfWeek]),
              ).length;
            })();
            const buttonLabel = isNewShiftDraft
              ? repeatForWeek && repeatCount > 1
                ? `Create ${repeatCount} Shifts`
                : 'Create Shift'
              : 'Save Changes';
            return (
              <button
                onClick={handleSave}
                disabled={isLocked || bulkSaving || Boolean(bulkConfirmation)}
                className="px-4 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-semibold hover:bg-primary/90 flex items-center gap-1.5 shadow-sm disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:bg-primary"
                title={
                  isLocked ? 'Completed shifts cannot be modified' : undefined
                }
              >
                <Check size={14} />{' '}
                {bulkSaving ? 'Creating shifts...' : buttonLabel}
              </button>
            );
          })()}
        </div>
      </div>
    </div>
  );
};

export default SchedulerCalendarView;
