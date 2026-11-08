import TableLoading from '@/components/shared/TableLoading';
import { useDeferredAppData } from '@/hooks/use-deferred-app-data';
import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { useAppContext } from '@/contexts/AppContext';
import { findBulkShiftWorkerConflicts } from '@/lib/bulkShiftWorkerConflicts';
import { useToast } from '@/hooks/use-toast';
import { Project, Shift, WorkOrder, Worker } from '@/lib/types';
import {
  getRoleRequiredCertificationIds,
  workerMeetsRoleCertificationRequirements,
} from '@/lib/workerCertificationMatch';
import {
  assignmentRoleOptions,
  workerHasAssignmentRole,
  workerRoleNames,
} from '@/lib/workerRoleMatch';
import ResourcePanel from './ResourcePanel';
import type { DraggingWorkerInfo } from './ResourcePanel';
import ShiftCell from './ShiftCell';
import { ShiftDetailsSheet } from './ShiftDetailsSheet';
import BulkActionBar from './BulkActionBar';
import ProjectCalendarCenter from './ProjectCalendarCenter';
import SchedulerCalendarView from './SchedulerCalendarView';
import SchedulerListView from './SchedulerListView';
import SchedulerAlerts from './SchedulerAlerts';
import { getWorkerAvailability } from './AvailabilityIndicator';
import {
  getEffectiveShiftStatus,
  canCancelShiftStatus,
  getWorkerConfirmationStatus,
  hasWorkersPendingInitialNotification,
  hasWorkerConfirmationRequest,
  isWorkerPendingInitialNotification,
  reactivateCancelledShiftWithManualStatus,
  prepareShiftDuplicate,
} from './shiftConfirmation';
import { computeScheduleDashboardStats } from './scheduleDashboardStats';
import NotifyWorkerModal, {
  NotificationRecipient,
  NotificationLogEntry,
  sendNotificationAction,
} from './NotifyWorkerModal';
import NotificationLog from './NotificationLog';
import { applyNotificationRequestEntriesToWorkOrder } from './notificationConfirmationUpdates';
import { cancelShift, fetchShiftStats } from '@/lib/db';
import SearchableSelect from '@/components/shared/SearchableSelect';
import { CertificationMultiSelect } from '@/components/skills/SkillMultiSelect';
import WorkOrderFileUploadsField from '@/components/workorders/WorkOrderFileUploadsField';
import ShiftFormTemplatesPicker from '@/components/forms/ShiftFormTemplatesPicker';
import { AssignmentAddressField } from '@/components/workorders/AssignmentAddressField';
import ShiftOverviewTab, { emptyShiftAddress } from './ShiftOverviewTab';
import { DEFAULT_ASSIGNMENT_COUNTRY } from '@/lib/googlePlaceAddress';

import { workOrderUpdateErrorFeedback } from '@/lib/workOrderUpdateError';
import {
  assignmentDateRangeLabel,
  formatAssignmentDateRangeShort,
  isAssignmentRangeWithinProject,
  isShiftDateWithinAssignmentRange,
  projectHasScheduleBounds,
  workOrderHasAssignmentDateRange,
} from '@/lib/workOrderShiftDateRange';
import { getDefaultShiftFormTemplateIds } from '@/lib/defaultShiftForms';
import {
  availableRoleNamesForCard,
  nextUnusedRoleName,
} from '@/lib/shiftRoleSelection';
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
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Plus,
  Filter,
  RefreshCw,
  Users,
  Search,
  ChevronDown,
  X,
  Keyboard,
  ExternalLink,
  FolderKanban,
  UserPlus,
  Eye,
  CalendarDays,
  LayoutList,
  Clock,
  Save,
  Trash2,
  MapPin,
  AlertTriangle,
  Check,
  Briefcase,
  LayoutGrid,
  Columns3,
  Send,
  FileText,
  Bell,
  MessageSquare,
  Edit2,
  Copy,
  Package,
  CheckCircle2,
  UserX,
  MessageSquareQuote,
  Wrench,
} from 'lucide-react';

type SchedulerViewType = 'calendar' | 'timeline' | 'list';

const startOfWeek = (date: Date) => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day));
  return d;
};

const DEFAULT_SHIFT_DURATION_MINUTES = 9 * 60;

const isCancelledAssignment = (
  wo: Pick<WorkOrder, 'status'> | null | undefined,
): boolean => {
  const status = String(wo?.status ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');
  return status === 'cancelled' || status === 'canceled';
};

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
  if (!template?.startTime || !template?.endTime) return 'No predefined range';
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
  if (street) return tail ? `${street} · ${tail}` : street;

  const projectStreet = (project?.location ?? '').trim();
  const projectCity = (project?.city ?? '').trim();
  const projectState = (project?.state ?? '').trim();
  const projectZip = (project?.zipCode ?? '').trim();
  const parts = [
    projectStreet,
    [projectCity, projectState].filter(Boolean).join(', '),
    projectZip,
  ].filter(Boolean);
  return parts.join(' · ');
}

const SchedulerView: React.FC = () => {
  const {
    workOrders,
    projects,
    equipment,
    workers,
    settings,
    availabilityRequests,
    workOrderTypes,
    isLoading,
    isDbConnected,
    getWorkerById,
    getProjectById,
    getClientById,
    addWorkOrder,
    updateWorkOrder,
    deleteWorkOrder,
    addWorker,
    setCurrentPage,
  } = useAppContext();

  const { toast } = useToast();
  const todayDate = useMemo(() => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    return now;
  }, []);

  const [schedulerViewType, setSchedulerViewType] =
    useState<SchedulerViewType>('calendar');

  const legacyAssignments = useDeferredAppData(['workOrders'], schedulerViewType !== 'calendar');

  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [viewMode, setViewMode] = useState<'1week' | '2week' | 'day'>('1week');
  const [showResourcePanel, setShowResourcePanel] = useState(true);
  const [expandedOrders, setExpandedOrders] = useState<Set<string>>(
    new Set(workOrders.map((wo) => wo.id)),
  );
  const [showNewOrderModal, setShowNewOrderModal] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [selectedProject, setSelectedProject] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const [selectedShiftIds, setSelectedShiftIds] = useState<Set<string>>(
    new Set(),
  );
  const [effectiveShiftStatuses, setEffectiveShiftStatuses] = useState<
    Record<string, string | null>
  >({});
  const [lastSelectedShiftId, setLastSelectedShiftId] = useState<string | null>(
    null,
  );
  const [showTips, setShowTips] = useState(true);

  const [focusedProjectId, setFocusedProjectId] = useState<string | null>(null);
  const [focusedWorkOrderId, setFocusedWorkOrderId] = useState<string | null>(
    null,
  );
  const [showProjectCalendar, setShowProjectCalendar] = useState(false);
  const [modifiedShiftIds, setModifiedShiftIds] = useState<Set<string>>(
    new Set(),
  );

  const [editingShift, setEditingShift] = useState<{
    shiftId: string;
    workOrderId: string;
  } | null>(null);
  const [shiftDetailsPanel, setShiftDetailsPanel] = useState<{
    shift: Shift;
    woId: string;
  } | null>(null);

  const [quickAddShift, setQuickAddShift] = useState<{
    date: Date;
    workOrderId: string;
  } | null>(null);

  const [dayViewDate, setDayViewDate] = useState(() => new Date(todayDate));

  const [shiftClipboard, setShiftClipboard] = useState<{
    shift: Shift;
    workOrderId: string;
  } | null>(null);

  const [dragOverEmptyCell, setDragOverEmptyCell] = useState<string | null>(
    null,
  );

  const [draggingWorker, setDraggingWorker] =
    useState<DraggingWorkerInfo | null>(null);

  const [pendingDrop, setPendingDrop] = useState<{
    shiftId: string;
    roleId: string;
    data: { type: string; id: string; linkedEquipmentId?: string | null };
    availLevel: 'yellow' | 'red';
    availLabel: string;
    workerName: string;
    shiftDate: string;
    roleName: string;
  } | null>(null);
  const [pendingDeleteWO, setPendingDeleteWO] = useState<{
    id: string;
    title: string;
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

  const [notifyRecipients, setNotifyRecipients] = useState<
    NotificationRecipient[]
  >([]);
  const [notifyIsBulk, setNotifyIsBulk] = useState(false);
  const [notificationLog, setNotificationLog] = useState<
    NotificationLogEntry[]
  >([]);
  const [showNotificationLog, setShowNotificationLog] = useState(false);

  const handleWorkerDragStart = useCallback((info: DraggingWorkerInfo) => {
    setDraggingWorker(info);
  }, []);

  const handleWorkerDragEnd = useCallback(() => {
    setDraggingWorker(null);
  }, []);

  const days = useMemo(() => {
    if (viewMode === 'day') {
      return [dayViewDate];
    }
    const count = viewMode === '1week' ? 7 : 14;
    return Array.from({ length: count }, (_, i) => {
      const d = new Date(weekStart);
      d.setDate(d.getDate() + i);
      return d;
    });
  }, [weekStart, viewMode, dayViewDate]);

  useEffect(() => {
    const dates = days.map((day) => day.toISOString().split('T')[0]).sort();
    if (dates.length === 0) return;
    let active = true;
    fetchShiftStats({ from: dates[0], to: dates[dates.length - 1] })
      .then((result) => {
        if (active)
          setEffectiveShiftStatuses(
            Object.fromEntries(
              result.shifts.map((item) => [item.shiftId, item.status]),
            ),
          );
      })
      .catch(() => {
        if (active) setEffectiveShiftStatuses({});
      });
    return () => {
      active = false;
    };
  }, [days, workOrders]);

  const activeWorkOrders = useMemo(() => {
    const workOrderTypeNameById = new Map(
      workOrderTypes.map((type) => [type.id, type.name]),
    );
    const filtered = workOrders.filter((wo) => {
      if (selectedProject && wo.projectId !== selectedProject) return false;
      if (searchQuery) {
        const project = getProjectById(wo.projectId);
        const client = project ? getClientById(project.clientId) : undefined;
        const woTypeName = wo.workOrderTypeId
          ? workOrderTypeNameById.get(wo.workOrderTypeId) || ''
          : '';
        const q = searchQuery.toLowerCase();
        if (
          !wo.title.toLowerCase().includes(q) &&
          !(project?.name || '').toLowerCase().includes(q) &&
          !(client?.name || '').toLowerCase().includes(q) &&
          !(wo.orderNumber || '').toLowerCase().includes(q) &&
          !woTypeName.toLowerCase().includes(q)
        )
          return false;
      }
      return true;
    });
    const latestShift = (wo: WorkOrder) =>
      (wo.shifts || []).reduce((latest, shift) => {
        const value = `${shift.date}T${shift.startTime || '00:00'}`;
        return value > latest ? value : latest;
      }, '');
    return [...filtered].sort((a, b) => {
      const byCreated = (b.createdAt || '').localeCompare(a.createdAt || '');
      if (byCreated !== 0) return byCreated;
      const byLatest = latestShift(b).localeCompare(latestShift(a));
      if (byLatest !== 0) return byLatest;
      return (b.startDate || '').localeCompare(a.startDate || '');
    });
  }, [
    workOrders,
    selectedProject,
    searchQuery,
    getProjectById,
    getClientById,
    workOrderTypes,
  ]);

  const timelineVisibleWorkOrders = useMemo(() => {
    if (!focusedWorkOrderId) return activeWorkOrders;
    const selectedWo = activeWorkOrders.find(
      (wo) => wo.id === focusedWorkOrderId,
    );
    return selectedWo ? [selectedWo] : activeWorkOrders;
  }, [activeWorkOrders, focusedWorkOrderId]);
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

  const workOrderTypeNameById = useMemo(
    () => new Map(workOrderTypes.map((type) => [type.id, type.name])),
    [workOrderTypes],
  );

  const allShiftsFlat = useMemo(() => {
    const result: { shift: Shift; workOrderId: string; index: number }[] = [];
    let idx = 0;
    (activeWorkOrders || []).forEach((wo) => {
      (wo.shifts || []).forEach((s) => {
        result.push({ shift: s, workOrderId: wo.id, index: idx++ });
      });
    });
    return result;
  }, [activeWorkOrders]);

  const navigateWeek = (dir: number) => {
    if (viewMode === 'day') {
      setDayViewDate((prev) => {
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
  };

  const goToToday = () => {
    if (viewMode === 'day') {
      setDayViewDate(new Date(todayDate));
    } else {
      setWeekStart(startOfWeek(todayDate));
    }
  };

  const navigateToDate = useCallback(
    (date: Date) => {
      if (viewMode === 'day') {
        setDayViewDate(date);
      } else {
        setWeekStart(startOfWeek(date));
      }
    },
    [viewMode],
  );

  const handleNavigateToTimeline = useCallback(
    (date: Date, projectId?: string) => {
      setSchedulerViewType('timeline');
      setWeekStart(startOfWeek(date));
      if (projectId) {
        setFocusedProjectId(projectId);
      }
    },
    [],
  );

  const handleFocusProject = useCallback((projectId: string) => {
    setSchedulerViewType('timeline');
    setFocusedProjectId(projectId);
  }, []);

  const formatDayHeader = (d: Date) => {
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    return `${dayNames[d.getDay()]} ${d.getDate().toString().padStart(2, '0')}`;
  };

  const toggleExpand = (id: string) => {
    setExpandedOrders((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleProjectClick = (projectId: string) => {
    if (focusedProjectId === projectId) {
      setFocusedProjectId(null);
      setFocusedWorkOrderId(null);
    } else {
      setFocusedProjectId(projectId);
      setFocusedWorkOrderId(null);

      if (!showResourcePanel) setShowResourcePanel(true);
    }
  };

  const handleCloseProjectDetail = () => {
    setFocusedProjectId(null);
    setFocusedWorkOrderId(null);
  };

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
    const saveProject = getProjectById(editWOForm.projectId);
    if (saveProject && projectHasScheduleBounds(saveProject)) {
      const woRangeSv = {
        startDate: editWOForm.startDate,
        endDate: editWOForm.endDate,
      };
      if (!isAssignmentRangeWithinProject(woRangeSv, saveProject)) {
        toast({
          title: 'Outside project dates',
          description: `Assignment dates must fall within ${assignmentDateRangeLabel(saveProject)}.`,
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

  const [copyingWeek, setCopyingWeek] = useState<string | null>(null);
  const handleCopyWeek = async (wo: WorkOrder) => {
    if (copyingWeek || isCancelledAssignment(wo)) return;
    const dateKey = (value: Date) =>
      `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
    const start = startOfWeek(viewMode === 'day' ? dayViewDate : weekStart);
    const end = new Date(start);
    end.setDate(end.getDate() + 7);
    const source = wo.shifts.filter(
      (shift) =>
        shift.date >= dateKey(start) &&
        shift.date < dateKey(end) &&
        !shift.cancelled,
    );
    if (!source.length) {
      toast({ title: 'No shifts in this week', variant: 'destructive' });
      return;
    }
    const target = window.prompt(
      `Copy ${source.length} shifts from ${dateKey(start)}. Enter the destination week start (YYYY-MM-DD):`,
      dateKey(end),
    );
    if (!target) return;
    const targetDate = new Date(`${target}T12:00:00`);
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(target) ||
      Number.isNaN(targetDate.getTime()) ||
      dateKey(targetDate) !== target ||
      targetDate.getDay() !== start.getDay() ||
      target === dateKey(start)
    ) {
      toast({
        title: 'Enter a different valid week start date',
        variant: 'destructive',
      });
      return;
    }
    const copies: Shift[] = [];
    for (const shift of source) {
      const offset = Math.round(
        (Date.parse(`${shift.date}T12:00:00Z`) -
          Date.parse(`${dateKey(start)}T12:00:00Z`)) /
          86400000,
      );
      const day = new Date(targetDate);
      day.setDate(day.getDate() + offset);
      const date = dateKey(day);
      if (!isShiftDateWithinAssignmentRange(date, wo)) {
        toast({
          title: 'Cannot copy week',
          description: `All destination dates must fall within ${assignmentDateRangeLabel(wo)}.`,
          variant: 'destructive',
        });
        return;
      }
      copies.push(
        prepareShiftDuplicate(
          shift,
          {
            ...shift,
            id: `s_${crypto.randomUUID()}`,
            date,
            status: 'dispatch_pending',
            cancelled: false,
            pmApprovedAt: undefined,
            pmApprovedByUserId: undefined,
            pmApprovedByName: undefined,
            roles: shift.roles.map((role) => ({
              ...role,
              id: `sr_${crypto.randomUUID()}`,
              workerConfirmations: role.assignedWorkers.map((workerId) => ({
                workerId,
                status: 'pending' as const,
              })),
            })),
          },
          [...wo.shifts, ...copies].map((item) => item.shiftName),
        ),
      );
    }
    const conflicts = findBulkShiftWorkerConflicts(
      copies,
      workOrders
        .filter((order) => !isCancelledAssignment(order))
        .flatMap((order) => order.shifts),
    );
    if (conflicts.length) {
      toast({
        title: 'Worker schedule conflict',
        description: `${conflicts.length} overlapping worker assignments were found. Choose another week.`,
        variant: 'destructive',
      });
      return;
    }
    if (
      !window.confirm(
        `Add ${copies.length} shifts to ${wo.title} for the week starting ${target}? Existing shifts will be kept.`,
      )
    )
      return;
    setCopyingWeek(wo.id);
    try {
      await updateWorkOrder(wo.id, { shifts: [...wo.shifts, ...copies] });
      handleModifiedShifts(copies.map((shift) => shift.id));
      toast({
        title: 'Week copied',
        description: `${copies.length} shifts created.`,
      });
    } catch (error) {
      toast({
        title: 'Could not copy week',
        description: error instanceof Error ? error.message : 'Request failed.',
        variant: 'destructive',
      });
    } finally {
      setCopyingWeek(null);
    }
  };

  const handleDuplicateWO = useCallback(
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
      const dupProject = getProjectById(wo.projectId);
      if (dupProject && projectHasScheduleBounds(dupProject)) {
        if (
          !isAssignmentRangeWithinProject(
            { startDate: wo.startDate, endDate: wo.endDate },
            dupProject,
          )
        ) {
          toast({
            title: 'Cannot duplicate',
            description: `This assignment falls outside project dates (${assignmentDateRangeLabel(dupProject)}). Adjust dates first.`,
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

  const getShiftForDay = (wo: WorkOrder, date: Date) => {
    const dateStr = date.toISOString().split('T')[0];
    return wo.shifts.find((s) => s.date === dateStr);
  };

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
      if (!showResourcePanel) setShowResourcePanel(true);
    },
    [lastSelectedShiftId, allShiftsFlat, showResourcePanel],
  );

  const handleClearSelection = () => {
    setSelectedShiftIds(new Set());
    setLastSelectedShiftId(null);
  };

  const handleModifiedShifts = useCallback((ids: string[]) => {
    setModifiedShiftIds((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => next.add(id));
      return next;
    });
    setTimeout(() => {
      setModifiedShiftIds((prev) => {
        const next = new Set(prev);
        ids.forEach((id) => next.delete(id));
        return next;
      });
    }, 3000);
  }, []);

  const handleCopyShift = useCallback(
    (shiftId: string, workOrderId: string) => {
      const wo = workOrders.find((w) => w.id === workOrderId);
      const shift = wo?.shifts.find((s) => s.id === shiftId);
      if (shift && wo) {
        setShiftClipboard({
          shift: JSON.parse(JSON.stringify(shift)),
          workOrderId,
        });
        toast({
          title: 'Shift Copied',
          description: `Shift on ${shift.date} copied to clipboard`,
        });
      }
    },
    [workOrders, toast],
  );

  const handlePasteShift = useCallback(
    (targetDate: string, workOrderId: string) => {
      if (!shiftClipboard) return;
      const wo = workOrders.find((w) => w.id === workOrderId);
      if (!wo) return;
      if (isCancelledAssignment(wo)) {
        toast({
          title: 'Assignment cancelled',
          description: 'Cancelled assignments cannot receive new shifts.',
          variant: 'destructive',
        });
        return;
      }
      if (!isShiftDateWithinAssignmentRange(targetDate, wo)) {
        toast({
          title: 'Outside assignment dates',
          description: workOrderHasAssignmentDateRange(wo)
            ? `Shifts must be between ${assignmentDateRangeLabel(wo)}.`
            : 'Invalid assignment dates.',
          variant: 'destructive',
        });
        return;
      }
      const newShift = prepareShiftDuplicate(
        shiftClipboard.shift,
        {
          id: `s_paste_${Date.now()}`,
          workOrderId,
          shiftName: shiftClipboard.shift.shiftName,
          date: targetDate,
          startTime: shiftClipboard.shift.startTime,
          endTime: shiftClipboard.shift.endTime,
          plannedEquipment: [...(shiftClipboard.shift.plannedEquipment || [])],
          plannedMaterials: [...(shiftClipboard.shift.plannedMaterials || [])],
          roles: shiftClipboard.shift.roles.map((r) => ({
            ...r,
            id: `sr_paste_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            assignedWorkers: [...r.assignedWorkers],
          })),
        },
        wo.shifts.map((item) => item.shiftName),
      );
      updateWorkOrder(workOrderId, { shifts: [...wo.shifts, newShift] });
      handleModifiedShifts([newShift.id]);
      toast({
        title: 'Shift Pasted',
        description: `Shift pasted to ${targetDate}`,
      });
    },
    [shiftClipboard, workOrders, updateWorkOrder, handleModifiedShifts, toast],
  );

  const handleDuplicateToNextDay = useCallback(
    (shiftId: string, workOrderId: string) => {
      const wo = workOrders.find((w) => w.id === workOrderId);
      const shift = wo?.shifts.find((s) => s.id === shiftId);
      if (!wo || !shift) return;
      if (isCancelledAssignment(wo)) {
        toast({
          title: 'Assignment cancelled',
          description: 'Cancelled assignments cannot receive new shifts.',
          variant: 'destructive',
        });
        return;
      }
      const nextDate = new Date(shift.date + 'T12:00:00');
      nextDate.setDate(nextDate.getDate() + 1);
      const nextDateStr = nextDate.toISOString().split('T')[0];
      if (!isShiftDateWithinAssignmentRange(nextDateStr, wo)) {
        toast({
          title: 'Outside assignment dates',
          description: workOrderHasAssignmentDateRange(wo)
            ? `Duplicate would fall on ${nextDateStr}, outside ${assignmentDateRangeLabel(wo)}.`
            : 'Invalid assignment dates.',
          variant: 'destructive',
        });
        return;
      }
      const newShift = prepareShiftDuplicate(
        shift,
        {
          id: `s_dup_${Date.now()}`,
          workOrderId,
          shiftName: shift.shiftName,
          date: nextDateStr,
          startTime: shift.startTime,
          endTime: shift.endTime,
          plannedEquipment: [...(shift.plannedEquipment || [])],
          plannedMaterials: [...(shift.plannedMaterials || [])],
          roles: shift.roles.map((r) => ({
            ...r,
            id: `sr_dup_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            assignedWorkers: [...r.assignedWorkers],
          })),
        },
        wo.shifts.map((item) => item.shiftName),
      );
      updateWorkOrder(workOrderId, { shifts: [...wo.shifts, newShift] });
      handleModifiedShifts([newShift.id]);
      toast({
        title: 'Shift Duplicated',
        description: `Shift duplicated to ${nextDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}`,
      });
    },
    [workOrders, updateWorkOrder, handleModifiedShifts, toast],
  );

  const handleDuplicateToWeekDays = useCallback(
    (shiftId: string, workOrderId: string) => {
      const wo = workOrders.find((w) => w.id === workOrderId);
      const shift = wo?.shifts.find((s) => s.id === shiftId);
      if (!wo || !shift) return;
      if (isCancelledAssignment(wo)) {
        toast({
          title: 'Assignment cancelled',
          description: 'Cancelled assignments cannot receive new shifts.',
          variant: 'destructive',
        });
        return;
      }
      const shiftDate = new Date(shift.date + 'T12:00:00');
      const weekStart = startOfWeek(shiftDate);
      const newShifts: Shift[] = [];
      for (let i = 0; i < 5; i++) {
        const d = new Date(weekStart);
        d.setDate(d.getDate() + i);
        const dateStr = d.toISOString().split('T')[0];
        if (dateStr === shift.date) continue;
        if (!isShiftDateWithinAssignmentRange(dateStr, wo)) continue;
        newShifts.push(
          prepareShiftDuplicate(
            shift,
            {
              id: `s_dupw_${Date.now()}_${i}`,
              workOrderId,
              shiftName: shift.shiftName,
              date: dateStr,
              startTime: shift.startTime,
              endTime: shift.endTime,
              plannedEquipment: [...(shift.plannedEquipment || [])],
              plannedMaterials: [...(shift.plannedMaterials || [])],
              roles: shift.roles.map((r) => ({
                ...r,
                id: `sr_dupw_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 6)}`,
                assignedWorkers: [...r.assignedWorkers],
              })),
            },
            [...wo.shifts, ...newShifts].map((item) => item.shiftName),
          ),
        );
      }
      if (newShifts.length > 0) {
        updateWorkOrder(workOrderId, { shifts: [...wo.shifts, ...newShifts] });
        handleModifiedShifts(newShifts.map((s) => s.id));
        toast({
          title: 'Shifts Duplicated',
          description: `Shift duplicated to ${newShifts.length} weekday(s)`,
        });
      } else {
        toast({
          title: 'No Days Available',
          description: workOrderHasAssignmentDateRange(wo)
            ? `No extra weekdays fall within ${assignmentDateRangeLabel(wo)}.`
            : 'No additional weekdays were available for duplication',
          variant: 'destructive',
        });
      }
    },
    [workOrders, updateWorkOrder, handleModifiedShifts, toast],
  );

  const handleClearShift = useCallback(
    async (shiftId: string, workOrderId: string) => {
      const wo = workOrders.find((w) => w.id === workOrderId);
      if (!wo) return;
      if (isCancelledAssignment(wo)) {
        toast({
          title: 'Assignment cancelled',
          description: 'Cancelled assignments cannot be modified.',
          variant: 'destructive',
        });
        return;
      }
      const shift = wo.shifts.find((s) => s.id === shiftId);
      const updatedShifts = wo.shifts.filter((s) => s.id !== shiftId);
      try {
        await updateWorkOrder(workOrderId, { shifts: updatedShifts });
        toast({
          title: 'Shift Cleared',
          description: `Shift on ${shift?.date} was removed.`,
        });
      } catch (error) {
        toast({
          title: 'Unable to clear shift',
          description:
            error instanceof Error ? error.message : 'Please try again.',
          variant: 'destructive',
        });
      }
    },
    [workOrders, updateWorkOrder, toast],
  );

  const handleShiftDragCopy = useCallback(
    (shiftId: string, workOrderId: string) => {
      handleCopyShift(shiftId, workOrderId);
    },
    [handleCopyShift],
  );

  const handleEditShift = useCallback(
    (shiftId: string, workOrderId: string) => {
      const wo = workOrders.find((workOrder) => workOrder.id === workOrderId);
      if (isCancelledAssignment(wo)) {
        toast({
          title: 'Assignment cancelled',
          description: 'Shifts inside a cancelled assignment cannot be edited.',
          variant: 'destructive',
        });
        return;
      }
      setEditingShift({ shiftId, workOrderId });
    },
    [workOrders, toast],
  );

  const handleAddShiftSameDay = useCallback(
    (dateStr: string, workOrderId: string) => {
      const wo = workOrders.find((w) => w.id === workOrderId);
      if (wo && isCancelledAssignment(wo)) {
        toast({
          title: 'Assignment cancelled',
          description: 'Cancelled assignments cannot receive new shifts.',
          variant: 'destructive',
        });
        return;
      }
      if (wo && !isShiftDateWithinAssignmentRange(dateStr, wo)) {
        toast({
          title: 'Outside assignment dates',
          description: workOrderHasAssignmentDateRange(wo)
            ? `Shifts must be between ${assignmentDateRangeLabel(wo)}.`
            : 'Invalid assignment dates.',
          variant: 'destructive',
        });
        return;
      }
      const date = new Date(`${dateStr}T12:00:00`);
      setQuickAddShift({ date, workOrderId });
    },
    [workOrders, toast],
  );

  const handleEmptyCellClick = useCallback(
    (date: Date, workOrderId: string) => {
      const dateStr = date.toISOString().split('T')[0];
      const wo = workOrders.find((w) => w.id === workOrderId);
      if (wo && isCancelledAssignment(wo)) {
        toast({
          title: 'Assignment cancelled',
          description: 'Cancelled assignments cannot receive new shifts.',
          variant: 'destructive',
        });
        return;
      }
      if (wo && !isShiftDateWithinAssignmentRange(dateStr, wo)) {
        toast({
          title: 'Outside assignment dates',
          description: workOrderHasAssignmentDateRange(wo)
            ? `Shifts must be between ${assignmentDateRangeLabel(wo)}.`
            : 'Invalid assignment dates.',
          variant: 'destructive',
        });
        return;
      }

      if (shiftClipboard) {
        handlePasteShift(dateStr, workOrderId);
      } else {
        setQuickAddShift({ date, workOrderId });
      }
    },
    [shiftClipboard, handlePasteShift, workOrders, toast],
  );

  const checkWorkerConflict = useCallback(
    (
      workerId: string,
      targetShift: Shift,
      targetWorkOrderId: string,
    ): string | null => {
      for (const wo of workOrders) {
        if (isCancelledAssignment(wo)) continue;
        for (const shift of wo.shifts) {
          if (shift.id === targetShift.id) continue;
          if (shift.date !== targetShift.date) continue;
          if (
            shift.startTime < targetShift.endTime &&
            shift.endTime > targetShift.startTime
          ) {
            for (const role of shift.roles) {
              if (role.assignedWorkers.includes(workerId)) {
                const worker = getWorkerById(workerId);
                const project = getProjectById(wo.projectId);
                return `${worker?.firstName} ${worker?.lastName} is already assigned to "${project?.name || wo.title}" on ${shift.date} (${shift.startTime}-${shift.endTime})`;
              }
            }
          }
        }
      }
      return null;
    },
    [workOrders, getWorkerById, getProjectById],
  );

  const executeWorkerDrop = useCallback(
    (
      shiftId: string,
      roleId: string,
      data: { type: string; id: string; linkedEquipmentId?: string | null },
    ) => {
      const targetWo = workOrders.find((wo) =>
        wo.shifts.some((s) => s.id === shiftId),
      );
      if (!targetWo) return;
      if (isCancelledAssignment(targetWo)) {
        toast({
          title: 'Assignment cancelled',
          description: 'Cancelled assignments cannot be modified.',
          variant: 'destructive',
        });
        return;
      }
      const targetShift = targetWo.shifts.find((s) => s.id === shiftId);
      if (!targetShift) return;
      const targetRole = targetShift.roles.find((r) => r.id === roleId);
      if (!targetRole) return;
      if (
        targetRole.assignedWorkers.length >=
        Math.max(1, targetRole.requiredCount)
      ) {
        toast({
          title: 'Role capacity reached',
          description: `${targetRole.roleName} is already full.`,
          variant: 'destructive',
        });
        return;
      }
      const droppedWorker = getWorkerById(data.id);
      if (
        !droppedWorker ||
        !workerHasAssignmentRole(droppedWorker, targetRole.roleName)
      ) {
        toast({
          title: 'Role mismatch',
          description: droppedWorker
            ? `${droppedWorker.firstName} ${droppedWorker.lastName} does not have the ${targetRole.roleName} worker role.`
            : 'Could not load this worker profile.',
          variant: 'destructive',
        });
        return;
      }

      const updatedShifts = targetWo.shifts.map((s) => {
        if (s.id !== shiftId) return s;
        return {
          ...s,
          roles: s.roles.map((r) => {
            if (r.id !== roleId) return r;
            return { ...r, assignedWorkers: [...r.assignedWorkers, data.id] };
          }),
        };
      });
      updateWorkOrder(targetWo.id, { shifts: updatedShifts });
      handleModifiedShifts([shiftId]);
      const worker = getWorkerById(data.id);
      toast({
        title: 'Worker Assigned',
        description: `${worker?.firstName} ${worker?.lastName} assigned to ${targetRole.roleName} on ${targetShift.date}`,
      });
    },
    [workOrders, updateWorkOrder, getWorkerById, toast, handleModifiedShifts],
  );

  const handleDrop = useCallback(
    (
      shiftId: string,
      roleId: string,
      data: { type: string; id: string; linkedEquipmentId?: string | null },
    ) => {
      const targetWo = workOrders.find((wo) =>
        wo.shifts.some((s) => s.id === shiftId),
      );
      if (!targetWo) return;
      if (isCancelledAssignment(targetWo)) {
        toast({
          title: 'Assignment cancelled',
          description: 'Cancelled assignments cannot be modified.',
          variant: 'destructive',
        });
        return;
      }
      const targetShift = targetWo.shifts.find((s) => s.id === shiftId);
      if (!targetShift) return;
      const targetRole = targetShift.roles.find((r) => r.id === roleId);
      if (!targetRole) return;
      if (data.type !== 'worker') return;

      if (data.type === 'worker') {
        if (targetRole.assignedWorkers.includes(data.id)) {
          toast({
            title: 'Already Assigned',
            description: 'This worker is already assigned to this role.',
            variant: 'destructive',
          });
          return;
        }

        const conflict = checkWorkerConflict(data.id, targetShift, targetWo.id);
        if (conflict) {
          toast({
            title: 'Scheduling Conflict',
            description: conflict,
            variant: 'destructive',
          });
          return;
        }
        const droppedWorker = getWorkerById(data.id);
        if (
          !droppedWorker ||
          !workerHasAssignmentRole(droppedWorker, targetRole.roleName)
        ) {
          toast({
            title: 'Role mismatch',
            description: droppedWorker
              ? `${droppedWorker.firstName} ${droppedWorker.lastName} does not have the ${targetRole.roleName} worker role.`
              : 'Could not load this worker profile.',
            variant: 'destructive',
          });
          return;
        }
        if (
          droppedWorker &&
          !workerMeetsRoleCertificationRequirements(
            droppedWorker,
            getRoleRequiredCertificationIds(targetRole),
          )
        ) {
          toast({
            title: 'Certification requirements not met',
            description: `${droppedWorker.firstName} ${droppedWorker.lastName} does not have all required certifications for ${targetRole.roleName}.`,
            variant: 'destructive',
          });
          return;
        }

        const availInfo = getWorkerAvailability(
          data.id,
          [targetShift.date],
          availabilityRequests,
        );
        if (availInfo.level === 'red' || availInfo.level === 'yellow') {
          const worker = getWorkerById(data.id);
          setPendingDrop({
            shiftId,
            roleId,
            data,
            availLevel: availInfo.level,
            availLabel: availInfo.label,
            workerName: `${worker?.firstName || ''} ${worker?.lastName || ''}`,
            shiftDate: targetShift.date,
            roleName: targetRole.roleName,
          });
          return;
        }

        executeWorkerDrop(shiftId, roleId, data);
      }
    },
    [
      workOrders,
      checkWorkerConflict,
      getWorkerById,
      toast,
      availabilityRequests,
      executeWorkerDrop,
    ],
  );

  const confirmPendingDrop = useCallback(() => {
    if (!pendingDrop) return;
    executeWorkerDrop(
      pendingDrop.shiftId,
      pendingDrop.roleId,
      pendingDrop.data,
    );
    toast({
      title: 'Availability Warning Acknowledged',
      description: `${pendingDrop.workerName} assigned despite ${pendingDrop.availLabel.toLowerCase()}.`,
    });
    setPendingDrop(null);
  }, [pendingDrop, executeWorkerDrop, toast]);

  const cancelPendingDrop = useCallback(() => {
    setPendingDrop(null);
  }, []);

  const isShiftOpenForNotificationWorkflow = useCallback(
    (shift: Shift) => {
      if (shift.pmApprovedAt) return false;
      const effective =
        effectiveShiftStatuses[shift.id] ?? getEffectiveShiftStatus(shift);
      return (
        effective === 'ready_to_notify' || effective === 'awaiting_response'
      );
    },
    [effectiveShiftStatuses],
  );
  const isShiftReadyForNotification = useCallback(
    (shift: Shift) =>
      isShiftOpenForNotificationWorkflow(shift) &&
      hasWorkersPendingInitialNotification(shift),
    [isShiftOpenForNotificationWorkflow],
  );

  const buildRecipient = useCallback(
    (
      workerId: string,
      shiftId: string,
      action: 'assigned' | 'removed',
    ): NotificationRecipient | null => {
      const worker = getWorkerById(workerId);
      if (!worker) return null;
      for (const wo of workOrders) {
        const shift = wo.shifts.find((s) => s.id === shiftId);
        if (shift) {
          const project = getProjectById(wo.projectId);
          const role = shift.roles.find((r) =>
            r.assignedWorkers.includes(workerId),
          );
          return {
            worker,
            workOrderId: wo.id,
            shiftId: shift.id,
            roleId: role?.id || shift.roles[0]?.id || '',
            shiftDate: shift.date,
            shiftTime: `${shift.startTime}-${shift.endTime}`,
            roleStartTime:
              role?.startTime || shift.defaultRoleStartTime || shift.startTime,
            roleName: role?.roleName || shift.roles[0]?.roleName || 'Worker',
            projectName: project?.name || wo.title,
            location: (shift.address || '').trim(),
            action,
            notificationSent:
              action === 'assigned' && role
                ? hasWorkerConfirmationRequest(role, workerId)
                : false,
          };
        }
      }
      return null;
    },
    [workOrders, getWorkerById, getProjectById],
  );

  const openNotifyForWorker = useCallback(
    (workerId: string, shiftId: string, action: 'assigned' | 'removed') => {
      const targetShift = workOrders
        .flatMap((workOrder) => workOrder.shifts)
        .find((shift) => shift.id === shiftId);
      if (
        !targetShift ||
        !(action === 'assigned'
          ? isShiftReadyForNotification(targetShift)
          : isShiftOpenForNotificationWorkflow(targetShift))
      )
        return;
      const recipient = buildRecipient(workerId, shiftId, action);
      if (recipient && !(action === 'assigned' && recipient.notificationSent)) {
        setNotifyRecipients([recipient]);
        setNotifyIsBulk(false);
      }
    },
    [
      buildRecipient,
      isShiftOpenForNotificationWorkflow,
      isShiftReadyForNotification,
      workOrders,
    ],
  );

  const openBulkNotify = useCallback(() => {
    if (!focusedProjectId) return;
    const recipients: NotificationRecipient[] = [];
    const relevantWOs = workOrders.filter(
      (wo) => wo.projectId === focusedProjectId,
    );
    const project = getProjectById(focusedProjectId);

    relevantWOs.forEach((wo) => {
      (wo.shifts || []).forEach((shift) => {
        if (!isShiftReadyForNotification(shift)) return;
        (shift.roles || []).forEach((role) => {
          (role.assignedWorkers || []).forEach((wid) => {
            if (!isWorkerPendingInitialNotification(role, wid)) return;
            const worker = getWorkerById(wid);
            if (worker) {
              recipients.push({
                worker,
                workOrderId: wo.id,
                shiftId: shift.id,
                roleId: role.id,
                shiftDate: shift.date,
                shiftTime: `${shift.startTime}-${shift.endTime}`,
                roleStartTime:
                  role.startTime ||
                  shift.defaultRoleStartTime ||
                  shift.startTime,
                roleName: role.roleName,
                projectName: project?.name || wo.title,
                location: (shift.address || '').trim(),
                action: 'assigned',
                notificationSent: false,
              });
            }
          });
        });
      });
    });

    if (recipients.length === 0) {
      toast({
        title: 'No Workers to Notify',
        description:
          'Every pending worker in this project has already been notified.',
        variant: 'destructive',
      });
      return;
    }

    setNotifyRecipients(recipients);
    setNotifyIsBulk(recipients.length > 1);
  }, [
    focusedProjectId,
    workOrders,
    getProjectById,
    getWorkerById,
    isShiftReadyForNotification,
    toast,
  ]);

  const handleNotificationSent = useCallback(
    (entries: NotificationLogEntry[]) => {
      setNotificationLog((prev) => [...entries, ...prev]);
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

  const openRemindersForShift = useCallback(
    (shift: Shift, woId: string) => {
      if (!isShiftOpenForNotificationWorkflow(shift)) return;
      const wo = workOrders.find((w) => w.id === woId);
      if (!wo) return;
      const project = getProjectById(wo.projectId);
      const recipients: NotificationRecipient[] = [];
      shift.roles.forEach((role) => {
        role.assignedWorkers.forEach((wid) => {
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
      isShiftOpenForNotificationWorkflow,
      toast,
    ],
  );

  const handleClearNotificationLog = useCallback(() => {
    setNotificationLog([]);
  }, []);

  const handleRemoveWorker = useCallback(
    (shiftId: string, roleId: string, workerId: string) => {
      const targetWo = workOrders.find((wo) =>
        wo.shifts.some((s) => s.id === shiftId),
      );
      if (!targetWo) return;
      const updatedShifts = targetWo.shifts.map((s) => {
        if (s.id !== shiftId) return s;
        return {
          ...s,
          roles: s.roles.map((r) =>
            r.id !== roleId
              ? r
              : {
                  ...r,
                  assignedWorkers: r.assignedWorkers.filter(
                    (w) => w !== workerId,
                  ),
                },
          ),
        };
      });
      updateWorkOrder(targetWo.id, { shifts: updatedShifts });
      handleModifiedShifts([shiftId]);
      const worker = getWorkerById(workerId);
      toast({
        title: 'Worker Removed',
        description: `${worker?.firstName} ${worker?.lastName} removed.`,
      });
    },
    [workOrders, updateWorkOrder, getWorkerById, toast, handleModifiedShifts],
  );

  const allShiftsForPanel = useMemo(() => {
    return workOrders.flatMap((wo) =>
      wo.shifts.map((s) => ({ shift: s, workOrderId: wo.id })),
    );
  }, [workOrders]);

  const selectionStats = useMemo(() => {
    let totalRequired = 0,
      totalAssigned = 0,
      totalEquipment = 0;
    selectedShiftIds.forEach((sid) => {
      for (const wo of workOrders) {
        const shift = wo.shifts.find((s) => s.id === sid);
        if (shift) {
          shift.roles.forEach((r) => {
            totalRequired += r.requiredCount;
            totalAssigned += r.assignedWorkers.length;
          });
          totalEquipment += (shift.plannedEquipment || []).reduce(
            (total, resource) =>
              total + Math.max(0, Number(resource.estimatedQuantity) || 0),
            0,
          );
          break;
        }
      }
    });
    return { totalRequired, totalAssigned, totalEquipment };
  }, [selectedShiftIds, workOrders]);

  const selectedShiftsReadyToNotify = useMemo(() => {
    if (selectedShiftIds.size === 0) return false;
    return Array.from(selectedShiftIds).some((shiftId) =>
      workOrders.some((workOrder) =>
        workOrder.shifts.some(
          (shift) => shift.id === shiftId && isShiftReadyForNotification(shift),
        ),
      ),
    );
  }, [selectedShiftIds, workOrders, isShiftReadyForNotification]);

  const dayStats = useMemo(() => {
    if (viewMode !== 'day') return null;
    const dateStr = dayViewDate.toISOString().split('T')[0];
    return computeScheduleDashboardStats(
      timelineVisibleWorkOrders.filter((wo) => !isCancelledAssignment(wo)),
      [dateStr],
      equipment,
    );
  }, [viewMode, dayViewDate, timelineVisibleWorkOrders, equipment]);

  if (schedulerViewType === 'calendar') {
    return (
      <div className="schedule-viewport min-w-0 flex flex-col">
        <div className="flex-1 overflow-hidden">
          <SchedulerCalendarView
            onOpenNewWO={() => setShowNewOrderModal(true)}
          />
        </div>
        {}
        {showNewOrderModal && (
          <NewWorkOrderModal onClose={() => setShowNewOrderModal(false)} />
        )}
      </div>
    );
  }

  if ((isLoading || legacyAssignments.loading) && workOrders.length === 0) {
    return (
      <div className="schedule-viewport min-w-0 flex flex-col">
        <ViewTypeToolbar
          activeView={schedulerViewType}
          onChangeView={setSchedulerViewType}
        />
        <div className="flex-1 flex flex-col items-center justify-center bg-gray-50 gap-3">
          <TableLoading label="Loading schedule…" />
          <div className="text-xs text-gray-400">
            {isDbConnected
              ? 'Fetching assignments from the database'
              : 'Using cached data, reconnecting…'}
          </div>
        </div>
      </div>
    );
  }

  if (schedulerViewType === 'list') {
    return (
      <div className="schedule-viewport min-w-0 flex flex-col">
        <ViewTypeToolbar
          activeView={schedulerViewType}
          onChangeView={setSchedulerViewType}
        />
        <div className="flex-1 overflow-hidden">
          <SchedulerListView onNavigateToTimeline={handleNavigateToTimeline} />
        </div>
      </div>
    );
  }

  return (
    <div className="schedule-viewport min-w-0 flex flex-col">
      {}
      <ViewTypeToolbar
        activeView={schedulerViewType}
        onChangeView={setSchedulerViewType}
      />

      {}
      <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between flex-shrink-0 flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1">
            {viewMode !== 'day' && (
              <button
                onClick={() => navigateWeek(-4)}
                className="p-1.5 hover:bg-gray-100 rounded-lg"
              >
                <ChevronsLeft size={16} className="text-gray-500" />
              </button>
            )}
            <button
              onClick={() => navigateWeek(-1)}
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
              onClick={() => navigateWeek(1)}
              className="p-1.5 hover:bg-gray-100 rounded-lg"
            >
              <ChevronRight size={16} className="text-gray-500" />
            </button>
            {viewMode !== 'day' && (
              <button
                onClick={() => navigateWeek(4)}
                className="p-1.5 hover:bg-gray-100 rounded-lg"
              >
                <ChevronsRight size={16} className="text-gray-500" />
              </button>
            )}
          </div>
          <span className="text-sm font-medium text-primary">
            {viewMode === 'day'
              ? dayViewDate.toLocaleDateString('en-US', {
                  weekday: 'long',
                  month: 'long',
                  day: 'numeric',
                  year: 'numeric',
                })
              : weekStart.toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })}
          </span>

          {focusedProjectId &&
            (() => {
              const fp = getProjectById(focusedProjectId);
              return fp ? (
                <div className="flex items-center gap-2 ml-2 px-3 py-1 bg-purple-50 rounded-lg border border-purple-200">
                  <FolderKanban size={12} className="text-purple-600" />
                  <span className="text-xs font-medium text-purple-700 truncate max-w-[200px]">
                    {fp.name}
                  </span>
                  <button
                    onClick={handleCloseProjectDetail}
                    className="p-0.5 hover:bg-purple-100 rounded"
                  >
                    <X size={12} className="text-purple-600" />
                  </button>
                </div>
              ) : null;
            })()}
          {focusedWorkOrderId &&
            (() => {
              const fwo = workOrders.find((w) => w.id === focusedWorkOrderId);
              return fwo ? (
                <div className="flex items-center gap-2 ml-2 px-3 py-1 bg-blue-50 rounded-lg border border-blue-200">
                  <Briefcase size={12} className="text-primary" />
                  <span className="text-xs font-medium text-blue-700 truncate max-w-[220px]">
                    {fwo.title}
                  </span>
                  <button
                    onClick={() => setFocusedWorkOrderId(null)}
                    className="p-0.5 hover:bg-primary/15 rounded"
                  >
                    <X size={12} className="text-primary" />
                  </button>
                </div>
              ) : null;
            })()}

          {viewMode === 'day' && dayStats && (
            <div className="hidden sm:flex flex-wrap items-center gap-1.5 ml-2 xl:ml-4 text-xs text-gray-500 max-w-[42rem]">
              <span
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-blue-50/90 border border-blue-100"
                title="Shifts on the selected day."
              >
                <Briefcase size={12} className="text-blue-600" />
                <span className="font-semibold text-blue-800 tabular-nums">
                  {dayStats.totalShifts}
                </span>
                <span className="text-[10px] uppercase text-blue-600 font-medium">
                  total
                </span>
              </span>
              <span
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-50/90 border border-emerald-100"
                title="Shifts where every assigned worker has confirmed."
              >
                <CheckCircle2 size={12} className="text-emerald-600" />
                <span className="font-semibold text-emerald-800 tabular-nums">
                  {dayStats.shiftsAllWorkersConfirmed}
                </span>
                <span className="text-[10px] uppercase text-emerald-600 font-medium">
                  conf.
                </span>
              </span>
              <span
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-50/90 border border-amber-100"
                title="Shifts with assigned workers still missing confirmations or with declines."
              >
                <Clock size={12} className="text-amber-600" />
                <span className="font-semibold text-amber-900 tabular-nums">
                  {dayStats.shiftsWorkerConfirmationsOutstanding}
                </span>
                <span className="text-[10px] uppercase text-amber-700 font-medium">
                  pend.
                </span>
              </span>
              <span
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border tabular-nums ${
                  dayStats.missingWorkerSlots > 0
                    ? 'bg-orange-50 border-orange-200'
                    : 'bg-slate-50 border-slate-100'
                }`}
                title="Open headcount (required minus assigned)."
              >
                <UserX
                  size={12}
                  className={
                    dayStats.missingWorkerSlots > 0
                      ? 'text-orange-600'
                      : 'text-slate-400'
                  }
                />
                <span
                  className={`font-semibold ${dayStats.missingWorkerSlots > 0 ? 'text-orange-800' : 'text-slate-600'}`}
                >
                  {dayStats.missingWorkerSlots}
                </span>
                <span className="text-[10px] uppercase text-slate-500 font-medium">
                  miss.
                </span>
              </span>
              <span
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border ${
                  dayStats.awaitingWorkerResponses > 0
                    ? 'bg-violet-50 border-violet-200'
                    : 'bg-slate-50 border-slate-100'
                }`}
                title="Assignments waiting for worker confirmation replies."
              >
                <MessageSquareQuote
                  size={12}
                  className={
                    dayStats.awaitingWorkerResponses > 0
                      ? 'text-violet-600'
                      : 'text-slate-400'
                  }
                />
                <span
                  className={`font-semibold tabular-nums ${dayStats.awaitingWorkerResponses > 0 ? 'text-violet-900' : 'text-slate-600'}`}
                >
                  {dayStats.awaitingWorkerResponses}
                </span>
                <span className="text-[10px] uppercase text-slate-500 font-medium">
                  await
                </span>
              </span>
              <span
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border ${
                  dayStats.equipmentIssueSlots > 0
                    ? 'bg-rose-50 border-rose-200'
                    : 'bg-slate-50 border-slate-100'
                }`}
                title="Assigned equipment in Maintenance or Retired."
              >
                <Wrench
                  size={12}
                  className={
                    dayStats.equipmentIssueSlots > 0
                      ? 'text-rose-600'
                      : 'text-slate-400'
                  }
                />
                <span
                  className={`font-semibold tabular-nums ${dayStats.equipmentIssueSlots > 0 ? 'text-rose-900' : 'text-slate-600'}`}
                >
                  {dayStats.equipmentIssueSlots}
                </span>
                <span className="text-[10px] uppercase text-slate-500 font-medium">
                  equip.
                </span>
              </span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-50/70 border border-emerald-100/80 ml-1">
                <Users size={12} className="text-emerald-600" />
                <span
                  className={`font-semibold ${dayStats.totalWorkers < dayStats.totalRequired ? 'text-red-600' : 'text-green-600'}`}
                >
                  {dayStats.totalWorkers}/{dayStats.totalRequired}
                </span>
              </span>
              <span className="hidden md:inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-purple-50/70 border border-purple-100">
                <Users size={12} className="text-purple-600" />
                <span className="font-semibold text-purple-800 tabular-nums">
                  {dayStats.uniqueWorkers}
                </span>
                <span className="text-[10px] uppercase text-purple-600 font-medium">
                  uniq.
                </span>
              </span>
              {selectedShiftIds.size > 0 && (
                <div className="flex items-center gap-2 px-3 py-1 bg-blue-50 rounded-lg border border-blue-200">
                  <span className="text-xs font-medium text-blue-700">
                    {selectedShiftIds.size} shift
                    {selectedShiftIds.size > 1 ? 's' : ''} selected
                  </span>
                  <span className="text-xs text-blue-500">
                    ({selectionStats.totalAssigned}/
                    {selectionStats.totalRequired})
                  </span>
                  <button
                    onClick={handleClearSelection}
                    className="p-0.5 hover:bg-primary/15 rounded"
                  >
                    <X size={12} className="text-primary" />
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center bg-gray-100 rounded-lg px-3 py-1.5">
            <Search size={14} className="text-gray-400 mr-2" />
            <input
              placeholder="Search..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-transparent text-sm outline-none w-40 placeholder-gray-400"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="p-0.5 hover:bg-gray-200 rounded"
              >
                <X size={12} className="text-gray-400" />
              </button>
            )}
          </div>

          <select
            value={viewMode}
            onChange={(e) => setViewMode(e.target.value as any)}
            className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white"
          >
            <option value="day">Day</option>
            <option value="1week">1 Week</option>
            <option value="2week">2 Weeks</option>
          </select>

          <button
            onClick={() => setFilterOpen(!filterOpen)}
            className={`p-1.5 rounded-lg border ${filterOpen ? 'bg-blue-50 border-blue-200' : 'border-gray-200 hover:bg-gray-100'}`}
          >
            <Filter
              size={16}
              className={filterOpen ? 'text-primary' : 'text-gray-500'}
            />
          </button>

          <button
            onClick={goToToday}
            className="p-1.5 hover:bg-gray-100 rounded-lg border border-gray-200"
            title="Refresh"
          >
            <RefreshCw size={16} className="text-gray-500" />
          </button>

          <button
            onClick={() => setShowResourcePanel(!showResourcePanel)}
            className={`p-1.5 rounded-lg border flex items-center gap-1 ${showResourcePanel ? 'bg-blue-50 border-blue-200' : 'border-gray-200 hover:bg-gray-100'}`}
          >
            <Users
              size={16}
              className={showResourcePanel ? 'text-primary' : 'text-gray-500'}
            />
          </button>

          {}
          <button
            onClick={() => setShowNewOrderModal(true)}
            className="px-3 py-1.5 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 flex items-center gap-1.5 shadow-sm transition-all"
            title="Add new assignment"
          >
            <Plus size={14} />
            New Assignment
          </button>

          {}
          {focusedProjectId && (
            <button
              onClick={openBulkNotify}
              className="px-3 py-1.5 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 flex items-center gap-1.5 shadow-sm transition-all"
              title="Notify workers still pending confirmation on this project"
            >
              <Send size={14} />
              Notify All
            </button>
          )}

          {}
          {selectedShiftIds.size > 0 && !focusedProjectId && (
            <button
              disabled={!selectedShiftsReadyToNotify}
              onClick={() => {
                if (!selectedShiftsReadyToNotify) return;
                const recipients: typeof notifyRecipients = [];
                selectedShiftIds.forEach((sid) => {
                  for (const wo of workOrders) {
                    const shift = wo.shifts.find((s) => s.id === sid);
                    if (shift) {
                      if (!isShiftReadyForNotification(shift)) break;
                      const project = getProjectById(wo.projectId);
                      shift.roles.forEach((role) => {
                        role.assignedWorkers.forEach((wid) => {
                          if (!isWorkerPendingInitialNotification(role, wid))
                            return;
                          const worker = getWorkerById(wid);
                          if (worker) {
                            recipients.push({
                              worker,
                              workOrderId: wo.id,
                              shiftId: shift.id,
                              roleId: role.id,
                              shiftDate: shift.date,
                              shiftTime: `${shift.startTime}-${shift.endTime}`,
                              roleStartTime:
                                role.startTime ||
                                shift.defaultRoleStartTime ||
                                shift.startTime,
                              roleName: role.roleName,
                              projectName: project?.name || wo.title,
                              location: (shift.address || '').trim(),
                              action: 'assigned' as const,
                              notificationSent: false,
                            });
                          }
                        });
                      });
                      break;
                    }
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
              }}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium flex items-center gap-1.5 transition-all ${
                selectedShiftsReadyToNotify
                  ? 'text-white bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 shadow-sm'
                  : 'border border-gray-200 bg-gray-100 text-gray-400 cursor-not-allowed'
              }`}
              title={
                selectedShiftsReadyToNotify
                  ? 'Notify workers still pending confirmation in selected shifts'
                  : 'The selected shifts do not have workers pending an initial notification'
              }
            >
              <Bell size={14} />
              Notify
            </button>
          )}

          <button
            onClick={() => setShowNotificationLog(true)}
            className={`p-1.5 rounded-lg border relative flex items-center gap-1 ${
              notificationLog.length > 0
                ? 'border-indigo-200 bg-indigo-50'
                : 'border-gray-200 hover:bg-gray-100'
            }`}
            title="Notification Log"
          >
            <MessageSquare
              size={16}
              className={
                notificationLog.length > 0 ? 'text-indigo-600' : 'text-gray-500'
              }
            />
            {notificationLog.length > 0 && (
              <span className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-indigo-600 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                {notificationLog.length > 99 ? '99' : notificationLog.length}
              </span>
            )}
          </button>
        </div>
      </div>

      {}
      {showTips && !focusedProjectId && (
        <div className="bg-gradient-to-r from-indigo-50 to-blue-50 border-b border-indigo-100 px-4 py-2 flex items-center justify-between flex-shrink-0 flex-wrap gap-3">
          <div className="flex items-center gap-4 text-xs text-indigo-700">
            <div className="flex items-center gap-1.5">
              <Keyboard size={14} />
              <span className="font-medium">Tips:</span>
            </div>
            <span>Click shifts to select</span>
            <span className="text-indigo-300">|</span>
            <span>
              <kbd className="px-1 py-0.5 bg-indigo-100 rounded font-mono text-indigo-800">
                Cmd
              </kbd>{' '}
              + click for multi-select
            </span>
            <span className="text-indigo-300">|</span>
            <span>Click empty cell to add shift</span>
            <span className="text-indigo-300">|</span>
            <span>Click project name to view worker calendar</span>
          </div>
          <button
            onClick={() => setShowTips(false)}
            className="p-1 hover:bg-indigo-100 rounded"
          >
            <X size={14} className="text-indigo-400" />
          </button>
        </div>
      )}

      {}
      {filterOpen && (
        <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-4 flex-shrink-0">
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-600">Project:</label>
            <select
              value={selectedProject || ''}
              onChange={(e) => setSelectedProject(e.target.value || null)}
              className="text-sm border border-gray-200 rounded px-2 py-1"
            >
              <option value="">All Projects</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.number} - {p.name}
                </option>
              ))}
            </select>
          </div>
          <button
            onClick={() => {
              setSelectedProject(null);
              setFocusedWorkOrderId(null);
              setFilterOpen(false);
            }}
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            Clear
          </button>
        </div>
      )}

      {}
      <div className="min-w-0 min-h-0 flex-1 flex flex-col lg:flex-row lg:overflow-hidden">
        {}
        <div className="w-full max-h-64 lg:max-h-none lg:w-80 border-r-2 border-gray-300 overflow-y-auto hide-scrollbar bg-gray-50 flex-shrink-0 shadow-[inset_-1px_0_0_rgba(17,24,39,0.08)]">
          {activeWorkOrders.map((wo) => {
            const project = getProjectById(wo.projectId);
            const client = project
              ? getClientById(project.clientId)
              : undefined;
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
            const isFull = totalAssigned >= totalRequired;
            const isFocused = focusedProjectId === wo.projectId;
            const isSelectedWO = focusedWorkOrderId === wo.id;

            return (
              <div
                key={wo.id}
                className={`border-b border-gray-200 ${isFocused ? 'bg-purple-50/50' : ''} ${isSelectedWO ? 'bg-blue-50/60' : ''}`}
              >
                <button
                  onClick={() => {
                    toggleExpand(wo.id);
                    setFocusedWorkOrderId((prev) =>
                      prev === wo.id ? null : wo.id,
                    );
                  }}
                  className="w-full px-3 py-2.5 flex items-center gap-2 hover:bg-white text-left"
                >
                  {isExpanded ? (
                    <ChevronDown size={14} className="text-gray-400" />
                  ) : (
                    <ChevronRight size={14} className="text-gray-400" />
                  )}
                  <div className="h-2 w-2 shrink-0 rounded-full bg-gray-400" />
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium text-gray-800 truncate block">
                      {project?.name || wo.title}
                    </span>
                    <span className="text-xs text-gray-500 truncate block">
                      {wo.title}
                    </span>
                    {wo.orderNumber && (
                      <span className="text-xs text-gray-400 font-mono">
                        {wo.orderNumber}
                      </span>
                    )}
                    <span className="text-[10px] text-indigo-700 bg-indigo-50 border border-indigo-200 rounded px-1.5 py-0.5 inline-block mt-0.5">
                      {wo.workOrderTypeId
                        ? workOrderTypeNameById.get(wo.workOrderTypeId) ||
                          'Unknown type'
                        : 'Unspecified'}
                    </span>
                  </div>
                  <span
                    className={`text-xs font-bold flex-shrink-0 ${isFull ? 'text-green-600' : 'text-red-600'}`}
                  >
                    {totalAssigned}/{totalRequired}
                  </span>
                </button>

                {isExpanded && (
                  <div className="px-4 pb-3 space-y-1.5">
                    <div className="flex flex-col gap-1.5">
                      <span className="w-fit max-w-[220px] rounded border border-gray-200 bg-gray-50 px-2 py-0.5 text-xs font-medium text-gray-700 tabular-nums">
                        {formatAssignmentDateRangeShort(wo)}
                      </span>
                      <div className="flex items-center gap-2 flex-wrap">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            openEditWOModal(wo);
                          }}
                          className="text-xs bg-blue-50 px-2 py-0.5 rounded text-blue-600 hover:bg-blue-100 flex items-center gap-1"
                        >
                          <Edit2 size={10} /> Edit
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            void handleDuplicateWO(wo);
                          }}
                          className="text-xs bg-emerald-50 px-2 py-0.5 rounded text-emerald-700 hover:bg-emerald-100 flex items-center gap-1"
                        >
                          <Copy size={10} /> Duplicate
                        </button>
                        <button
                          disabled={
                            copyingWeek !== null || isCancelledAssignment(wo)
                          }
                          onClick={(event) => {
                            event.stopPropagation();
                            void handleCopyWeek(wo);
                          }}
                          className="text-xs bg-emerald-50 px-2 py-0.5 rounded text-emerald-700 disabled:opacity-50"
                        >
                          {copyingWeek === wo.id ? 'Copying...' : 'Copy week'}
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleProjectClick(wo.projectId);
                          }}
                          className={`text-xs px-2 py-0.5 rounded flex items-center gap-1 border ${isFocused ? 'bg-purple-100 text-purple-700 border-purple-300' : 'bg-purple-50 text-purple-600 border-purple-200 hover:bg-purple-100'}`}
                        >
                          <Eye size={10} /> Project
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setCurrentPage('workers');
                          }}
                          className="text-xs bg-green-50 px-2 py-0.5 rounded text-green-600 hover:bg-green-100 flex items-center gap-1"
                        >
                          <UserPlus size={10} /> Workers
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleAssignmentDeleteRequest(
                              wo,
                              project?.name || wo.title,
                            );
                          }}
                          className="text-xs bg-red-50 px-2 py-0.5 rounded text-red-600 hover:bg-red-100 flex items-center gap-1"
                        >
                          <Trash2 size={10} /> Delete
                        </button>
                      </div>
                    </div>
                    <div className="grid grid-cols-[80px_1fr] gap-y-1 text-xs">
                      <span className="text-gray-500 font-medium">Project</span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleProjectClick(wo.projectId);
                        }}
                        className="text-purple-600 hover:text-purple-700 hover:underline text-left flex items-center gap-1 font-medium"
                      >
                        {project?.name || '-'}
                        <Eye size={10} />
                      </button>
                      {project?.number && (
                        <>
                          <span className="text-gray-500 font-medium">
                            Project #
                          </span>
                          <span className="text-gray-700 font-mono">
                            {project.number}
                          </span>
                        </>
                      )}
                      {wo.orderNumber && (
                        <>
                          <span className="text-gray-500 font-medium">
                            Order #
                          </span>
                          <span className="text-gray-700 font-mono">
                            {wo.orderNumber}
                          </span>
                        </>
                      )}
                      <span className="text-gray-500 font-medium">Type</span>
                      <span className="text-gray-700">
                        {wo.workOrderTypeId
                          ? workOrderTypeNameById.get(wo.workOrderTypeId) ||
                            'Unknown type'
                          : 'Unspecified'}
                      </span>
                      <span className="text-gray-500 font-medium">Client</span>
                      <span className="text-gray-700">
                        {client?.name || '-'}
                      </span>
                      <span className="text-gray-500 font-medium">
                        Location
                      </span>
                      <span className="text-gray-700">
                        {project?.location}, {project?.city}
                      </span>
                    </div>
                    {wo.notes && (
                      <p className="text-xs text-gray-500 mt-1 italic">
                        {wo.notes}
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          {activeWorkOrders.length === 0 && (
            <div className="p-8 text-center">
              <p className="text-sm text-gray-500">No active assignments</p>
            </div>
          )}
        </div>

        {}
        {focusedProjectId ? (
          <div className="flex-1 overflow-hidden">
            <ProjectCalendarCenter
              projectId={focusedProjectId}
              onClose={handleCloseProjectDetail}
              onNavigateToDate={(date) => {
                navigateToDate(date);
                setFocusedProjectId(null);
              }}
            />
          </div>
        ) : (
          <div
            className="min-w-0 min-h-80 lg:min-h-0 flex-1 overflow-auto hide-scrollbar"
            onClick={handleClearSelection}
          >
            {}
            <div className="sticky top-0 z-10 bg-white border-b border-gray-200 flex">
              {days.map((d, i) => {
                const isToday = d.toDateString() === todayDate.toDateString();
                const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                return (
                  <div
                    key={i}
                    className={`${viewMode === 'day' ? 'flex-1' : 'flex-1 min-w-[140px]'} text-center py-2.5 border-r border-gray-100 ${isToday ? 'bg-blue-50' : isWeekend ? 'bg-gray-50' : ''}`}
                  >
                    <p
                      className={`text-xs font-semibold ${isToday ? 'text-primary' : isWeekend ? 'text-gray-400' : 'text-gray-600'}`}
                    >
                      {viewMode === 'day'
                        ? d.toLocaleDateString('en-US', {
                            weekday: 'long',
                            month: 'long',
                            day: 'numeric',
                          })
                        : formatDayHeader(d)}
                    </p>
                    {viewMode !== 'day' && (
                      <p className="text-xs text-gray-400">
                        {d.toLocaleDateString('en-US', { month: 'short' })}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>

            {}
            {timelineVisibleWorkOrders.map((wo) => {
              const project = getProjectById(wo.projectId);
              return (
                <div key={wo.id} className="border-b border-gray-200">
                  <div className="h-1 bg-gray-200" />

                  {viewMode === 'day' && (
                    <div className="px-3 py-1.5 bg-gray-50 border-b border-gray-100 flex items-center justify-between flex-wrap gap-3">
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-2 shrink-0 rounded-full bg-gray-400" />
                        <div className="min-w-0">
                          <button
                            onClick={() => handleProjectClick(wo.projectId)}
                            className="text-xs font-semibold text-gray-800 hover:text-purple-600 truncate block text-left"
                          >
                            {project?.name || wo.title}
                          </button>
                          <span className="text-[10px] text-gray-500 truncate block">
                            {wo.title}
                          </span>
                        </div>
                        {wo.orderNumber && (
                          <span className="text-xs text-gray-400 font-mono">
                            {wo.orderNumber}
                          </span>
                        )}
                        <span className="text-[10px] text-indigo-700 bg-indigo-50 border border-indigo-200 rounded px-1.5 py-0.5">
                          {wo.workOrderTypeId
                            ? workOrderTypeNameById.get(wo.workOrderTypeId) ||
                              'Unknown type'
                            : 'Unspecified'}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-400">
                          {project?.city}
                        </span>
                        <span className="rounded border border-gray-200 bg-gray-50 px-1.5 py-0.5 text-xs font-medium text-gray-700 tabular-nums">
                          {formatAssignmentDateRangeShort(wo)}
                        </span>
                      </div>
                    </div>
                  )}

                  <div className="flex">
                    {days.map((d, di) => {
                      const shift = getShiftForDay(wo, d);
                      const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                      const isCancelled = isCancelledAssignment(wo);
                      const isModified = shift
                        ? modifiedShiftIds.has(shift.id)
                        : false;

                      if (shift) {
                        return (
                          <div
                            key={di}
                            className={`${viewMode === 'day' ? 'flex-1' : 'flex-1 min-w-[140px]'} relative`}
                          >
                            {isModified && (
                              <div className="absolute top-0 left-0 right-0 h-1 bg-green-500 animate-pulse z-10 rounded-t" />
                            )}
                            <ShiftCell
                              shift={shift}
                              workOrderId={wo.id}
                              isSelected={selectedShiftIds.has(shift.id)}
                              isWeekend={isWeekend}
                              isNewlyCreated={isModified}
                              draggingWorker={draggingWorker}
                              onSelect={handleShiftSelect}
                              onDrop={handleDrop}
                              onRemoveWorker={handleRemoveWorker}
                              onEditShift={handleEditShift}
                              onAddShiftSameDay={handleAddShiftSameDay}
                              onCopyShift={handleCopyShift}
                              onPasteShift={handlePasteShift}
                              onDuplicateToNextDay={handleDuplicateToNextDay}
                              onDuplicateToWeekDays={handleDuplicateToWeekDays}
                              onClearShift={handleClearShift}
                              hasClipboard={!!shiftClipboard}
                              onShiftDragCopy={handleShiftDragCopy}
                              onOpenShiftDetails={(shiftId, workOrderId) => {
                                const w = workOrders.find(
                                  (x) => x.id === workOrderId,
                                );
                                const s = w?.shifts.find(
                                  (sh) => sh.id === shiftId,
                                );
                                if (s)
                                  setShiftDetailsPanel({
                                    shift: s,
                                    woId: workOrderId,
                                  });
                              }}
                              effectiveStatus={
                                effectiveShiftStatuses[shift.id] === undefined
                                  ? undefined
                                  : (effectiveShiftStatuses[
                                      shift.id
                                    ] as import('./shiftConfirmation').EffectiveShiftStatus)
                              }
                            />
                          </div>
                        );
                      }

                      const emptyCellKey = `${wo.id}_${d.toISOString().split('T')[0]}`;
                      const isEmptyDragOver =
                        dragOverEmptyCell === emptyCellKey;

                      return (
                        <div
                          key={di}
                          className={`${viewMode === 'day' ? 'flex-1' : 'flex-1 min-w-[140px]'} border-r border-gray-100 p-1.5 transition-all cursor-pointer ${
                            isCancelled
                              ? 'bg-red-50/40 cursor-not-allowed'
                              : isEmptyDragOver
                                ? 'bg-blue-100/60 ring-2 ring-inset ring-dashed ring-blue-400'
                                : isWeekend
                                  ? 'bg-gray-50/50'
                                  : 'hover:bg-primary/10/30'
                          } group/empty`}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleEmptyCellClick(d, wo.id);
                          }}
                          onDragOver={(e) => {
                            if (isCancelled) return;
                            e.preventDefault();
                            e.stopPropagation();
                            e.dataTransfer.dropEffect = 'copy';
                            setDragOverEmptyCell(emptyCellKey);
                          }}
                          onDragLeave={(e) => {
                            e.preventDefault();

                            const rect = (
                              e.currentTarget as HTMLElement
                            ).getBoundingClientRect();
                            const { clientX, clientY } = e;
                            if (
                              clientX < rect.left ||
                              clientX > rect.right ||
                              clientY < rect.top ||
                              clientY > rect.bottom
                            ) {
                              setDragOverEmptyCell(null);
                            }
                          }}
                          onDrop={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setDragOverEmptyCell(null);
                            if (isCancelled) return;
                            try {
                              const rawData =
                                e.dataTransfer.getData('application/json');
                              if (rawData) {
                                const data = JSON.parse(rawData);
                                if (data.type === 'shift_copy') {
                                  const dateStr = d.toISOString().split('T')[0];
                                  handlePasteShift(dateStr, wo.id);
                                }
                              }
                            } catch (err) {
                              console.error('Empty cell drop error:', err);
                            }
                          }}
                        >
                          <div className="h-full min-h-[40px] flex items-center justify-center">
                            {isEmptyDragOver ? (
                              <div className="flex flex-col items-center gap-1 text-blue-500 animate-pulse">
                                <div className="w-8 h-8 rounded-lg border-2 border-dashed border-blue-400 flex items-center justify-center">
                                  <Plus size={16} className="text-blue-500" />
                                </div>
                                <span className="text-xs font-medium">
                                  Drop to paste
                                </span>
                              </div>
                            ) : isCancelled ? (
                              <div className="text-xs font-medium text-red-400">
                                Cancelled
                              </div>
                            ) : (
                              <div className="opacity-0 group-hover/empty:opacity-100 transition-opacity flex items-center gap-1 text-xs text-blue-400">
                                <Plus size={12} />
                                <span>
                                  {shiftClipboard ? 'Paste Shift' : 'Add Shift'}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {showResourcePanel && (
          <ResourcePanel
            selectedShiftIds={selectedShiftIds}
            allShifts={allShiftsForPanel}
            onClose={() => setShowResourcePanel(false)}
            focusedProjectId={focusedProjectId}
            onWorkerDragStart={handleWorkerDragStart}
            onWorkerDragEnd={handleWorkerDragEnd}
          />
        )}
      </div>

      {}
      <BulkActionBar
        selectedShiftIds={selectedShiftIds}
        onClearSelection={handleClearSelection}
        onModifiedShifts={handleModifiedShifts}
      />

      {}
      {showNewOrderModal && (
        <NewWorkOrderModal onClose={() => setShowNewOrderModal(false)} />
      )}

      {}
      {editingShift && (
        <EditShiftModal
          shiftId={editingShift.shiftId}
          workOrderId={editingShift.workOrderId}
          effectiveStatus={
            effectiveShiftStatuses[editingShift.shiftId] as
              | import('./shiftConfirmation').EffectiveShiftStatus
              | undefined
          }
          onCancelled={() =>
            setSelectedShiftIds((current) => {
              const next = new Set(current);
              next.delete(editingShift.shiftId);
              return next;
            })
          }
          onClose={() => setEditingShift(null)}
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
            Boolean(shiftDetailsPanel!.shift.pmApprovedAt))
        }
        onEditShift={() => {
          if (!shiftDetailsPanel) return;
          const { shift: sh, woId } = shiftDetailsPanel;
          setShiftDetailsPanel(null);
          handleEditShift(sh.id, woId);
        }}
        onSendReminders={() => {
          if (!shiftDetailsPanel) return;
          openRemindersForShift(
            shiftDetailsPanel.shift,
            shiftDetailsPanel.woId,
          );
        }}
      />

      {}
      {quickAddShift && (
        <QuickAddShiftModal
          date={quickAddShift.date}
          workOrderId={quickAddShift.workOrderId}
          onClose={() => setQuickAddShift(null)}
        />
      )}

      {}
      {pendingDrop && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-2 sm:p-4">
          <div
            className="bg-white rounded-xl w-full max-w-sm shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-5">
              <div className="flex items-start gap-3 mb-4">
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                    pendingDrop.availLevel === 'red'
                      ? 'bg-red-100'
                      : 'bg-yellow-100'
                  }`}
                >
                  <AlertTriangle
                    size={20}
                    className={
                      pendingDrop.availLevel === 'red'
                        ? 'text-red-600'
                        : 'text-yellow-600'
                    }
                  />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-gray-800">
                    Availability Warning
                  </h3>
                  <p className="text-xs text-gray-600 mt-1">
                    <strong>{pendingDrop.workerName}</strong> has{' '}
                    <span
                      className={
                        pendingDrop.availLevel === 'red'
                          ? 'text-red-600 font-medium'
                          : 'text-yellow-600 font-medium'
                      }
                    >
                      {pendingDrop.availLabel.toLowerCase()}
                    </span>{' '}
                    on {pendingDrop.shiftDate}.
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    Assigning to <strong>{pendingDrop.roleName}</strong> role.
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={cancelPendingDrop}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmPendingDrop}
                  className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium text-white ${
                    pendingDrop.availLevel === 'red'
                      ? 'bg-red-600 hover:bg-red-700'
                      : 'bg-yellow-600 hover:bg-yellow-700'
                  }`}
                >
                  Assign Anyway
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {}
      {notifyRecipients.length > 0 && (
        <NotifyWorkerModal
          recipients={notifyRecipients}
          onClose={() => setNotifyRecipients([])}
          onNotificationSent={handleNotificationSent}
          isBulk={notifyIsBulk}
        />
      )}

      {}
      {showNotificationLog && (
        <NotificationLog
          entries={notificationLog}
          onClose={() => setShowNotificationLog(false)}
          onClear={handleClearNotificationLog}
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
                id="sched-edit-assignment-address"
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
                onClick={() => setEditingWO(null)}
                className="px-4 py-2 text-sm border border-gray-200 rounded-xl text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
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
    </div>
  );
};

const ViewTypeToolbar: React.FC<{
  activeView: SchedulerViewType;
  onChangeView: (view: SchedulerViewType) => void;
}> = ({ activeView, onChangeView }) => (
  <div className="bg-gradient-to-r from-gray-800 to-gray-900 px-4 py-2 flex items-center justify-between flex-shrink-0 flex-wrap gap-3">
    <div className="flex items-center gap-2">
      <CalendarDays size={18} className="text-primary/70" />
      <h2 className="text-sm font-semibold text-white">Schedule</h2>
    </div>
    <div className="flex items-center bg-gray-700/50 rounded-lg p-0.5">
      {[
        {
          key: 'calendar' as SchedulerViewType,
          label: 'Calendar',
          icon: CalendarDays,
        },
        {
          key: 'timeline' as SchedulerViewType,
          label: 'Timeline',
          icon: Columns3,
        },
        { key: 'list' as SchedulerViewType, label: 'List', icon: LayoutList },
      ].map((v) => (
        <button
          key={v.key}
          onClick={() => onChangeView(v.key)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
            activeView === v.key
              ? 'bg-primary text-primary-foreground shadow-lg'
              : 'text-gray-400 hover:text-white hover:bg-gray-600/50'
          }`}
        >
          <v.icon size={13} />
          {v.label}
        </button>
      ))}
    </div>
    <div className="w-20" /> {}
  </div>
);

const EditShiftModal: React.FC<{
  shiftId: string;
  workOrderId: string;
  effectiveStatus?: import('./shiftConfirmation').EffectiveShiftStatus;
  onCancelled?: () => void;
  onClose: () => void;
}> = ({ shiftId, workOrderId, effectiveStatus, onCancelled, onClose }) => {
  const {
    workOrders,
    shifts: shiftCatalog,
    workerRoles,
    certifications,
    formTemplates,
    updateWorkOrder,
    getProjectById,
    getWorkerById,
  } = useAppContext();
  const { toast } = useToast();
  const wo = workOrders.find((w) => w.id === workOrderId);
  const shift = wo?.shifts.find((s) => s.id === shiftId);
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
    shift?.roles.map((r) => ({
      ...r,
      startTime: r.startTime || shift.defaultRoleStartTime || shift.startTime,
      requiredCertificationIds: [...getRoleRequiredCertificationIds(r)],
      requiredSkillIds: [...(r.requiredSkillIds || [])],
    })) || [],
  );
  const [shiftTemplateId, setShiftTemplateId] = useState(
    shift?.shiftTemplateId || '',
  );
  const [defaultRoleStartTime, setDefaultRoleStartTime] = useState(
    shift?.defaultRoleStartTime || shift?.startTime || '',
  );
  const [shiftName, setShiftName] = useState(shift?.shiftName || '');
  const [activeTab, setActiveTab] = useState<'overview' | 'details'>(
    'overview',
  );
  const [shiftStatus, setShiftStatus] = useState(
    shift?.cancelled ? 'shift_cancelled' : shift?.status || '',
  );
  const [createdByUserId, setCreatedByUserId] = useState(
    shift?.createdByUserId || '',
  );
  const [shiftAddress, setShiftAddress] = useState(shift?.address || '');
  const [crossStreetLocationDetail, setCrossStreetLocationDetail] = useState(
    shift?.crossStreetLocationDetail || '',
  );
  const [shiftRequesterName, setShiftRequesterName] = useState(
    shift?.requesterName || wo?.requesterName || '',
  );
  const [shiftRequesterPhone, setShiftRequesterPhone] = useState(
    shift?.requesterPhone || '',
  );
  const [shiftRequesterEmail, setShiftRequesterEmail] = useState(
    shift?.requesterEmail || '',
  );
  const [visibleDocumentTypes, setVisibleDocumentTypes] = useState<string[]>(
    shift?.visibleDocumentTypes || [],
  );
  const [formTemplateIds, setFormTemplateIds] = useState<string[]>(
    shift?.formTemplateIds || [],
  );
  const [workOrderTypes] = useState<string[]>(shift?.workOrderTypes || []);
  const [shiftNotes, setShiftNotes] = useState(shift?.notes || '');
  const [shiftAddressValue, setShiftAddressValue] = useState(() => ({
    ...emptyShiftAddress(shift?.address || ''),
    latitude: shift?.addressLatitude ?? null,
    longitude: shift?.addressLongitude ?? null,
    assignmentCity: shift?.addressCity || '',
    assignmentState: shift?.addressState || '',
    assignmentZipCode: shift?.addressZipCode || '',
    assignmentCountry: shift?.addressCountry || DEFAULT_ASSIGNMENT_COUNTRY,
  }));
  if (!wo || !shift) return null;
  const selectedTemplate = activeShiftTemplates.find(
    (item) => item.id === shiftTemplateId,
  );
  const applyStartTimeToRoles = (nextStartTime: string) => {
    setDefaultRoleStartTime(nextStartTime);
    setRoles((prev) =>
      prev.map((role) => ({ ...role, startTime: nextStartTime })),
    );
  };

  const handleSave = async () => {
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
    const isNewCancellation = wantsCancellation && !shift.cancelled;
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

    const normalizedShiftName = shiftName.trim();
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
    const roleStartTimes = roles
      .map((r) => r.startTime || shift.startTime)
      .sort();
    const nextStartTime = roleStartTimes[0] || shift.startTime;
    const nextEndTime = addMinutesToTime(
      nextStartTime,
      getShiftTemplateDurationMinutes(selectedTemplate),
    );
    const updatedShifts = wo.shifts.map((s) => {
      if (s.id !== shiftId) return s;
      return reactivateCancelledShiftWithManualStatus(
        s,
        {
          ...s,
          shiftName: normalizedShiftName,
          status: wantsCancellation
            ? s.status
            : shift.cancelled && !shiftStatus
              ? shift.status
              : shiftStatus,
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
          workOrderTypes,
          notes: shiftNotes || undefined,
          shiftTemplateId: shiftTemplateId || undefined,
          defaultRoleStartTime,
          startTime: nextStartTime,
          endTime: nextEndTime,
          roles: normalizedRoles,
        },
        shiftStatus,
      );
    });
    try {
      await updateWorkOrder(workOrderId, { shifts: updatedShifts });
      if (isNewCancellation) {
        await cancelShift({ workOrderId, shiftId });
        await updateWorkOrder(workOrderId, {
          shifts: updatedShifts.map((item) =>
            item.id === shiftId ? { ...item, cancelled: true } : item,
          ),
        });
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
          message: `Hi ${worker.firstName}, you have been removed from the shift at ${project?.name || wo.title} on ${shift.date} (${nextStartTime}-${nextEndTime}). Please contact dispatch with any questions.`,
        });
      }),
    );
    toast(
      isNewCancellation
        ? {
            title: 'Shift Cancelled',
            description: 'Assigned workers were notified automatically.',
          }
        : {
            title: 'Shift Updated',
            description: `Shift on ${shift.date} updated successfully.`,
          },
    );
    if (isNewCancellation) onCancelled?.();
    onClose();
  };

  const handleDelete = async () => {
    const updatedShifts = wo.shifts.filter((s) => s.id !== shiftId);
    try {
      await updateWorkOrder(workOrderId, { shifts: updatedShifts });
      toast({
        title: 'Shift Deleted',
        description: `Shift on ${shift.date} was removed.`,
      });
      onClose();
    } catch (error) {
      toast({
        title: 'Unable to delete shift',
        description:
          error instanceof Error ? error.message : 'Please try again.',
        variant: 'destructive',
      });
    }
  };

  const addRole = () => {
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
    setRoles((prev) => prev.filter((_, i) => i !== idx));
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-2 sm:p-4">
      <div
        className="bg-white rounded-xl w-full max-w-md max-h-[90dvh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-5 border-b border-gray-200 flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-lg font-semibold text-gray-800">Edit Shift</h2>
            <p className="text-xs text-gray-500">
              {project?.name} -{' '}
              {new Date(shift.date + 'T12:00:00').toLocaleDateString('en-US', {
                weekday: 'long',
                month: 'long',
                day: 'numeric',
              })}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 rounded-lg"
          >
            <X size={18} className="text-gray-400" />
          </button>
        </div>
        <div className="flex border-b px-5">
          <button
            onClick={() => setActiveTab('overview')}
            className={`flex-1 py-3 text-sm ${activeTab === 'overview' ? 'border-b-2 border-primary font-semibold text-primary' : 'text-gray-500'}`}
          >
            Overview
          </button>
          <button
            onClick={() => setActiveTab('details')}
            className={`flex-1 py-3 text-sm ${activeTab === 'details' ? 'border-b-2 border-primary font-semibold text-primary' : 'text-gray-500'}`}
          >
            Details & Roles
          </button>
        </div>
        {activeTab === 'overview' && (
          <div>
            <div className="px-5 pt-5">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Shift Name
              </label>
              <input
                type="text"
                value={shiftName}
                onChange={(event) => setShiftName(event.target.value)}
                placeholder="Enter shift name"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <ShiftOverviewTab
              formsSelection={
                <ShiftFormTemplatesPicker
                  idAttr="scheduler-edit-shift-form-templates"
                  formTemplates={formTemplates}
                  value={formTemplateIds}
                  onChange={setFormTemplateIds}
                />
              }
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
        <div
          className={`p-5 space-y-4 ${activeTab === 'details' ? '' : 'hidden'}`}
        >
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
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
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
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
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Start Time
              </label>
              <input
                type="time"
                value={defaultRoleStartTime}
                onChange={(e) => applyStartTimeToRoles(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              />
              <p className="mt-1 text-xs text-gray-500">
                Changing this updates all role start times. Each role can still
                be adjusted afterward.
              </p>
            </div>
            <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
              <div className="text-xs font-semibold text-gray-600">
                Shift Duration (Range)
              </div>
              <div className="mt-1 text-sm font-semibold text-gray-800">
                {getShiftTemplateRangeLabel(selectedTemplate)}
              </div>
              <p className="mt-1 text-xs text-gray-500">
                Range is predefined by the selected shift type and is shown for
                reference only.
              </p>
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between mb-2 flex-wrap gap-3">
              <label className="text-sm font-semibold text-gray-700">
                Roles
              </label>
              <button
                onClick={addRole}
                disabled={!nextUnusedRoleName(activeWorkerRoleNames, roles)}
                className="text-xs text-primary hover:text-primary/90 flex items-center gap-1 disabled:pointer-events-none disabled:text-gray-400"
              >
                <Plus size={12} /> Add Role
              </button>
            </div>
            <div className="space-y-2">
              {roles.map((role, idx) => (
                <div
                  key={role.id}
                  className="border border-gray-200 rounded-lg p-3"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <select
                      value={role.roleName}
                      onChange={(e) => {
                        const next = [...roles];
                        next[idx] = { ...next[idx], roleName: e.target.value };
                        setRoles(next);
                      }}
                      className="flex-1 text-sm border border-gray-300 rounded px-2 py-1"
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
                    <input
                      type="number"
                      min={1}
                      value={role.requiredCount}
                      onChange={(e) => {
                        const next = [...roles];
                        next[idx] = {
                          ...next[idx],
                          requiredCount: parseInt(e.target.value) || 1,
                        };
                        setRoles(next);
                      }}
                      className="w-16 text-sm border border-gray-300 rounded px-2 py-1 text-center"
                    />
                    {roles.length > 1 && (
                      <button
                        onClick={() => removeRole(idx)}
                        className="p-1 hover:bg-red-100 rounded"
                      >
                        <Trash2 size={14} className="text-red-500" />
                      </button>
                    )}
                  </div>
                  <div className="mt-2">
                    <label className="block text-xs text-gray-500 mb-1">
                      Start Time
                    </label>
                    <input
                      type="time"
                      value={role.startTime}
                      onChange={(e) => {
                        const next = [...roles];
                        next[idx] = { ...next[idx], startTime: e.target.value };
                        setRoles(next);
                      }}
                      className="w-full text-sm border border-gray-300 rounded px-2 py-1"
                    />
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
                  <div className="text-xs text-gray-500">
                    {role.assignedWorkers.length}/{role.requiredCount} workers
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              onClick={handleDelete}
              className="px-4 py-2 border border-red-300 text-red-600 rounded-lg text-sm font-medium hover:bg-red-50 flex items-center gap-1"
            >
              <Trash2 size={14} /> Delete
            </button>
            <div className="flex-1" />
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 flex items-center gap-1"
            >
              <Save size={14} /> Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

const QuickAddShiftModal: React.FC<{
  date: Date;
  workOrderId: string;
  onClose: () => void;
}> = ({ date, workOrderId, onClose }) => {
  const {
    workOrders,
    shifts: shiftCatalog,
    workerRoles,
    workers,
    certifications,
    formTemplates,
    updateWorkOrder,
    getProjectById,
    getWorkerById,
  } = useAppContext();
  const { toast } = useToast();
  const wo = workOrders.find((w) => w.id === workOrderId);
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
      id: `sr_quick_${Date.now()}`,
      roleName: activeWorkerRoleNames[0],
      requiredCount: 1,
      startTime: '',
      assignedWorkers: [] as string[],
      requiredCertificationIds: [] as string[],
      requiredSkillIds: [] as string[],
    },
  ]);
  const [workerSearch, setWorkerSearch] = useState('');
  const [formTemplateIds, setFormTemplateIds] = useState<string[]>(() =>
    getDefaultShiftFormTemplateIds(formTemplates),
  );

  if (!wo) return null;

  const dateStr = date.toISOString().split('T')[0];
  const selectedTemplate = activeShiftTemplates.find(
    (item) => item.id === shiftTemplateId,
  );
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

  const addRole = () => {
    setRoles((prev) => {
      const roleName = nextUnusedRoleName(activeWorkerRoleNames, prev);
      if (!roleName) return prev;
      return [
        ...prev,
        {
          id: `sr_quick_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
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

  const assignedWorkerIds = new Set(roles.flatMap((r) => r.assignedWorkers));
  const availableWorkers = workers.filter(
    (w) =>
      w.status === 'active' &&
      !assignedWorkerIds.has(w.id) &&
      `${w.firstName} ${w.lastName} ${w.type} ${workerRoleNames(w).join(' ')}`
        .toLowerCase()
        .includes(workerSearch.toLowerCase()),
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

  const handleAdd = () => {
    const normalizedShiftName = shiftName.trim();
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
    if (roles.length === 0) {
      toast({
        title: 'Missing Roles',
        description: 'Add at least one role.',
        variant: 'destructive',
      });
      return;
    }
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
    const roleStartTimes = roles.map((r) => r.startTime).sort();
    const shiftStartTime = roleStartTimes[0] || defaultRoleStartTime;
    const shiftEndTime = addMinutesToTime(
      shiftStartTime,
      getShiftTemplateDurationMinutes(selectedTemplate),
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
    const newShift: Shift = {
      id: `s_quick_${Date.now()}`,
      workOrderId: wo.id,
      shiftName: normalizedShiftName,
      shiftTemplateId: shiftTemplateId || undefined,
      defaultRoleStartTime: defaultRoleStartTime || shiftStartTime,
      date: dateStr,
      startTime: shiftStartTime,
      endTime: shiftEndTime,
      formTemplateIds,
      roles: normalizedRoles,
    };
    updateWorkOrder(wo.id, { shifts: [...wo.shifts, newShift] });
    toast({
      title: 'Shift Added',
      description: `New shift on ${date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} for ${project?.name || wo.title}`,
    });
    onClose();
  };

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
                {date.toLocaleDateString('en-US', {
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
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">
              Shift Name
            </label>
            <input
              type="text"
              value={shiftName}
              onChange={(event) => setShiftName(event.target.value)}
              placeholder="Enter shift name"
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">
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
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm"
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
            idAttr="scheduler-new-shift-form-templates"
            formTemplates={formTemplates}
            value={formTemplateIds}
            onChange={setFormTemplateIds}
          />
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                Start Time
              </label>
              <input
                type="time"
                value={defaultRoleStartTime}
                onChange={(e) => applyStartTimeToRoles(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm"
              />
              <p className="mt-1 text-[11px] text-gray-500">
                Changing this updates all role start times. Each role can still
                be adjusted afterward.
              </p>
            </div>
            <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5">
              <div className="text-xs font-semibold text-gray-600">
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
                disabled={!nextUnusedRoleName(activeWorkerRoleNames, roles)}
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
                  <div className="flex items-center gap-2">
                    <select
                      value={role.roleName}
                      onChange={(e) => {
                        const next = [...roles];
                        next[idx] = { ...next[idx], roleName: e.target.value };
                        setRoles(next);
                      }}
                      className="flex-1 text-sm border border-gray-200 rounded-lg px-2 py-1.5 bg-white"
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
                    <div className="flex items-center gap-1">
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
                    {roles.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeRole(idx)}
                        className="p-1 hover:bg-red-100 rounded-lg"
                      >
                        <Trash2 size={14} className="text-red-400" />
                      </button>
                    )}
                  </div>
                  <div className="mt-2">
                    <label className="block text-xs font-semibold text-gray-600 mb-1">
                      Start Time
                    </label>
                    <input
                      type="time"
                      value={role.startTime}
                      onChange={(e) => {
                        const next = [...roles];
                        next[idx] = { ...next[idx], startTime: e.target.value };
                        setRoles(next);
                      }}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white"
                    />
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
          <div className="grid grid-cols-1 gap-4">
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
                  const isDisabled = targetIdx < 0;
                  return (
                    <button
                      key={w.id}
                      type="button"
                      onClick={() => handleAssignWorkerToBestRole(w.id)}
                      disabled={isDisabled}
                      className={`w-full text-left text-xs border rounded px-2 py-1 ${isDisabled ? 'cursor-not-allowed border-gray-200 bg-gray-50 text-gray-400' : 'hover:bg-emerald-50'}`}
                    >
                      {w.firstName} {w.lastName} -{' '}
                      {workerRoleNames(w).join(', ') || w.type}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
        <div className="p-5 border-t border-gray-100 flex gap-3">
          <div className="flex-1" />
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={handleAdd}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 flex items-center gap-1"
          >
            <Plus size={14} /> Add Shift
          </button>
        </div>
      </div>
    </div>
  );
};

const PlannedResourcesEditor = ({
  title,
  options,
  value,
  onChange,
}: {
  title: string;
  options: string[];
  value: Array<{ type: string; estimatedQuantity: number }>;
  onChange: (value: Array<{ type: string; estimatedQuantity: number }>) => void;
}) => (
  <section className="rounded-xl border border-gray-200 p-3">
    <div className="mb-2 flex items-center justify-between flex-wrap gap-3">
      <h4 className="text-sm font-semibold text-gray-800">{title}</h4>
      <button
        type="button"
        onClick={() => {
          const available = options.find(
            (option) => !value.some((resource) => resource.type === option),
          );
          if (available)
            onChange([...value, { type: available, estimatedQuantity: 1 }]);
        }}
        disabled={
          !options.some(
            (option) => !value.some((resource) => resource.type === option),
          )
        }
        className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 disabled:opacity-40"
      >
        <Plus size={13} /> Add type
      </button>
    </div>
    <div className="space-y-2">
      {value.map((resource, index) => (
        <div
          key={`${resource.type}-${index}`}
          className="grid grid-cols-[1fr_90px_32px] gap-2"
        >
          <select
            value={resource.type}
            onChange={(event) =>
              onChange(
                value.map((item, itemIndex) =>
                  itemIndex === index
                    ? { ...item, type: event.target.value }
                    : item,
                ),
              )
            }
            className="h-9 rounded-lg border border-gray-200 px-2 text-sm"
          >
            {options.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
          <input
            type="number"
            min={1}
            value={resource.estimatedQuantity}
            onChange={(event) =>
              onChange(
                value.map((item, itemIndex) =>
                  itemIndex === index
                    ? {
                        ...item,
                        estimatedQuantity: Math.max(
                          1,
                          Number(event.target.value) || 1,
                        ),
                      }
                    : item,
                ),
              )
            }
            className="h-9 rounded-lg border border-gray-200 px-2 text-sm"
          />
          <button
            type="button"
            onClick={() =>
              onChange(value.filter((_, itemIndex) => itemIndex !== index))
            }
            className="flex h-9 items-center justify-center rounded-lg text-red-500 hover:bg-red-50"
          >
            <Trash2 size={14} />
          </button>
        </div>
      ))}
      {value.length === 0 ? (
        <p className="py-3 text-center text-xs text-gray-400">
          No types planned.
        </p>
      ) : null}
    </div>
  </section>
);

const NewWorkOrderModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const {
    projects,
    workers,
    settings,
    workerRoles,
    shifts: shiftCatalog,
    workOrderTypes,
    addWorkOrder,
    getClientById,
    getProjectById,
    getWorkerById,
    certifications,
  } = useAppContext();
  const { toast } = useToast();
  const today = useMemo(() => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    return now;
  }, []);
  const startDateDefault = useMemo(
    () => today.toISOString().split('T')[0],
    [today],
  );
  const endDateDefault = useMemo(() => {
    const end = new Date(today);
    end.setDate(end.getDate() + 4);
    return end.toISOString().split('T')[0];
  }, [today]);
  const currentYear = today.getFullYear();
  const activeWorkOrderTypes = useMemo(
    () =>
      workOrderTypes
        .filter((type) => type.status === 'active')
        .sort((a, b) => a.name.localeCompare(b.name)),
    [workOrderTypes],
  );
  const activeShiftTemplates = useMemo(
    () => shiftCatalog.filter((item) => item.status === 'active'),
    [shiftCatalog],
  );
  const activeWorkerRoleNames = useMemo(
    () => assignmentRoleOptions(workerRoles),
    [workerRoles],
  );
  const defaultRoleName = activeWorkerRoleNames[0];
  const [form, setForm] = useState({
    projectId: '',
    title: '',
    orderNumber: '',
    workOrderTypeId: '',
    shiftTemplateId: '',
    startDate: startDateDefault,
    endDate: endDateDefault,
    requesterName: '',
    contactEmail: '',
    contactPhoneNumber: '',
    repeatDays: [true, true, true, true, true, false, false],
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
  const [roles, setRoles] = useState([
    {
      id: `sr_wo_role_${Date.now()}`,
      roleName: defaultRoleName,
      requiredCount: 1,
      startTime: '',
      assignedWorkers: [] as string[],
      requiredCertificationIds: [] as string[],
      requiredSkillIds: [] as string[],
    },
  ]);
  const [plannedEquipment, setPlannedEquipment] = useState<
    Array<{ type: string; estimatedQuantity: number }>
  >([]);
  const [plannedMaterials, setPlannedMaterials] = useState<
    Array<{ type: string; estimatedQuantity: number }>
  >([]);
  const [workerSearch, setWorkerSearch] = useState('');

  useEffect(() => {
    if (!form.workOrderTypeId && activeWorkOrderTypes.length > 0) {
      setForm((prev) => ({
        ...prev,
        workOrderTypeId: activeWorkOrderTypes[0].id,
      }));
    }
  }, [form.workOrderTypeId, activeWorkOrderTypes]);

  const selectedProjectData = form.projectId
    ? getProjectById(form.projectId)
    : null;
  const selectedClientData = selectedProjectData
    ? getClientById(selectedProjectData.clientId)
    : null;
  const projectOptions = useMemo(
    () =>
      projects.map((project) => {
        const client = getClientById(project.clientId);
        return {
          value: project.id,
          label: `#${project.number} - ${project.name}`,
          searchText: `${client?.name || ''} ${project.location} ${project.city}`,
        };
      }),
    [projects, getClientById],
  );

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
    setRoles((prev) => {
      const roleName = nextUnusedRoleName(activeWorkerRoleNames, prev);
      if (!roleName) return prev;
      return [
        ...prev,
        {
          id: `sr_wo_role_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          roleName,
          requiredCount: 1,
          startTime: roles[0]?.startTime || '',
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

  const addHoursToTime = (time: string, hoursToAdd: number) => {
    const [h, m] = time.split(':').map(Number);
    const date = new Date();
    date.setHours(h || 0, m || 0, 0, 0);
    date.setHours(date.getHours() + hoursToAdd);
    const hh = `${date.getHours()}`.padStart(2, '0');
    const mm = `${date.getMinutes()}`.padStart(2, '0');
    return `${hh}:${mm}`;
  };

  const [wizardStep, setWizardStep] = useState<0 | 1 | 2 | 3>(0);

  const buildShiftsFromRoles = useCallback(
    (woId: string) => {
      const groupedShifts = new Map<string, any>();
      let hasInvalidRange = false;

      if (form.endDate < form.startDate) {
        hasInvalidRange = true;
        return { shifts: [], hasInvalidRange };
      }

      const rangeStart = new Date(`${form.startDate}T12:00:00`);
      const rangeEnd = new Date(`${form.endDate}T12:00:00`);

      roles.forEach((role, roleIdx) => {
        if (!role.startTime) return;
        const roleEndTime = addHoursToTime(role.startTime, 9);

        for (
          let d = new Date(rangeStart);
          d <= rangeEnd;
          d.setDate(d.getDate() + 1)
        ) {
          const dayOfWeek = d.getDay();
          const dayIndex = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
          if (!form.repeatDays[dayIndex]) continue;

          const dateStr = d.toISOString().split('T')[0];
          const key = `${dateStr}|${role.startTime}|${roleEndTime}`;

          if (!groupedShifts.has(key)) {
            groupedShifts.set(key, {
              id: `s_new_${dateStr}_${Date.now()}_${roleIdx}`,
              workOrderId: woId,
              shiftName: form.title.trim(),
              shiftTemplateId: form.shiftTemplateId || undefined,
              date: dateStr,
              startTime: role.startTime,
              endTime: roleEndTime,
              plannedEquipment: plannedEquipment.map((resource) => ({
                ...resource,
              })),
              plannedMaterials: plannedMaterials.map((resource) => ({
                ...resource,
              })),
              roles: [],
            });
          }

          groupedShifts.get(key).roles.push({
            id: `sr_new_${Date.now()}_${dateStr}_${roleIdx}`,
            roleName: role.roleName,
            requiredCount: role.requiredCount,
            requiredCertificationIds: [
              ...getRoleRequiredCertificationIds(role),
            ],
            requiredSkillIds: [],
            assignedWorkers: [...role.assignedWorkers],
          });
        }
      });

      const shifts = Array.from(groupedShifts.values()).sort((a, b) => {
        const dateCmp = a.date.localeCompare(b.date);
        if (dateCmp !== 0) return dateCmp;
        return a.startTime.localeCompare(b.startTime);
      });

      return { shifts, hasInvalidRange };
    },
    [
      roles,
      form.startDate,
      form.endDate,
      form.repeatDays,
      form.shiftTemplateId,
      form.title,
      plannedEquipment,
      plannedMaterials,
    ],
  );

  const validateStep = (step: 0 | 1 | 2 | 3): boolean => {
    if (step === 0) {
      if (!form.projectId) {
        toast({
          title: 'Missing Project',
          description: 'Please select a project.',
          variant: 'destructive',
        });
        return false;
      }
      if (!form.title.trim()) {
        toast({
          title: 'Missing Title',
          description: 'Please enter a title.',
          variant: 'destructive',
        });
        return false;
      }
      if (form.endDate < form.startDate) {
        toast({
          title: 'Invalid Date Range',
          description: 'End Date cannot be earlier than Start Date.',
          variant: 'destructive',
        });
        return false;
      }
      const step0Project = getProjectById(form.projectId);
      if (step0Project && projectHasScheduleBounds(step0Project)) {
        const woDates0 = { startDate: form.startDate, endDate: form.endDate };
        if (!isAssignmentRangeWithinProject(woDates0, step0Project)) {
          toast({
            title: 'Outside project dates',
            description: `Assignment must fall within ${assignmentDateRangeLabel(step0Project)}.`,
            variant: 'destructive',
          });
          return false;
        }
      }
    }

    if (step === 1) {
      if (!form.shiftTemplateId) {
        toast({
          title: 'Missing Shift Type',
          description:
            activeShiftTemplates.length > 0
              ? 'Please select a shift type from the catalog.'
              : 'No active shift types are available. Add one in Settings before creating shifts.',
          variant: 'destructive',
        });
        return false;
      }
      if (roles.length === 0) {
        toast({
          title: 'Missing Roles',
          description: 'Add at least one role assignment.',
          variant: 'destructive',
        });
        return false;
      }
      if (roles.some((role) => !role.startTime)) {
        toast({
          title: 'Missing Start Time',
          description: 'Enter a start time for every role.',
          variant: 'destructive',
        });
        return false;
      }
      if (!form.repeatDays.some(Boolean)) {
        toast({
          title: 'Missing Repeat Days',
          description: 'Select at least one day for the schedule.',
          variant: 'destructive',
        });
        return false;
      }
      const { hasInvalidRange, shifts } = buildShiftsFromRoles('preview_wo');
      if (hasInvalidRange) {
        toast({
          title: 'Invalid Role Dates',
          description: 'Role End Date cannot be earlier than Start Date.',
          variant: 'destructive',
        });
        return false;
      }
      if (shifts.length === 0) {
        toast({
          title: 'Missing Role Schedule',
          description:
            'Please add at least one role with valid date range and hours.',
          variant: 'destructive',
        });
        return false;
      }
    }

    return true;
  };

  const goToNextStep = () => {
    if (!validateStep(wizardStep)) return;
    setWizardStep((prev) => (prev < 3 ? ((prev + 1) as 0 | 1 | 2 | 3) : prev));
  };

  const previewShifts = useMemo(
    () => buildShiftsFromRoles('preview_wo').shifts,
    [buildShiftsFromRoles],
  );

  const handleCreateWorkOrder = async () => {
    if (!validateStep(0)) return;

    const woId = `wo_new_${Date.now()}`;
    const orderNum = form.orderNumber.trim() || undefined;

    addWorkOrder({
      id: woId,
      projectId: form.projectId,
      workOrderTypeId: form.workOrderTypeId || undefined,
      title: form.title.trim(),
      orderNumber: orderNum,
      startDate: form.startDate,
      endDate: form.endDate,
      shifts: [],
      requesterName: form.requesterName.trim(),
      contactEmail: form.contactEmail.trim(),
      contactPhoneNumber: form.contactPhoneNumber.trim(),
      notes: form.notes.trim(),
      dispatchNote: form.dispatchNote.trim(),
      fileUploads: form.fileUploads,
      assignmentAddress: form.assignmentAddress.trim(),
      latitude: form.latitude,
      longitude: form.longitude,
      assignmentCity: form.assignmentCity.trim(),
      assignmentState: form.assignmentState.trim(),
      assignmentZipCode: form.assignmentZipCode.trim(),
      assignmentCountry:
        form.assignmentCountry.trim() || DEFAULT_ASSIGNMENT_COUNTRY,
    });
    toast({
      title: 'Assignment Created',
      description: `${form.title} ${orderNum ? `(${orderNum})` : ''} created. Add shifts, workers, and equipment from Schedule after this step.`,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-2 sm:p-4">
      <div
        className="bg-white rounded-2xl w-full max-w-2xl max-h-[90dvh] flex flex-col shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-5 border-b border-gray-100 flex items-center justify-between flex-shrink-0 flex-wrap gap-3">
          <div>
            <h2 className="text-base font-bold text-gray-800">
              Add New Assignment
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Register the general assignment information
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-gray-100 rounded-lg"
          >
            <X size={16} className="text-gray-400" />
          </button>
        </div>
        <form
          onSubmit={(e) => e.preventDefault()}
          className="flex-1 overflow-y-auto p-5 space-y-5"
        >
          <div className="hidden gap-1 bg-gray-100 rounded-lg p-0.5">
            {[
              { key: 0 as const, label: 'General' },
              { key: 1 as const, label: 'Shifts' },
              { key: 2 as const, label: 'Workers' },
              { key: 3 as const, label: 'Equipment' },
            ].map((step) => (
              <button
                key={step.key}
                type="button"
                onClick={() => {
                  if (step.key <= wizardStep) setWizardStep(step.key);
                }}
                className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-all ${
                  wizardStep === step.key
                    ? 'bg-white shadow-sm text-primary'
                    : step.key < wizardStep
                      ? 'text-gray-600 hover:text-gray-700'
                      : 'text-gray-400 cursor-not-allowed'
                }`}
              >
                {step.label}
              </button>
            ))}
          </div>

          {wizardStep === 0 && (
            <>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                  Project Name *
                </label>
                <SearchableSelect
                  value={form.projectId}
                  onChange={(pid) => {
                    const proj = getProjectById(pid);
                    const startOfYear = new Date(currentYear, 0, 1).getTime();
                    const weekNumber = Math.ceil(
                      (Date.now() - startOfYear) / (7 * 24 * 60 * 60 * 1000),
                    );
                    setForm((f) => ({
                      ...f,
                      projectId: pid,
                      title:
                        f.title ||
                        (proj ? `${proj.name} - Week ${weekNumber}` : ''),
                    }));
                  }}
                  options={projectOptions}
                  placeholder="Select project..."
                  searchPlaceholder="Search project..."
                  emptyMessage="No projects found."
                />
              </div>

              {selectedProjectData && (
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <FolderKanban size={14} className="text-primary" />
                    <span className="text-sm font-semibold text-blue-800">
                      {selectedProjectData.name}
                    </span>
                  </div>
                  <div className="responsive-grid grid grid-cols-2 gap-1 text-xs text-blue-700">
                    <span>
                      Project #: <strong>{selectedProjectData.number}</strong>
                    </span>
                    <span>
                      Client: <strong>{selectedClientData?.name || '-'}</strong>
                    </span>
                    <span>
                      Location: {selectedProjectData.location},{' '}
                      {selectedProjectData.city}
                    </span>
                    <span>
                      Status:{' '}
                      <span className="capitalize">
                        {selectedProjectData.status.replace('_', ' ')}
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
                  value={form.orderNumber}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, orderNumber: e.target.value }))
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
                  value={form.workOrderTypeId}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, workOrderTypeId: e.target.value }))
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
                  required
                  value={form.title}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, title: e.target.value }))
                  }
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Assignment title"
                />
              </div>
              <div className="responsive-grid grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                    Requester Name
                  </label>
                  <input
                    value={form.requesterName}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, requesterName: e.target.value }))
                    }
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Requester name"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                    Contact Email
                  </label>
                  <input
                    type="email"
                    value={form.contactEmail}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, contactEmail: e.target.value }))
                    }
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="contact@example.com"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                  Contact Phone Number
                </label>
                <input
                  value={form.contactPhoneNumber}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      contactPhoneNumber: e.target.value,
                    }))
                  }
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Phone number"
                />
              </div>

              <AssignmentAddressField
                id="sched-new-assignment-address"
                value={{
                  assignmentAddress: form.assignmentAddress,
                  latitude: form.latitude,
                  longitude: form.longitude,
                  assignmentCity: form.assignmentCity,
                  assignmentState: form.assignmentState,
                  assignmentZipCode: form.assignmentZipCode,
                  assignmentCountry: form.assignmentCountry,
                }}
                onChange={(v) =>
                  setForm((f) => ({
                    ...f,
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
                    required
                    value={form.startDate}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, startDate: e.target.value }))
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
                    required
                    value={form.endDate}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, endDate: e.target.value }))
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
                  value={form.dispatchNote}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, dispatchNote: e.target.value }))
                  }
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  rows={4}
                  placeholder="Add the dispatch note for this assignment"
                />
              </div>
              <WorkOrderFileUploadsField
                value={form.fileUploads}
                onChange={(fileUploads) =>
                  setForm((prev) => ({ ...prev, fileUploads }))
                }
              />
            </>
          )}

          {wizardStep === 1 && (
            <>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                  Shift Type
                </label>
                <select
                  value={form.shiftTemplateId}
                  onChange={(e) => {
                    const nextId = e.target.value;
                    const selectedTemplate = activeShiftTemplates.find(
                      (item) => item.id === nextId,
                    );
                    setForm((f) => ({ ...f, shiftTemplateId: nextId }));
                    if (selectedTemplate?.startTime) {
                      setRoles((prev) =>
                        prev.map((role) => ({
                          ...role,
                          startTime:
                            selectedTemplate.startTime || role.startTime,
                        })),
                      );
                    }
                  }}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">Select shift type...</option>
                  {activeShiftTemplates.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="border-t border-gray-200 pt-4">
                <div className="flex items-center justify-between mb-3 flex-wrap gap-3">
                  <h3 className="text-xs font-bold text-gray-600 uppercase tracking-wide">
                    Role Assignment
                  </h3>
                  <button
                    type="button"
                    onClick={addRole}
                    disabled={!nextUnusedRoleName(activeWorkerRoleNames, roles)}
                    className="text-xs text-red-500 hover:text-red-600 flex items-center gap-1 font-medium disabled:pointer-events-none disabled:text-gray-400"
                  >
                    <Plus size={12} /> Add Role
                  </button>
                </div>
                <div className="space-y-3">
                  {roles.map((role, idx) => (
                    <div
                      key={role.id}
                      className={`border rounded-xl p-3 ${roleColorClass(role.roleName)}`}
                    >
                      <div className="flex items-center gap-2">
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
                          className="flex-1 text-sm border border-gray-200 rounded-lg px-2.5 py-2 bg-white"
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
                          className="w-16 text-sm border border-gray-200 rounded-lg px-2 py-2 text-center bg-white"
                        />
                        {roles.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeRole(idx)}
                            className="p-1.5 hover:bg-red-100 rounded-lg"
                          >
                            <Trash2 size={14} className="text-red-500" />
                          </button>
                        )}
                      </div>
                      <div className="mt-2">
                        <label className="block text-[11px] font-semibold text-gray-500 mb-1">
                          Start Time
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
                          className="w-full text-sm border border-gray-200 rounded-lg px-2.5 py-2 bg-white"
                        />
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

              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-2">
                  Repeat Days
                </label>
                <div className="flex flex-wrap gap-2">
                  {['M', 'T', 'W', 'Th', 'F', 'S', 'Su'].map((day, i) => (
                    <button
                      key={day}
                      type="button"
                      onClick={() => {
                        const next = [...form.repeatDays];
                        next[i] = !next[i];
                        setForm((f) => ({ ...f, repeatDays: next }));
                      }}
                      className={`w-9 h-9 rounded-lg text-sm font-medium transition-colors ${form.repeatDays[i] ? 'bg-primary text-primary-foreground shadow-sm' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
                    >
                      {day}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                  Notes
                </label>
                <textarea
                  value={form.notes}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, notes: e.target.value }))
                  }
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  rows={2}
                />
              </div>
            </>
          )}

          {wizardStep === 2 && (
            <div className="space-y-4">
              {roles.map((role, roleIdx) => (
                <div key={role.id}>
                  <div className="flex items-center gap-2 mb-2">
                    <span
                      className={`text-xs font-bold px-2 py-0.5 rounded ${roleColorClass(role.roleName)}`}
                    >
                      {role.roleName}
                    </span>
                    <span
                      className={`text-xs font-bold ${role.assignedWorkers.length >= role.requiredCount ? 'text-emerald-600' : 'text-orange-600'}`}
                    >
                      {role.assignedWorkers.length}/{role.requiredCount}
                    </span>
                  </div>
                  <div className="space-y-1">
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
                          <span className="text-[10px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded font-medium">
                            Assigned
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              handleRemoveWorkerFromRole(wid, roleIdx)
                            }
                            className="p-1 hover:bg-red-100 rounded"
                          >
                            <X size={12} className="text-red-500" />
                          </button>
                        </div>
                      );
                    })}
                    {role.assignedWorkers.length < role.requiredCount && (
                      <div className="border-2 border-dashed border-gray-200 rounded-lg p-2 text-center">
                        <span className="text-xs text-gray-400">
                          Need{' '}
                          {role.requiredCount - role.assignedWorkers.length}{' '}
                          more {role.roleName}(s)
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              ))}

              <div className="border-t border-gray-200 pt-3">
                <span className="text-xs font-bold text-gray-600 mb-2 block">
                  Available Workers
                </span>
                <div className="flex items-center bg-gray-100 rounded-lg px-2.5 py-1.5 mb-2">
                  <Search size={12} className="text-gray-400 mr-1.5" />
                  <input
                    placeholder="Search workers..."
                    value={workerSearch}
                    onChange={(e) => setWorkerSearch(e.target.value)}
                    className="bg-transparent text-sm outline-none w-full"
                  />
                </div>
                <div className="space-y-1 max-h-52 overflow-y-auto">
                  {availableWorkers.map((w) => {
                    const workerRoleLabel =
                      workerRoleNames(w).join(', ') || w.type;
                    const matchingRoleIdx = roles.findIndex(
                      (r) =>
                        workerHasAssignmentRole(w, r.roleName) &&
                        r.assignedWorkers.length < r.requiredCount,
                    );
                    const targetIdx = matchingRoleIdx;
                    const isDisabled = targetIdx < 0;
                    return (
                      <div
                        key={w.id}
                        className="flex items-center gap-2 rounded-lg px-3 py-2 border border-gray-200 hover:border-blue-200 hover:bg-primary/10/30 transition-colors"
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
                          <div className="flex items-center gap-1">
                            <span className="text-xs text-gray-500">
                              {workerRoleLabel}
                            </span>
                            {matchingRoleIdx >= 0 && (
                              <span className="text-[9px] bg-emerald-100 text-emerald-700 px-1 py-0 rounded font-medium">
                                Match
                              </span>
                            )}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleAssignWorkerToBestRole(w.id)}
                          disabled={isDisabled}
                          className={`p-1.5 rounded-lg ${isDisabled ? 'cursor-not-allowed opacity-50' : 'hover:bg-emerald-100'}`}
                        >
                          <UserPlus size={14} className="text-emerald-600" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {wizardStep === 3 && (
            <div className="space-y-4">
              <PlannedResourcesEditor
                title="Equipment"
                options={settings.equipmentTypes || []}
                value={plannedEquipment}
                onChange={setPlannedEquipment}
              />
              <PlannedResourcesEditor
                title="Materials"
                options={settings.materialTypes || []}
                value={plannedMaterials}
                onChange={setPlannedMaterials}
              />
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <div className="flex-1" />
            <button
              type="button"
              onClick={() => void handleCreateWorkOrder()}
              className="px-3 sm:px-6 py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-semibold hover:bg-primary/90 shadow-sm"
            >
              Create Assignment
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default SchedulerView;
