import TableLoading from '@/components/shared/TableLoading';
import { documentFileName } from '@/lib/documentFileName';
import { useReferencedMaterials } from '@/hooks/use-referenced-materials';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  Briefcase,
  CalendarDays,
  Check,
  Clock,
  Download,
  FileText,
  LockKeyhole,
  MapPin,
  MessageSquare,
  Package,
  Pencil,
  Plus,
  RotateCw,
  Save,
  ShieldCheck,
  Trash2,
  Truck,
  Users,
  X,
} from 'lucide-react';
import { useAppContext } from '@/contexts/AppContext';
import {
  dbRegenerateFormSubmissionPdf,
  dbEmailWorkOrderPdf,
  dbUpdateFormSubmission,
  dbUpdateTimesheet,
  dbUpdateWorkOrderShiftDetail,
  approveWorkOrderShift,
  fetchShiftTimesheets,
  reopenWorkOrderShift,
} from '@/lib/db';
import { publicFileUrl } from '@/lib/publicFiles';
import type {
  FormSubmission,
  OvertimeRule,
  Shift,
  ShiftRole,
  Timesheet,
  WorkOrder,
} from '@/lib/types';
import { ShiftChatAside } from '@/components/scheduler/ShiftChatAside';
import ShiftFormTemplatesPicker from '@/components/forms/ShiftFormTemplatesPicker';
import { useAuth } from '@/contexts/AuthContext';

type Tab =
  | 'details'
  | 'workers'
  | 'equipment'
  | 'materials'
  | 'documents'
  | 'timesheets';

type Props = {
  workOrder: WorkOrder;
  shift: Shift;
  statusLabel: string;
  onBack: () => void;
  onRefresh: () => Promise<void>;
};

const tabLabels: Array<{ id: Tab; label: string }> = [
  { id: 'details', label: 'Shift Details' },
  { id: 'workers', label: 'Workers' },
  { id: 'equipment', label: 'Equipment' },
  { id: 'materials', label: 'Materials' },
  { id: 'documents', label: 'Documents' },
  { id: 'timesheets', label: 'Timesheets' },
];

const cloneShift = (shift: Shift): Shift => ({
  ...shift,
  roles: shift.roles.map((role) => ({
    ...role,
    assignedWorkers: [...role.assignedWorkers],
    workerConfirmations: [...(role.workerConfirmations || [])],
  })),
  plannedEquipment: [...(shift.plannedEquipment || [])],
  plannedMaterials: [...(shift.plannedMaterials || [])],
  formTemplateIds: [...(shift.formTemplateIds || [])],
});

const numeric = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const hoursTotal = (row: Timesheet) =>
  numeric(row.regularHours) +
  numeric(row.overtimeHours) +
  numeric(row.doubleTimeHours);

type EditableHours = {
  regularHours: number;
  overtimeHours: number;
  doubleTimeHours: number;
};

type ProcessedResourceRow = {
  type: string;
  slotId?: string;
  equipmentId?: string;
  materialId?: string;
  actualQuantity?: number;
  estimatedQuantity?: number;
};

type ProcessedResourceUsage = {
  equipment: ProcessedResourceRow[];
  materials: ProcessedResourceRow[];
};

const emptyProcessedResourceUsage = (): ProcessedResourceUsage => ({
  equipment: [],
  materials: [],
});

const parseProcessedResourceUsage = (
  value: unknown,
): ProcessedResourceUsage => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return emptyProcessedResourceUsage();
  }
  const record = value as Record<string, unknown>;
  return {
    equipment: Array.isArray(record.equipment)
      ? (record.equipment as ProcessedResourceRow[])
      : [],
    materials: Array.isArray(record.materials)
      ? (record.materials as ProcessedResourceRow[])
      : [],
  };
};

const timeMinutes = (value: string) => {
  const normalized = value.trim();
  const twelveHourMatch = normalized.match(
    /^(\d{1,2}):(\d{2})\s*([AP])\.?M\.?$/i,
  );
  if (twelveHourMatch) {
    let hours = Number(twelveHourMatch[1]);
    const minutes = Number(twelveHourMatch[2]);
    const period = twelveHourMatch[3].toUpperCase();
    if (hours < 1 || hours > 12 || minutes < 0 || minutes > 59) return null;
    if (period === 'A' && hours === 12) hours = 0;
    if (period === 'P' && hours !== 12) hours += 12;
    return hours * 60 + minutes;
  }

  const match = normalized.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
};

const editableTimeValue = (value: string) => {
  const minutes = timeMinutes(value);
  if (minutes === null) return '';
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(
    minutes % 60,
  ).padStart(2, '0')}`;
};

const calculateEditedHours = (
  draft: {
    clockIn: string;
    clockOut: string;
    breakMinutes: number;
    lunchTaken: boolean;
  },
  date: string,
  rules: OvertimeRule,
): EditableHours | null => {
  const start = timeMinutes(draft.clockIn);
  let end = timeMinutes(draft.clockOut);
  if (start === null || end === null) return null;
  if (end <= start) end += 24 * 60;

  const elapsedHours = (end - start) / 60;
  const workedHours = Math.max(
    0,
    elapsedHours - Math.max(0, draft.breakMinutes) / 60,
  );
  const lunchDeduction =
    rules.yesLunchDeductionEnabled &&
    draft.lunchTaken &&
    workedHours > (rules.yesLunchDeductionMinimumHours ?? 0)
      ? (rules.yesLunchDeductionHours ?? 0)
      : 0;
  const payableHours = Math.max(0, workedHours - lunchDeduction);
  const noLunchCredit =
    (rules.noLunchCreditEnabled ?? true) &&
    !draft.lunchTaken &&
    workedHours > (rules.noLunchCreditMinimumHours ?? 7)
      ? (rules.noLunchCreditHours ?? 1)
      : 0;
  const effectiveDate = (rules.noLunchCreditEffectiveDate || '').slice(0, 10);
  const creditOt =
    rules.noLunchCreditTarget === 'ot' &&
    Boolean(effectiveDate) &&
    date.slice(0, 10) >= effectiveDate;
  const round = (value: number) => Math.round(value * 100) / 100;
  const dateMatch = date.match(/^(\d{4})-(\d{2})-(\d{2})/);
  const weekday = dateMatch
    ? new Date(
        Number(dateMatch[1]),
        Number(dateMatch[2]) - 1,
        Number(dateMatch[3]),
        12,
      ).getDay()
    : -1;

  if (weekday === 0 && (rules.sundayAllDoubleTime ?? true)) {
    return {
      regularHours: 0,
      overtimeHours: 0,
      doubleTimeHours: round(payableHours + noLunchCredit),
    };
  }

  if (weekday === 6 && (rules.saturdayAllOvertime ?? true)) {
    const saturdayThreshold = rules.saturdayDoubleTimeThreshold ?? 12;
    return {
      regularHours: 0,
      overtimeHours: round(
        Math.min(payableHours, saturdayThreshold) + noLunchCredit,
      ),
      doubleTimeHours: round(Math.max(0, payableHours - saturdayThreshold)),
    };
  }

  const regularLimit = rules.regularHoursLimit || 8;
  const doubleTimeThreshold = Math.max(
    rules.doubleTimeThreshold || 12,
    regularLimit,
  );
  const doubleTimeHours = Math.max(0, payableHours - doubleTimeThreshold);
  const baseOvertimeHours = Math.max(
    0,
    Math.min(payableHours, doubleTimeThreshold) - regularLimit,
  );

  return {
    regularHours: round(
      Math.min(payableHours, regularLimit) + (creditOt ? 0 : noLunchCredit),
    ),
    overtimeHours: round(baseOvertimeHours + (creditOt ? noLunchCredit : 0)),
    doubleTimeHours: round(doubleTimeHours),
  };
};

const documentName = documentFileName;

export const ShiftDetailView: React.FC<Props> = ({
  workOrder,
  shift,
  statusLabel,
  onBack,
  onRefresh,
}) => {
  const context = useAppContext();
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>('details');
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [shiftSaveError, setShiftSaveError] = useState('');
  const [draft, setDraft] = useState<Shift>(() => cloneShift(shift));
  const [chatOpen, setChatOpen] = useState(false);
  const [timesheets, setTimesheets] = useState<Timesheet[]>([]);
  const [loadingTimesheets, setLoadingTimesheets] = useState(false);
  const [timesheetError, setTimesheetError] = useState('');
  const [regeneratingPdfId, setRegeneratingPdfId] = useState<string | null>(
    null,
  );
  const [approvalAction, setApprovalAction] = useState<
    'approve' | 'reopen' | null
  >(null);
  const [processedResources, setProcessedResources] =
    useState<ProcessedResourceUsage>(emptyProcessedResourceUsage);
  const [savedProcessedResources, setSavedProcessedResources] =
    useState<ProcessedResourceUsage>(emptyProcessedResourceUsage);

  useEffect(() => setDraft(cloneShift(shift)), [shift]);

  const loadTimesheets = async () => {
    setLoadingTimesheets(true);
    setTimesheetError('');
    try {
      setTimesheets(await fetchShiftTimesheets(workOrder.id, shift.id));
    } catch (error) {
      setTimesheetError(
        error instanceof Error ? error.message : 'Could not load timesheets.',
      );
    } finally {
      setLoadingTimesheets(false);
    }
  };

  const applySavedTimesheet = async (saved: Timesheet) => {
    setTimesheets((current) =>
      current.map((row) => (row.id === saved.id ? saved : row)),
    );
  };

  useEffect(() => {
    void loadTimesheets();
  }, [workOrder.id, shift.id]);

  const project = context.getProjectById(workOrder.projectId);
  const isCompleted = statusLabel === 'Shift Completed';
  const isPmApproved =
    statusLabel === 'PM Approved' || Boolean(shift.pmApprovedAt);
  const isAdmin = user?.role === 'admin' || user?.roles?.includes('admin');
  const createdByName =
    shift.createdByName?.trim() ||
    (shift.createdByUserId && shift.createdByUserId === user?.id
      ? `${user.firstName} ${user.lastName}`.trim()
      : '—');
  const approvedByName =
    shift.pmApprovedByName?.trim() ||
    (shift.pmApprovedByUserId && shift.pmApprovedByUserId === user?.id
      ? `${user.firstName} ${user.lastName}`.trim()
      : isPmApproved
        ? 'Administrator'
        : '—');
  const visibleShift = editing ? draft : shift;
  const shiftTemplate = context.shifts.find(
    (item) => item.id === visibleShift.shiftTemplateId,
  );
  const shiftStartMinutes = timeMinutes(visibleShift.startTime || '');
  const shiftStartHour =
    shiftStartMinutes === null ? 0 : Math.floor(shiftStartMinutes / 60);
  const shiftTypeLabel =
    shiftTemplate?.name ||
    (shiftStartHour >= 17 || shiftStartHour < 5 ? 'Night Shift' : 'Day Shift');
  const workerIds = [
    ...new Set(visibleShift.roles.flatMap((role) => role.assignedWorkers)),
  ];
  const hasUnsavedShiftChanges =
    JSON.stringify(draft) !== JSON.stringify(shift);
  const hasUnsavedResourceChanges =
    JSON.stringify(processedResources) !==
    JSON.stringify(savedProcessedResources);
  const workOrderPdfSubmission = useMemo(
    () =>
      context.formSubmissions.find((submission) => {
        if (
          submission.workOrderId !== workOrder.id ||
          !submission.pdfUrl ||
          (submission.shiftId && submission.shiftId !== shift.id)
        ) {
          return false;
        }
        const template = context.formTemplates.find(
          (candidate) => candidate.id === submission.templateId,
        );
        const key =
          `${template?.name || ''} ${template?.category || ''}`.toLowerCase();
        return key.includes('work order') || /\bwo\b/.test(key);
      }) ?? null,
    [context.formSubmissions, context.formTemplates, shift.id, workOrder.id],
  );
  const resourceUsageTarget = useMemo(() => {
    const candidates = context.formSubmissions
      .filter(
        (submission) =>
          submission.workOrderId === workOrder.id &&
          submission.shiftId === shift.id,
      )
      .map((submission) => {
        const template = context.formTemplates.find(
          (candidate) => candidate.id === submission.templateId,
        );
        const field = template?.fields.find(
          (candidate) => candidate.type === 'resource_usage',
        );
        return field ? { submission, fieldId: field.id } : null;
      })
      .filter(
        (
          candidate,
        ): candidate is { submission: FormSubmission; fieldId: string } =>
          candidate !== null,
      )
      .sort((left, right) =>
        String(right.submission.submittedAt || '').localeCompare(
          String(left.submission.submittedAt || ''),
        ),
      );
    return candidates[0] || null;
  }, [context.formSubmissions, context.formTemplates, shift.id, workOrder.id]);

  useEffect(() => {
    const value = resourceUsageTarget
      ? resourceUsageTarget.submission.data[resourceUsageTarget.fieldId]
      : null;
    const parsed = parseProcessedResourceUsage(value);
    setProcessedResources(parsed);
    setSavedProcessedResources(parsed);
  }, [resourceUsageTarget]);

  const visibleProcessedResources = editing
    ? processedResources
    : savedProcessedResources;
  const referencedMaterials = useReferencedMaterials(
    context.materials,
    visibleProcessedResources.materials.map((row) => row.materialId || '').filter(Boolean),
  );
  const generatedDocuments = context.formSubmissions
    .filter(
      (submission) =>
        submission.workOrderId === workOrder.id &&
        (!submission.shiftId || submission.shiftId === shift.id) &&
        submission.pdfUrl,
    )
    .map((submission) => ({
      id: submission.id,
      name:
        context.formTemplates.find(
          (template) => template.id === submission.templateId,
        )?.name || 'Generated PDF',
      url: publicFileUrl(submission.pdfUrl || ''),
      source: 'Generated form',
    }));
  const uploadedDocuments = [
    ...(workOrder.fileUploads || []),
    ...(workOrder.attachments || []),
  ]
    .filter(Boolean)
    .map((url, index) => ({
      id: `upload-${index}-${url}`,
      name: documentName(url),
      url: publicFileUrl(url),
      source: 'Assignment',
    }));
  const documents = [...generatedDocuments, ...uploadedDocuments];

  const counts: Record<Tab, number | undefined> = {
    details: undefined,
    workers: workerIds.length,
    equipment: visibleProcessedResources.equipment.filter(
      (row) => row.equipmentId,
    ).length,
    materials: visibleProcessedResources.materials.filter(
      (row) => row.materialId,
    ).length,
    documents: documents.length,
    timesheets: timesheets.filter(
      (row) => (row.variant || 'internal') === 'internal',
    ).length,
  };

  const updateDraftRole = (
    roleId: string,
    update: (role: ShiftRole) => ShiftRole,
  ) => {
    setDraft((current) => ({
      ...current,
      roles: current.roles.map((role) =>
        role.id === roleId ? update(role) : role,
      ),
    }));
  };

  const addRoleWorker = (roleId: string, id: string) => {
    if (!id) return;
    updateDraftRole(roleId, (role) => {
      const current = role.assignedWorkers;
      if (current.length >= Math.max(1, Number(role.requiredCount || 0))) {
        return role;
      }
      return current.includes(id)
        ? role
        : { ...role, assignedWorkers: [...current, id] };
    });
  };

  const removeRoleWorker = (roleId: string, id: string) =>
    updateDraftRole(roleId, (role) => ({
      ...role,
      assignedWorkers: role.assignedWorkers.filter((value) => value !== id),
    }));

  const saveDraft = async () => {
    setSaving(true);
    setShiftSaveError('');
    try {
      if (hasUnsavedShiftChanges) {
        await dbUpdateWorkOrderShiftDetail(workOrder.id, shift.id, draft);
      }
      if (hasUnsavedResourceChanges && resourceUsageTarget) {
        await dbUpdateFormSubmission(resourceUsageTarget.submission.id, {
          data: {
            ...resourceUsageTarget.submission.data,
            [resourceUsageTarget.fieldId]: processedResources,
          },
        });
        setSavedProcessedResources(processedResources);
      }
      await onRefresh();
      await loadTimesheets();
      setEditing(false);
    } catch (error) {
      setShiftSaveError(
        error instanceof Error
          ? error.message
          : 'Could not save shift changes.',
      );
    } finally {
      setSaving(false);
    }
  };

  const saveTimesheetNotes = async (
    variant: 'client' | 'internal',
    notes: string,
  ) => {
    const field =
      variant === 'client' ? 'clientTimesheetNotes' : 'internalTimesheetNotes';
    const nextShift = { ...shift, [field]: notes };
    await dbUpdateWorkOrderShiftDetail(workOrder.id, shift.id, nextShift);
    await onRefresh();
  };

  const [sendingPdf, setSendingPdf] = useState(false);
  const emailWorkOrderPdf = async () => {
    if (!workOrderPdfSubmission || sendingPdf) return;
    const project = context.getProjectById(workOrder.projectId);
    const email = context.getClientById(project?.clientId || '')?.email?.trim();
    if (!email) {
      window.alert('Add an email address to the project client first.');
      return;
    }
    if (!window.confirm(`Send this Work Order PDF to ${email}?`)) return;
    setSendingPdf(true);
    try {
      await dbEmailWorkOrderPdf(workOrder.id, workOrderPdfSubmission.id, email);
      window.alert(`The email server accepted the Work Order for ${email}.`);
    } catch (error) {
      window.alert(
        error instanceof Error
          ? error.message
          : 'Could not send the Work Order.',
      );
    } finally {
      setSendingPdf(false);
    }
  };

  const regenerateWorkOrderPdf = async () => {
    if (!workOrderPdfSubmission) return;
    setRegeneratingPdfId(workOrderPdfSubmission.id);
    try {
      const regenerated = await dbRegenerateFormSubmissionPdf(
        workOrderPdfSubmission.id,
      );
      if (regenerated.pdfUrl) {
        window.open(
          publicFileUrl(regenerated.pdfUrl),
          '_blank',
          'noopener,noreferrer',
        );
      }
    } catch (error) {
      window.alert(
        error instanceof Error ? error.message : 'Could not regenerate PDF.',
      );
    } finally {
      setRegeneratingPdfId(null);
    }
  };

  const approveShift = async () => {
    if (
      !window.confirm(
        'Approve this completed shift? Its Work Order + Timesheet PDF will become the final locked version.',
      )
    )
      return;
    setApprovalAction('approve');
    try {
      await approveWorkOrderShift(workOrder.id, shift.id);
      setEditing(false);
      await onRefresh();
    } catch (error) {
      window.alert(
        error instanceof Error ? error.message : 'Could not approve the shift.',
      );
    } finally {
      setApprovalAction(null);
    }
  };

  const reopenShift = async () => {
    if (
      !window.confirm(
        'Reopen this PM Approved shift? The final approval will be removed so it can be edited again.',
      )
    )
      return;
    setApprovalAction('reopen');
    try {
      await reopenWorkOrderShift(workOrder.id, shift.id);
      await onRefresh();
    } catch (error) {
      window.alert(
        error instanceof Error ? error.message : 'Could not reopen the shift.',
      );
    } finally {
      setApprovalAction(null);
    }
  };

  return (
    <div className="min-min-h-[calc(100dvh-64px)] lg:h-[calc(100dvh-64px)] bg-slate-50 p-3 sm:p-6 text-slate-900">
      <button
        onClick={onBack}
        className="inline-flex items-center gap-2 text-sm font-medium text-blue-700 hover:text-blue-900"
      >
        <ArrowLeft size={17} /> Back to Shifts
      </button>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">Shift Details</h1>
          <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
            {statusLabel}
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          {workOrderPdfSubmission?.pdfUrl ? (
            <>
              <a
                href={publicFileUrl(workOrderPdfSubmission.pdfUrl)}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-lg border bg-white px-4 py-2 text-sm font-semibold"
              >
                <Download size={16} /> View / Download PDF
              </a>
              <button
                type="button"
                disabled={
                  sendingPdf || workOrderPdfSubmission.status !== 'submitted'
                }
                onClick={() => void emailWorkOrderPdf()}
                className="rounded-lg border bg-white px-4 py-2 text-sm font-semibold disabled:opacity-50"
              >
                {sendingPdf ? 'Sending...' : 'Email PDF to client'}
              </button>
              <button
                type="button"
                disabled={
                  isPmApproved ||
                  regeneratingPdfId === workOrderPdfSubmission.id
                }
                title={
                  isPmApproved
                    ? 'Reopen the shift before regenerating the final PDF'
                    : undefined
                }
                onClick={() => void regenerateWorkOrderPdf()}
                className="inline-flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-100 disabled:opacity-50"
              >
                <RotateCw
                  size={16}
                  className={
                    regeneratingPdfId === workOrderPdfSubmission.id
                      ? 'animate-spin'
                      : ''
                  }
                />
                {regeneratingPdfId === workOrderPdfSubmission.id
                  ? 'Regenerating...'
                  : 'Regenerate PDF'}
              </button>
            </>
          ) : null}
          <button
            onClick={() => setChatOpen(true)}
            className="inline-flex items-center gap-2 rounded-lg border bg-white px-4 py-2 text-sm font-semibold"
          >
            <MessageSquare size={16} /> Chat History
          </button>
          {isCompleted && isAdmin ? (
            <button
              type="button"
              disabled={approvalAction !== null}
              onClick={() => void approveShift()}
              className="inline-flex items-center gap-2 rounded-lg bg-[#14B8A6] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0F9F91] disabled:opacity-50"
            >
              <ShieldCheck size={16} />{' '}
              {approvalAction === 'approve' ? 'Approving...' : 'Approve Shift'}
            </button>
          ) : null}
          {isPmApproved && isAdmin ? (
            <button
              type="button"
              disabled={approvalAction !== null}
              onClick={() => void reopenShift()}
              className="inline-flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-800 disabled:opacity-50"
            >
              <RotateCw size={16} />{' '}
              {approvalAction === 'reopen' ? 'Reopening...' : 'Reopen Shift'}
            </button>
          ) : null}
          {editing ? (
            <>
              <button
                onClick={() => {
                  setDraft(cloneShift(shift));
                  setShiftSaveError('');
                  setEditing(false);
                }}
                className="inline-flex items-center gap-2 rounded-lg border bg-white px-4 py-2 text-sm font-semibold"
              >
                <X size={16} /> Cancel edit
              </button>
              <button
                disabled={saving}
                onClick={() => void saveDraft()}
                className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
              >
                <Save size={16} /> {saving ? 'Saving...' : 'Save Shift'}
              </button>
            </>
          ) : !isPmApproved ? (
            <button
              onClick={() => setEditing(true)}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white"
            >
              <Pencil size={16} /> Edit Shift
            </button>
          ) : null}
        </div>
      </div>

      <section className="mt-4 rounded-xl border bg-white p-5 shadow-sm">
        <div className="grid gap-5 lg:grid-cols-[64px_1.1fr_1.25fr_1fr_1fr]">
          <div className="rounded-lg border px-3 py-2 text-center">
            <p className="text-2xl font-bold">
              {new Date(`${shift.date}T12:00:00`).getDate()}
            </p>
            <p className="text-xs text-slate-500">
              {new Date(`${shift.date}T12:00:00`).toLocaleDateString('en-US', {
                weekday: 'short',
              })}
            </p>
          </div>
          <Summary
            label={`${visibleShift.startTime} – ${visibleShift.endTime || '—'}`}
            value={shiftTypeLabel}
          />
          <Summary
            label="Location"
            value={
              shift.address ||
              workOrder.assignmentAddress ||
              project?.location ||
              'Location not set'
            }
            icon={<MapPin size={13} />}
          />
          <Summary
            label="Project"
            value={
              [project?.number, project?.name].filter(Boolean).join(' ') ||
              workOrder.title
            }
          />
          <Summary label="Work Order" value={workOrder.title} />
        </div>
      </section>

      <nav className="mt-5 flex overflow-x-auto border-b bg-white px-3">
        {tabLabels.map((item) => (
          <button
            key={item.id}
            onClick={() => setTab(item.id)}
            className={`whitespace-nowrap border-b-2 px-5 py-3 text-sm font-medium ${tab === item.id ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-500'}`}
          >
            {item.label}
            {counts[item.id] !== undefined ? ` (${counts[item.id]})` : ''}
          </button>
        ))}
      </nav>

      <main className="rounded-b-xl border border-t-0 bg-white p-5 shadow-sm">
        {shiftSaveError && tab === 'details' ? (
          <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {shiftSaveError}
          </p>
        ) : null}
        {tab === 'details' ? (
          <DetailsTab
            shift={editing ? draft : shift}
            editing={editing}
            createdByName={createdByName}
            approvedByName={approvedByName}
            showApprovedBy={isPmApproved}
            formTemplates={context.formTemplates}
            onChange={setDraft}
          />
        ) : null}
        {tab === 'workers' ? (
          <AssignmentsTab
            roles={editing ? draft.roles : shift.roles}
            editing={editing}
            options={context.workers.map((worker) => ({
              id: worker.id,
              label: `${worker.firstName} ${worker.lastName}`,
            }))}
            labelFor={(id) => {
              const worker = context.getWorkerById(id);
              return worker ? `${worker.firstName} ${worker.lastName}` : id;
            }}
            onAdd={addRoleWorker}
            onRemove={removeRoleWorker}
            dirty={hasUnsavedShiftChanges}
            saving={saving}
            error={shiftSaveError}
            onSave={saveDraft}
          />
        ) : null}
        {tab === 'equipment' ? (
          <ShiftResourcesTab
            kind="equipment"
            planned={shift.plannedEquipment || []}
            rows={visibleProcessedResources.equipment}
            editing={editing}
            canEdit={Boolean(resourceUsageTarget)}
            options={context.equipment.map((item) => ({
              id: item.id,
              type: item.type || 'Other',
              label: [item.identifier, item.name].filter(Boolean).join(' — '),
            }))}
            onChange={(rows) =>
              setProcessedResources((current) => ({
                ...current,
                equipment: rows,
              }))
            }
            dirty={hasUnsavedShiftChanges || hasUnsavedResourceChanges}
            saving={saving}
            error={shiftSaveError}
            onSave={saveDraft}
          />
        ) : null}
        {tab === 'materials' ? (
          <ShiftResourcesTab
            kind="materials"
            planned={shift.plannedMaterials || []}
            rows={visibleProcessedResources.materials}
            editing={editing}
            canEdit={Boolean(resourceUsageTarget)}
            options={referencedMaterials.map((item) => ({
              id: item.id,
              type: item.type || 'Other',
              label: [item.sku, item.identifier, item.name].filter(Boolean).join(' — '),
              archived: Boolean(item.deletedAt),
            }))}
            onChange={(rows) =>
              setProcessedResources((current) => ({
                ...current,
                materials: rows,
              }))
            }
            dirty={hasUnsavedShiftChanges || hasUnsavedResourceChanges}
            saving={saving}
            error={shiftSaveError}
            onSave={saveDraft}
          />
        ) : null}
        {tab === 'documents' ? <DocumentsTab documents={documents} /> : null}
        {tab === 'timesheets' ? (
          <TimesheetsTab
            rows={timesheets}
            workers={context.workers}
            loading={loadingTimesheets}
            error={timesheetError}
            clientNotes={shift.clientTimesheetNotes || ''}
            internalNotes={shift.internalTimesheetNotes || ''}
            rules={context.settings.overtimeRules}
            onSaved={applySavedTimesheet}
            onSaveNotes={saveTimesheetNotes}
            locked={isPmApproved}
          />
        ) : null}
      </main>

      <ShiftChatAside
        open={chatOpen}
        shift={shift}
        workOrder={workOrder}
        onClose={() => setChatOpen(false)}
      />
    </div>
  );
};

const Summary = ({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
}) => (
  <div className="min-w-0">
    <p className="flex items-center gap-1 text-[11px] font-semibold uppercase text-slate-400">
      {icon}
      {label}
    </p>
    <p className="mt-1 truncate text-sm font-semibold text-slate-800">
      {value || '—'}
    </p>
  </div>
);

const DetailsTab = ({
  shift,
  editing,
  createdByName,
  approvedByName,
  showApprovedBy,
  formTemplates,
  onChange,
}: {
  shift: Shift;
  editing: boolean;
  createdByName: string;
  approvedByName: string;
  showApprovedBy: boolean;
  formTemplates: import('@/lib/types').FormTemplate[];
  onChange: (shift: Shift) => void;
}) => {
  const field = (
    key: keyof Shift,
    label: string,
    type: 'text' | 'date' | 'time' | 'textarea' = 'text',
  ) => (
    <label className="block">
      <span className="text-xs font-semibold uppercase text-slate-500">
        {label}
      </span>
      {editing ? (
        type === 'textarea' ? (
          <textarea
            value={String(shift[key] || '')}
            onChange={(event) =>
              onChange({ ...shift, [key]: event.target.value })
            }
            rows={3}
            className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
          />
        ) : (
          <input
            type={type}
            value={String(shift[key] || '')}
            onChange={(event) =>
              onChange({ ...shift, [key]: event.target.value })
            }
            className="mt-1 h-10 w-full rounded-lg border px-3 text-sm"
          />
        )
      ) : (
        <p className="mt-1 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-800">
          {String(shift[key] || '—')}
        </p>
      )}
    </label>
  );
  const auditField = (label: string, value: string) => (
    <div>
      <span className="text-xs font-semibold uppercase text-slate-500">
        {label}
      </span>
      <p className="mt-1 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-800">
        {value || '—'}
      </p>
    </div>
  );
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {field('shiftName', 'Shift name')}
      {auditField('Created By', createdByName)}
      {showApprovedBy ? auditField('Approved By', approvedByName) : null}
      {field('date', 'Date', 'date')}
      {field('startTime', 'Start time', 'time')}
      {field('endTime', 'End time', 'time')}
      {field('requesterName', 'Requester')}
      {field('requesterPhone', 'Requester phone')}
      {field('requesterEmail', 'Requester email')}
      {field('address', 'Location')}
      {field('crossStreetLocationDetail', 'Cross street / detail')}
      <div className="md:col-span-2 xl:col-span-3">
        <ShiftFormTemplatesPicker
          idAttr="shift-detail-form-templates"
          formTemplates={formTemplates}
          value={shift.formTemplateIds || []}
          disabled={!editing}
          onChange={(formTemplateIds) =>
            onChange({ ...shift, formTemplateIds })
          }
        />
      </div>
      <div className="md:col-span-2 xl:col-span-3">
        {field('notes', 'Shift notes', 'textarea')}
      </div>
    </div>
  );
};

const AssignmentsTab = ({
  roles,
  editing,
  options,
  labelFor,
  onAdd,
  onRemove,
  dirty,
  saving,
  error,
  onSave,
}: {
  roles: ShiftRole[];
  editing: boolean;
  options: Array<{ id: string; label: string }>;
  labelFor: (id: string) => string;
  onAdd: (roleId: string, id: string) => void;
  onRemove: (roleId: string, id: string) => void;
  dirty: boolean;
  saving: boolean;
  error: string;
  onSave: () => Promise<void>;
}) => {
  return (
    <div>
      <div className="grid gap-4 lg:grid-cols-2">
        {roles.map((role) => {
          const values = role.assignedWorkers;
          const workerCapacity = Math.max(1, Number(role.requiredCount || 0));
          const workerRoleAtCapacity = values.length >= workerCapacity;
          return (
            <section key={role.id} className="rounded-xl border p-4">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <h3 className="flex items-center gap-2 font-semibold">
                  <Users size={17} className="text-blue-600" />
                  {role.roleName}
                </h3>
                <span className="text-xs text-slate-500">
                  {values.length} assigned
                </span>
              </div>
              <div className="mt-3 space-y-2">
                {values.map((id) => (
                  <div
                    key={id}
                    className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm flex-wrap gap-3"
                  >
                    <span>{labelFor(id)}</span>
                    {editing ? (
                      <button
                        onClick={() => onRemove(role.id, id)}
                        className="text-red-500"
                      >
                        <Trash2 size={15} />
                      </button>
                    ) : (
                      <Check size={15} className="text-emerald-500" />
                    )}
                  </div>
                ))}
                {values.length === 0 ? (
                  <p className="py-4 text-center text-sm text-slate-400">
                    Nothing assigned.
                  </p>
                ) : null}
              </div>
              {editing && !workerRoleAtCapacity ? (
                <label className="mt-3 flex items-center gap-2 rounded-lg border px-2">
                  <Plus size={15} className="text-blue-600" />
                  <select
                    defaultValue=""
                    onChange={(event) => {
                      onAdd(role.id, event.target.value);
                      event.target.value = '';
                    }}
                    className="h-10 min-w-0 flex-1 bg-white text-sm outline-none"
                  >
                    <option value="">Add to {role.roleName}...</option>
                    {options
                      .filter((option) => !values.includes(option.id))
                      .map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.label}
                        </option>
                      ))}
                  </select>
                </label>
              ) : editing ? (
                <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
                  Role capacity reached ({values.length}/{workerCapacity}).
                </p>
              ) : null}
            </section>
          );
        })}
      </div>
      {editing ? (
        <div className="sticky bottom-3 mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-blue-200 bg-blue-50 p-3 shadow-sm">
          <div>
            <p className="text-sm font-semibold text-blue-900">
              {dirty
                ? 'You have unsaved shift changes.'
                : 'No pending changes.'}
            </p>
            {error ? (
              <p className="mt-1 text-xs text-red-600">{error}</p>
            ) : null}
          </div>
          <button
            type="button"
            disabled={!dirty || saving}
            onClick={() => void onSave()}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            <Save size={16} /> {saving ? 'Saving...' : 'Save Shift'}
          </button>
        </div>
      ) : null}
    </div>
  );
};

type ShiftResourceOption = { id: string; type: string; label: string; archived?: boolean };

const ShiftResourcesTab = ({
  kind,
  planned,
  rows,
  editing,
  canEdit,
  options,
  onChange,
  dirty,
  saving,
  error,
  onSave,
}: {
  kind: 'equipment' | 'materials';
  planned: Array<{ type: string; estimatedQuantity: number }>;
  rows: ProcessedResourceRow[];
  editing: boolean;
  canEdit: boolean;
  options: ShiftResourceOption[];
  onChange: (rows: ProcessedResourceRow[]) => void;
  dirty: boolean;
  saving: boolean;
  error: string;
  onSave: () => Promise<void>;
}) => {
  const [addedTypes, setAddedTypes] = useState<string[]>([]);
  useEffect(() => setAddedTypes([]), [kind]);

  const equipment = kind === 'equipment';
  const title = equipment ? 'Equipment' : 'Materials';
  const singular = equipment ? 'equipment' : 'material';
  const Icon = equipment ? Truck : Package;
  const selectedIds = rows
    .map((row) => (equipment ? row.equipmentId : row.materialId))
    .filter((id): id is string => typeof id === 'string' && Boolean(id));
  const optionById = new Map(options.map((option) => [option.id, option]));
  const selected = rows
    .map((row) => {
      const id = equipment ? row.equipmentId : row.materialId;
      if (!id) return null;
      const option = optionById.get(id);
      return {
        id,
        row,
        type: row.type || option?.type || 'Other',
        label: option?.label || id,
      };
    })
    .filter(
      (
        item,
      ): item is {
        id: string;
        row: ProcessedResourceRow;
        type: string;
        label: string;
      } => item !== null,
    );
  const typeLabelByKey = new Map<string, string>();
  [
    ...planned.map((item) => item.type),
    ...selected.map((item) => item.type),
    ...addedTypes,
  ]
    .map((value) => value.trim())
    .filter(Boolean)
    .forEach((value) => {
      const key = value.toLowerCase();
      if (!typeLabelByKey.has(key)) typeLabelByKey.set(key, value);
    });
  const groups = [...typeLabelByKey.entries()].map(([key, label]) => ({
    key,
    label,
    estimatedQuantity: planned
      .filter((item) => item.type.trim().toLowerCase() === key)
      .reduce(
        (sum, item) => sum + Math.max(0, Number(item.estimatedQuantity || 0)),
        0,
      ),
    selected: selected.filter((item) => item.type.trim().toLowerCase() === key),
    available: options.filter(
      (item) =>
        !item.archived &&
        item.type.trim().toLowerCase() === key &&
        !selectedIds.includes(item.id),
    ),
  }));
  const availableTypeLabels = [
    ...new Map(
      options
        .filter(
          (option) => !option.archived && !typeLabelByKey.has(option.type.trim().toLowerCase()),
        )
        .map((option) => [
          option.type.trim().toLowerCase(),
          option.type.trim(),
        ]),
    ).values(),
  ].filter(Boolean);

  return (
    <div>
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 px-4 py-4">
          <div className="flex items-start gap-3">
            <span
              className={`rounded-lg p-2 ${equipment ? 'bg-blue-50 text-blue-600' : 'bg-purple-50 text-purple-600'}`}
            >
              <Icon size={17} />
            </span>
            <div>
              <h3 className="font-bold text-slate-900">Processed {title}</h3>
              <p className="mt-0.5 text-xs text-slate-500">
                Concrete items recorded for this shift. These resources are not
                assigned to worker roles.
              </p>
            </div>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
            {selectedIds.length} recorded
          </span>
        </header>

        <div className="grid gap-4 p-4 lg:grid-cols-2">
          {groups.map((group) => (
            <section
              key={group.key}
              className="rounded-xl border border-slate-200 p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h4 className="font-semibold text-slate-900">
                    {group.label}
                  </h4>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {group.estimatedQuantity > 0
                      ? `Planned quantity: ${group.estimatedQuantity}`
                      : 'Additional type added after planning'}
                  </p>
                </div>
                <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-600">
                  {group.selected.length} processed
                </span>
              </div>

              <div className="mt-3 space-y-2">
                {group.selected.map((item) => (
                  <div key={item.row.slotId || item.id}>
                    <div className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2 text-sm flex-wrap gap-3">
                      <span className="min-w-0 truncate font-medium text-slate-800">
                        {item.label}
                      </span>
                      {editing && canEdit ? (
                        <button
                          type="button"
                          onClick={() =>
                            onChange(rows.filter((row) => row !== item.row))
                          }
                          className="shrink-0 text-red-500"
                          aria-label={`Remove ${item.label}`}
                        >
                          <Trash2 size={15} />
                        </button>
                      ) : (
                        <Check
                          size={15}
                          className="shrink-0 text-emerald-500"
                        />
                      )}
                    </div>
                    {!equipment ? (
                      <div className="mt-2 flex items-center justify-end gap-2 text-xs text-slate-500">
                        <span className="font-semibold uppercase">
                          Actual qty used
                        </span>
                        {editing && canEdit ? (
                          <input
                            type="number"
                            min={0}
                            value={Math.max(
                              0,
                              Number(item.row.actualQuantity || 0),
                            )}
                            onChange={(event) =>
                              onChange(
                                rows.map((row) =>
                                  row === item.row
                                    ? {
                                        ...row,
                                        actualQuantity: Math.max(
                                          0,
                                          Number(event.target.value) || 0,
                                        ),
                                      }
                                    : row,
                                ),
                              )
                            }
                            className="h-8 w-20 rounded-lg border border-slate-200 text-center font-semibold text-slate-800"
                          />
                        ) : (
                          <span className="rounded-md bg-slate-100 px-2 py-1 font-bold text-slate-700">
                            {Math.max(0, Number(item.row.actualQuantity || 0))}
                          </span>
                        )}
                      </div>
                    ) : null}
                  </div>
                ))}
                {group.selected.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-slate-200 px-3 py-4 text-center text-xs text-slate-400">
                    No processed {singular} recorded for this type.
                  </p>
                ) : null}
              </div>

              {editing && canEdit && group.available.length > 0 ? (
                <label className="mt-3 flex items-center gap-2 rounded-lg border border-slate-200 px-2">
                  <Plus
                    size={15}
                    className={equipment ? 'text-blue-600' : 'text-purple-600'}
                  />
                  <select
                    defaultValue=""
                    onChange={(event) => {
                      const id = event.target.value;
                      if (id) {
                        onChange([
                          ...rows,
                          {
                            type: group.label,
                            slotId: `shift-detail-${kind}-${Date.now()}`,
                            ...(equipment
                              ? { equipmentId: id }
                              : { materialId: id, actualQuantity: 1 }),
                          },
                        ]);
                      }
                      event.target.value = '';
                    }}
                    className="h-10 min-w-0 flex-1 bg-white text-sm outline-none"
                  >
                    <option value="">Add another {group.label}...</option>
                    {group.available.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
            </section>
          ))}

          {groups.length === 0 ? (
            <p className="col-span-full rounded-xl border border-dashed border-slate-200 py-12 text-center text-sm text-slate-500">
              No planned or processed {title.toLowerCase()} for this shift.
            </p>
          ) : null}
        </div>

        {editing && canEdit && availableTypeLabels.length > 0 ? (
          <label className="mx-4 mb-4 flex items-center gap-2 rounded-lg border border-dashed border-slate-300 px-3">
            <Plus
              size={15}
              className={equipment ? 'text-blue-600' : 'text-purple-600'}
            />
            <select
              defaultValue=""
              onChange={(event) => {
                const value = event.target.value;
                if (value) setAddedTypes((current) => [...current, value]);
                event.target.value = '';
              }}
              className="h-11 min-w-0 flex-1 bg-white text-sm font-semibold outline-none"
            >
              <option value="">
                Add {equipment ? 'Equipment' : 'Material'} Type
              </option>
              {availableTypeLabels.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {editing && !canEdit ? (
          <p className="mx-4 mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
            No submitted resource-usage form exists for this shift. Processed
            resources cannot be edited until mobile records them.
          </p>
        ) : null}
      </section>

      {editing ? (
        <div className="sticky bottom-3 mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-blue-200 bg-blue-50 p-3 shadow-sm">
          <div>
            <p className="text-sm font-semibold text-blue-900">
              {dirty
                ? 'You have unsaved shift changes.'
                : 'No pending changes.'}
            </p>
            {error ? (
              <p className="mt-1 text-xs text-red-600">{error}</p>
            ) : null}
          </div>
          <button
            type="button"
            disabled={!dirty || saving}
            onClick={() => void onSave()}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            <Save size={16} /> {saving ? 'Saving...' : 'Save Shift'}
          </button>
        </div>
      ) : null}
    </div>
  );
};

const DocumentsTab = ({
  documents,
}: {
  documents: Array<{ id: string; name: string; url: string; source: string }>;
}) => (
  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
    {documents.map((document) => (
      <a
        key={document.id}
        href={document.url}
        target="_blank"
        rel="noreferrer"
        className="flex items-center gap-3 rounded-xl border p-4 hover:border-blue-300 hover:bg-blue-50"
      >
        <FileText size={22} className="text-red-500" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold">
            {document.name}
          </span>
          <span className="text-xs text-slate-500">{document.source}</span>
        </span>
        <Download size={16} />
      </a>
    ))}
    {documents.length === 0 ? (
      <p className="col-span-full py-12 text-center text-sm text-slate-500">
        No documents available for this shift.
      </p>
    ) : null}
  </div>
);

const TimesheetsTab = ({
  rows,
  workers,
  loading,
  error,
  clientNotes,
  internalNotes,
  rules,
  onSaved,
  onSaveNotes,
  locked,
}: {
  rows: Timesheet[];
  workers: Array<{ id: string; firstName: string; lastName: string }>;
  loading: boolean;
  error: string;
  clientNotes: string;
  internalNotes: string;
  rules: OvertimeRule;
  onSaved: (saved: Timesheet) => Promise<void>;
  onSaveNotes: (variant: 'client' | 'internal', notes: string) => Promise<void>;
  locked: boolean;
}) => {
  if (loading)
    return (
      <TableLoading label="Loading timesheets…" />
    );
  if (error || rows.length === 0)
    return (
      <p className="py-12 text-center text-sm text-slate-500">
        No timesheet available yet.
      </p>
    );
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <TimesheetCard
        variant="client"
        rows={rows.filter((row) => (row.variant || 'internal') === 'client')}
        workers={workers}
        notes={clientNotes}
        rules={rules}
        onSaved={onSaved}
        onSaveNotes={onSaveNotes}
        locked={locked}
      />
      <TimesheetCard
        variant="internal"
        rows={rows.filter((row) => (row.variant || 'internal') === 'internal')}
        workers={workers}
        notes={internalNotes}
        rules={rules}
        onSaved={onSaved}
        onSaveNotes={onSaveNotes}
        locked={locked}
      />
    </div>
  );
};

const TimesheetCard = ({
  variant,
  rows,
  workers,
  notes,
  rules,
  onSaved,
  onSaveNotes,
  locked,
}: {
  variant: 'client' | 'internal';
  rows: Timesheet[];
  workers: Array<{ id: string; firstName: string; lastName: string }>;
  notes: string;
  rules: OvertimeRule;
  onSaved: (saved: Timesheet) => Promise<void>;
  onSaveNotes: (variant: 'client' | 'internal', notes: string) => Promise<void>;
  locked: boolean;
}) => {
  const [notesDraft, setNotesDraft] = useState(notes);
  const [savingNotes, setSavingNotes] = useState(false);
  const [draftHoursByRow, setDraftHoursByRow] = useState<
    Record<string, EditableHours>
  >({});
  useEffect(() => setNotesDraft(notes), [notes]);
  const tone = variant === 'client' ? 'blue' : 'emerald';
  const hoursForRow = (row: Timesheet) =>
    draftHoursByRow[row.id] ?? {
      regularHours: numeric(row.regularHours),
      overtimeHours: numeric(row.overtimeHours),
      doubleTimeHours: numeric(row.doubleTimeHours),
    };
  const st = rows.reduce((sum, row) => sum + hoursForRow(row).regularHours, 0);
  const ot = rows.reduce((sum, row) => sum + hoursForRow(row).overtimeHours, 0);
  const dt = rows.reduce(
    (sum, row) => sum + hoursForRow(row).doubleTimeHours,
    0,
  );
  const total = st + ot + dt;
  const updateDraftHours = (rowId: string, hours: EditableHours | null) => {
    setDraftHoursByRow((current) => {
      if (hours) return { ...current, [rowId]: hours };
      const next = { ...current };
      delete next[rowId];
      return next;
    });
  };
  return (
    <section
      className={`overflow-hidden rounded-xl border ${variant === 'client' ? 'border-blue-200' : 'border-emerald-200'}`}
    >
      <header
        className={`flex items-center justify-between px-4 py-3 ${variant === 'client' ? 'bg-blue-50 text-blue-800' : 'bg-emerald-50 text-emerald-800'}`}
      >
        <h3 className="flex items-center gap-2 font-bold">
          {variant === 'client' ? (
            <Briefcase size={17} />
          ) : (
            <LockKeyhole size={17} />
          )}
          {variant === 'client' ? 'CLIENT TIMESHEET' : 'INTERNAL TIMESHEET'}
        </h3>
        <span className="rounded-full bg-white/80 px-2 py-1 text-[10px] font-semibold">
          {variant === 'client' ? 'For Work Order PDF' : 'Payroll / internal'}
        </span>
      </header>
      <div className="p-4">
        <p className="text-xs text-slate-500">
          {variant === 'client'
            ? 'Initialized from the mobile capture and editable for the customer document.'
            : 'Initialized from the same capture and editable independently for payroll.'}
        </p>
        <div className="responsive-grid mt-4 grid grid-cols-4 gap-2 rounded-lg bg-slate-50 p-3 text-center">
          <Metric label="ST" value={st} />
          <Metric label="OT" value={ot} />
          <Metric label="DT" value={dt} />
          <Metric label="Total" value={total} />
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-[720px] w-full text-sm">
            <thead>
              <tr className="border-b text-left text-[10px] uppercase text-slate-400">
                <th className="py-2">Worker</th>
                <th>Start</th>
                <th>End</th>
                <th>Break (min)</th>
                <th>Lunch</th>
                <th>ST</th>
                <th>OT</th>
                <th>DT</th>
                <th>Total</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <EditableTimesheetRow
                  key={row.id}
                  row={row}
                  workers={workers}
                  rules={rules}
                  onSaved={onSaved}
                  onDraftHoursChange={(hours) =>
                    updateDraftHours(row.id, hours)
                  }
                  locked={locked}
                />
              ))}
            </tbody>
          </table>
          {rows.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-400">
              No timesheet rows for this variant.
            </p>
          ) : null}
        </div>
        <label className="mt-4 block">
          <span
            className={`text-xs font-semibold ${tone === 'blue' ? 'text-blue-700' : 'text-emerald-700'}`}
          >
            {variant === 'client'
              ? 'Client timesheet notes'
              : 'Internal timesheet notes'}
          </span>
          <textarea
            disabled={locked}
            value={notesDraft}
            onChange={(event) => setNotesDraft(event.target.value)}
            rows={3}
            className="mt-1 w-full rounded-lg border px-3 py-2 text-sm disabled:bg-slate-100"
            placeholder="Add notes if needed..."
          />
        </label>
        <button
          disabled={locked || savingNotes || notesDraft === notes}
          onClick={async () => {
            setSavingNotes(true);
            try {
              await onSaveNotes(variant, notesDraft);
            } finally {
              setSavingNotes(false);
            }
          }}
          className={`mt-2 inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold text-white disabled:opacity-40 ${variant === 'client' ? 'bg-blue-600' : 'bg-emerald-600'}`}
        >
          <Save size={14} /> {savingNotes ? 'Saving...' : 'Save notes'}
        </button>
      </div>
    </section>
  );
};

const Metric = ({ label, value }: { label: string; value: number }) => (
  <div>
    <p className="text-[10px] uppercase text-slate-400">{label}</p>
    <p className="font-bold">{value.toFixed(2)}</p>
  </div>
);

const EditableTimesheetRow = ({
  row,
  workers,
  rules,
  onSaved,
  onDraftHoursChange,
  locked,
}: {
  row: Timesheet;
  workers: Array<{ id: string; firstName: string; lastName: string }>;
  rules: OvertimeRule;
  onSaved: (saved: Timesheet) => Promise<void>;
  onDraftHoursChange: (hours: EditableHours | null) => void;
  locked: boolean;
}) => {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const draftFromRow = (value: Timesheet) => ({
    workerId: value.workerId,
    clockIn: editableTimeValue(value.clockIn),
    clockOut: editableTimeValue(value.clockOut),
    breakMinutes: value.breakMinutes,
    lunchTaken: Boolean(value.lunchTaken),
    regularHours: numeric(value.regularHours),
    overtimeHours: numeric(value.overtimeHours),
    doubleTimeHours: numeric(value.doubleTimeHours),
  });
  const [draft, setDraft] = useState(() => draftFromRow(row));
  useEffect(() => setDraft(draftFromRow(row)), [row]);
  const workerName = workers.find((worker) => worker.id === row.workerId);
  const draftTotal =
    draft.regularHours + draft.overtimeHours + draft.doubleTimeHours;
  const updateAndRecalculate = (
    updates: Partial<
      Pick<typeof draft, 'clockIn' | 'clockOut' | 'breakMinutes' | 'lunchTaken'>
    >,
  ) => {
    const next = { ...draft, ...updates };
    const calculated = calculateEditedHours(next, row.date, rules);
    const updated = calculated ? { ...next, ...calculated } : next;
    setDraft(updated);
    onDraftHoursChange(updated);
  };
  const save = async () => {
    setSaving(true);
    try {
      const saved = await dbUpdateTimesheet(row.id, draft);
      await onSaved(saved);
      onDraftHoursChange(null);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };
  return (
    <tr className="border-b border-slate-100">
      <td className="py-2 pr-2 font-medium">
        {editing ? (
          <select
            value={draft.workerId}
            onChange={(event) =>
              setDraft({ ...draft, workerId: event.target.value })
            }
            className="w-40 rounded border px-1 py-1"
          >
            {workers.map((worker) => (
              <option key={worker.id} value={worker.id}>
                {worker.firstName} {worker.lastName}
              </option>
            ))}
          </select>
        ) : workerName ? (
          `${workerName.firstName} ${workerName.lastName}`
        ) : (
          row.workerId
        )}
      </td>
      <td>
        {editing ? (
          <input
            type="time"
            value={draft.clockIn}
            onChange={(event) =>
              updateAndRecalculate({ clockIn: event.target.value })
            }
            className="w-24 rounded border px-1 py-1"
          />
        ) : (
          row.clockIn
        )}
      </td>
      <td>
        {editing ? (
          <input
            type="time"
            value={draft.clockOut}
            onChange={(event) =>
              updateAndRecalculate({ clockOut: event.target.value })
            }
            className="w-24 rounded border px-1 py-1"
          />
        ) : (
          row.clockOut
        )}
      </td>
      <td>
        {editing ? (
          <input
            type="number"
            min={0}
            value={draft.breakMinutes}
            onChange={(event) =>
              updateAndRecalculate({ breakMinutes: Number(event.target.value) })
            }
            className="w-16 rounded border px-1 py-1"
          />
        ) : (
          row.breakMinutes
        )}
      </td>
      <td>
        {editing ? (
          <input
            type="checkbox"
            checked={draft.lunchTaken}
            onChange={(event) =>
              updateAndRecalculate({ lunchTaken: event.target.checked })
            }
          />
        ) : row.lunchTaken ? (
          'Yes'
        ) : (
          'No'
        )}
      </td>
      <td>
        {editing ? (
          <HoursInput
            value={draft.regularHours}
            onChange={(regularHours) => {
              const next = { ...draft, regularHours };
              setDraft(next);
              onDraftHoursChange(next);
            }}
          />
        ) : (
          numeric(row.regularHours).toFixed(2)
        )}
      </td>
      <td>
        {editing ? (
          <HoursInput
            value={draft.overtimeHours}
            onChange={(overtimeHours) => {
              const next = { ...draft, overtimeHours };
              setDraft(next);
              onDraftHoursChange(next);
            }}
          />
        ) : (
          numeric(row.overtimeHours).toFixed(2)
        )}
      </td>
      <td>
        {editing ? (
          <HoursInput
            value={draft.doubleTimeHours}
            onChange={(doubleTimeHours) => {
              const next = { ...draft, doubleTimeHours };
              setDraft(next);
              onDraftHoursChange(next);
            }}
          />
        ) : (
          numeric(row.doubleTimeHours).toFixed(2)
        )}
      </td>
      <td className="font-semibold">
        {(editing ? draftTotal : hoursTotal(row)).toFixed(2)}
      </td>
      <td className="text-right">
        {editing ? (
          <div className="flex justify-end gap-1">
            <button
              disabled={saving}
              onClick={() => void save()}
              className="rounded p-1 text-emerald-600"
            >
              <Save size={15} />
            </button>
            <button
              onClick={() => {
                setDraft(draftFromRow(row));
                onDraftHoursChange(null);
                setEditing(false);
              }}
              className="rounded p-1 text-slate-400"
            >
              <X size={15} />
            </button>
          </div>
        ) : !locked ? (
          <button
            onClick={() => setEditing(true)}
            className="rounded p-1 text-blue-600"
          >
            <Pencil size={15} />
          </button>
        ) : (
          <LockKeyhole size={14} className="ml-auto text-slate-400" />
        )}
      </td>
    </tr>
  );
};

const HoursInput = ({
  value,
  onChange,
}: {
  value: number;
  onChange: (value: number) => void;
}) => (
  <input
    type="number"
    min={0}
    step="0.25"
    value={value}
    onChange={(event) => onChange(Number(event.target.value))}
    className="w-16 rounded border px-1 py-1"
  />
);
