import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { appDataKey, shouldRetryAppRead } from '@/lib/appDataQueries';
import { usePagedCatalog } from '@/hooks/use-paged-catalog';
import { useDeferredAppData } from '@/hooks/use-deferred-app-data';
import CatalogPagination from '@/components/shared/CatalogPagination';
import CatalogQueryState from '@/components/shared/CatalogQueryState';
import { fetchSubmissionCount, fetchSubmissionDetail } from '@/lib/db';
import React, { useState, useMemo, useEffect } from 'react';
import { useAppContext, AppContextOverride } from '@/contexts/AppContext';
import { useToast } from '@/hooks/use-toast';
import {
  Plus,
  Search,
  FileText,
  Eye,
  Edit2,
  Copy,
  Trash2,
  X,
  GripVertical,
  Type,
  Hash,
  List,
  CheckSquare,
  PenTool,
  Camera,
  Calendar,
  Clock,
  AlignLeft,
  ClipboardList,
  Users,
  MapPin,
  Save,
  Check,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Link2,
  Loader2,
  Paperclip,
} from 'lucide-react';
import {
  FormTemplate,
  FormField,
  FormSubmission,
  Timesheet,
} from '@/lib/types';
import { dbFetchFormDataBindings, dbFetchFormContextPreview } from '@/lib/db';

const fieldTypeIcons: Record<string, React.ReactNode> = {
  text: <Type size={14} />,
  number: <Hash size={14} />,
  dropdown: <List size={14} />,
  checkbox: <CheckSquare size={14} />,
  signature: <PenTool size={14} />,
  photo: <Camera size={14} />,
  attachment: <Paperclip size={14} />,
  date: <Calendar size={14} />,
  time: <Clock size={14} />,
  textarea: <AlignLeft size={14} />,
  timesheet: <Users size={14} />,
  resource_usage: <ClipboardList size={14} />,
  work_order_types: <CheckSquare size={14} />,
};
const CONTRACT_VERSION = '1.0.0';
const SUPPORTED_FIELD_TYPES = new Set<FormField['type']>([
  'text',
  'number',
  'dropdown',
  'checkbox',
  'signature',
  'photo',
  'attachment',
  'date',
  'textarea',
  'time',
  'timesheet',
  'resource_usage',
  'work_order_types',
]);

function asArray<T>(value: T[] | unknown): T[] {
  return Array.isArray(value) ? value : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeRenderableFields(
  fields: FormTemplate['fields'] | unknown,
): FormField[] {
  return asArray<unknown>(fields).map((rawField, index) => {
    const field = isRecord(rawField) ? rawField : {};
    const rawType = typeof field.type === 'string' ? field.type : '';
    const type = SUPPORTED_FIELD_TYPES.has(rawType as FormField['type'])
      ? (rawType as FormField['type'])
      : 'text';
    const id =
      typeof field.id === 'string' && field.id.trim()
        ? field.id
        : typeof field.key === 'string' && field.key.trim()
          ? field.key
          : `field_${index + 1}`;
    const label =
      typeof field.label === 'string' && field.label.trim()
        ? field.label
        : `Field ${index + 1}`;
    const rules = isRecord(field.rules) ? field.rules : undefined;
    const ui = isRecord(field.ui) ? field.ui : undefined;
    const dataBinding =
      type !== 'resource_usage' &&
      type !== 'work_order_types' &&
      isRecord(field.dataBinding) &&
      typeof field.dataBinding.path === 'string'
        ? {
            path: field.dataBinding.path,
            optional:
              typeof field.dataBinding.optional === 'boolean'
                ? field.dataBinding.optional
                : true,
            editable:
              typeof field.dataBinding.editable === 'boolean'
                ? field.dataBinding.editable
                : true,
          }
        : undefined;

    return {
      id,
      key: typeof field.key === 'string' && field.key.trim() ? field.key : id,
      label,
      type,
      required: typeof field.required === 'boolean' ? field.required : false,
      placeholder:
        typeof field.placeholder === 'string' ? field.placeholder : undefined,
      version:
        typeof field.version === 'string' ? field.version : CONTRACT_VERSION,
      dataBinding,
      options: Array.isArray(field.options)
        ? field.options.filter(
            (option): option is string => typeof option === 'string',
          )
        : undefined,
      rules: rules
        ? {
            ...rules,
            acceptedMimeTypes: Array.isArray(rules.acceptedMimeTypes)
              ? rules.acceptedMimeTypes.filter(
                  (mime): mime is string => typeof mime === 'string',
                )
              : undefined,
          }
        : undefined,
      ui: ui
        ? {
            ...ui,
            quickTags: Array.isArray(ui.quickTags)
              ? ui.quickTags.filter(
                  (tag): tag is string => typeof tag === 'string',
                )
              : undefined,
          }
        : undefined,
    };
  });
}

function formatSubmissionValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '-';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'string') return value;
  if (Array.isArray(value))
    return value.length
      ? `${value.length} item${value.length === 1 ? '' : 's'}`
      : '-';
  if (isRecord(value)) return JSON.stringify(value);
  return String(value);
}

function isSignatureImageValue(
  value: unknown,
): value is { type: 'signature-image'; dataUrl: string } {
  return (
    isRecord(value) &&
    value.type === 'signature-image' &&
    typeof value.dataUrl === 'string' &&
    value.dataUrl.startsWith('data:image/')
  );
}

function signatureImageValue(
  value: unknown,
): { type: 'signature-image'; dataUrl: string } | null {
  if (isSignatureImageValue(value)) return value;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed.startsWith('{') || !trimmed.includes('signature-image'))
    return null;
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    return isSignatureImageValue(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function isTimesheetRows(value: unknown): value is Record<string, unknown>[] {
  return (
    Array.isArray(value) &&
    value.some((entry) => isRecord(entry) && typeof entry.workerId === 'string')
  );
}

function submissionResponseItems(
  submission: FormSubmission,
  template?: FormTemplate,
) {
  const data = isRecord(submission.data) ? submission.data : {};
  const fields = normalizeRenderableFields(template?.fields ?? []);
  const templateItems = fields
    .filter((field) => Object.prototype.hasOwnProperty.call(data, field.id))
    .map((field) => ({
      id: field.id,
      label: field.label,
      type: field.type,
      value: data[field.id],
    }));
  const knownIds = new Set(templateItems.map((item) => item.id));
  const extraItems = Object.entries(data)
    .filter(([key]) => key !== '_meta' && !knownIds.has(key))
    .map(([key, value]) => ({
      id: key,
      label: key.replace(/[_-]+/g, ' '),
      type: isTimesheetRows(value) ? 'timesheet' : 'text',
      value,
    }));
  return [...templateItems, ...extraItems];
}

function TimesheetRowsGrid({ rows }: { rows: Record<string, unknown>[] }) {
  return (
    <div className="mt-2 overflow-hidden rounded-lg border border-gray-200">
      <div className="grid grid-cols-7 bg-gray-50 text-[10px] font-semibold uppercase text-gray-500">
        <div className="px-2 py-2">Worker</div>
        <div className="px-2 py-2">Date</div>
        <div className="px-2 py-2">Time</div>
        <div className="px-2 py-2">ST</div>
        <div className="px-2 py-2">OT/DT</div>
        <div className="px-2 py-2">Status</div>
        <div className="px-2 py-2">Signature</div>
      </div>
      {rows.map((row, index) => (
        <div
          key={`${String(row.workerId || index)}-${index}`}
          className="grid grid-cols-7 border-t border-gray-100 text-xs text-gray-700"
        >
          <div className="px-2 py-2 font-medium text-gray-900">
            {formatSubmissionValue(row.workerName || row.workerId)}
          </div>
          <div className="px-2 py-2">
            {formatSubmissionValue(row.shiftDate || row.date)}
          </div>
          <div className="px-2 py-2">
            {[row.startTime || row.clockIn, row.endTime || row.clockOut]
              .filter(Boolean)
              .join(' - ') || '-'}
          </div>
          <div className="px-2 py-2">
            {formatSubmissionValue(row.st || row.regularHours || 0)}
          </div>
          <div className="px-2 py-2">
            {formatSubmissionValue(row.ot || row.overtimeHours || 0)} /{' '}
            {formatSubmissionValue(row.dt || row.doubleTimeHours || 0)}
          </div>
          <div className="px-2 py-2 capitalize">
            {formatSubmissionValue(row.status)}
          </div>
          <div className="px-2 py-2">
            {signatureImageValue(row.signature) ? (
              <img
                src={signatureImageValue(row.signature)?.dataUrl}
                alt={`${formatSubmissionValue(row.workerName || row.workerId)} signature`}
                className="h-10 max-w-[120px] rounded border border-gray-200 bg-white object-contain"
              />
            ) : row.signature ? (
              <span className="text-[11px] text-gray-500">Captured</span>
            ) : (
              <span className="text-[11px] text-gray-400">-</span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function SubmissionValuePreview({ value }: { value: unknown }) {
  const signature = signatureImageValue(value);
  if (signature) {
    return (
      <div className="mt-2 rounded-lg border border-gray-200 bg-white p-2">
        <img
          src={signature.dataUrl}
          alt="Signature"
          className="h-24 w-full object-contain"
        />
      </div>
    );
  }

  return (
    <p className="mt-2 whitespace-pre-wrap break-words text-sm text-gray-900">
      {formatSubmissionValue(value)}
    </p>
  );
}

function SubmissionDetailPanel({
  submission,
  template,
  onClose,
  onDelete,
}: {
  submission: FormSubmission | null;
  template?: FormTemplate;
  onClose: () => void;
  onDelete: (submission: FormSubmission) => void;
}) {
  if (!submission) {
    return (
      <div className="rounded-xl border border-dashed border-gray-300 bg-white p-3 sm:p-6 text-center text-sm text-gray-500">
        Select a submission to review its responses.
      </div>
    );
  }

  const items = submissionResponseItems(submission, template);

  return (
    <div className="rounded-xl border border-gray-200 bg-white">
      <div className="flex items-start justify-between border-b border-gray-200 px-4 py-3 flex-wrap gap-3">
        <div>
          <h3 className="font-semibold text-gray-900">
            {template?.name || 'Form response'}
          </h3>
          <p className="mt-0.5 text-xs text-gray-500">
            Assignment {submission.workOrderId || '-'}{' '}
            {submission.shiftId ? `· Shift ${submission.shiftId}` : ''}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => onDelete(submission)}
            className="rounded-lg p-1.5 text-red-500 hover:bg-red-50 hover:text-red-700"
            title="Delete submission"
          >
            <Trash2 size={15} />
          </button>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <X size={16} />
          </button>
        </div>
      </div>
      <div className="max-h-[62vh] space-y-3 overflow-y-auto p-4">
        {items.length === 0 ? (
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm text-gray-500">
            This submission has no response data.
          </div>
        ) : (
          items.map((item) => (
            <div
              key={item.id}
              className="rounded-lg border border-gray-200 bg-gray-50 p-3"
            >
              <div className="flex items-center justify-between gap-2 flex-wrap gap-3">
                <p className="text-xs font-semibold uppercase text-gray-500">
                  {item.label}
                </p>
                <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-medium text-gray-500">
                  {item.type}
                </span>
              </div>
              {isTimesheetRows(item.value) ? (
                <TimesheetRowsGrid rows={item.value} />
              ) : (
                <SubmissionValuePreview value={item.value} />
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

const FormsView: React.FC = () => {
  const {
    formTemplates,
    statusCatalog,
    addFormTemplate,
    updateFormTemplate,
    deleteFormTemplate,
  } = useAppContext();
  const { toast } = useToast();
  const [tab, setTab] = useState<'templates' | 'submissions'>('templates');
  const [search, setSearch] = useState('');
  const [editingTemplate, setEditingTemplate] = useState<string | null>(null);
  const [showBuilder, setShowBuilder] = useState(false);
  const [previewTemplate, setPreviewTemplate] = useState<string | null>(null);
  const [selectedSubmissionId, setSelectedSubmissionId] = useState<
    string | null
  >(null);
  const { user } = useAuth();
  const catalog = usePagedCatalog<Omit<FormSubmission, 'data'>>(
    'formSubmissions',
    { search },
    tab === 'submissions',
  );
  const count = useQuery({
    queryKey: [...appDataKey(user?.id || 'guest', 'formSubmissions'), 'count'],
    queryFn: ({ signal }) => fetchSubmissionCount(signal),
    enabled: Boolean(user),
    staleTime: 30000,
    refetchOnWindowFocus: false,
    retry: shouldRetryAppRead,
  });
  const detail = useQuery({
    queryKey: [
      ...appDataKey(user?.id || 'guest', 'formSubmissions'),
      'record',
      selectedSubmissionId,
    ],
    queryFn: ({ signal }) =>
      fetchSubmissionDetail(selectedSubmissionId!, signal),
    enabled: Boolean(
      user &&
      selectedSubmissionId &&
      tab === 'submissions' &&
      catalog.rows.some((row) => row.id === selectedSubmissionId),
    ),
    refetchOnWindowFocus: false,
    retry: shouldRetryAppRead,
  });
  const related = useDeferredAppData(['workOrders'], showBuilder);
  const deleteFormSubmission = catalog.overrides.deleteFormSubmission!;
  const workOrders = catalog.lookups?.workOrders || [];
  const getProjectById = (id: string) =>
    catalog.lookups?.projects.find((item) => item.id === id);

  const formSubmissionStatuses = useMemo(() => {
    const configured = statusCatalog
      .filter(
        (item) => item.scope === 'form_submission' && item.status === 'active',
      )
      .sort(
        (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name),
      );
    if (configured.length > 0) return configured;
    return [
      {
        id: 'fs_submitted',
        scope: 'form_submission',
        value: 'submitted',
        name: 'Submitted',
        color: '#F59E0B',
        sortOrder: 10,
        blocksEditing: false,
        triggersNotification: true,
        requiresApproval: true,
        status: 'active',
      },
      {
        id: 'fs_reviewed',
        scope: 'form_submission',
        value: 'reviewed',
        name: 'Reviewed',
        color: '#22C55E',
        sortOrder: 20,
        blocksEditing: false,
        triggersNotification: false,
        requiresApproval: false,
        status: 'active',
      },
      {
        id: 'fs_flagged',
        scope: 'form_submission',
        value: 'flagged',
        name: 'Flagged',
        color: '#EF4444',
        sortOrder: 30,
        blocksEditing: false,
        triggersNotification: true,
        requiresApproval: true,
        status: 'active',
      },
    ];
  }, [statusCatalog]);

  const formSubmissionStatusMap = useMemo(
    () => new Map(formSubmissionStatuses.map((item) => [item.value, item])),
    [formSubmissionStatuses],
  );

  const filteredTemplates = formTemplates.filter(
    (ft) =>
      (ft.name || '').toLowerCase().includes(search.toLowerCase()) ||
      (ft.category || '').toLowerCase().includes(search.toLowerCase()),
  );

  const filteredSubmissions = catalog.rows;
  const selectedSubmission =
    selectedSubmissionId &&
    catalog.rows.some((row) => row.id === selectedSubmissionId)
      ? detail.data || null
      : null;
  const selectedSubmissionTemplate = selectedSubmission
    ? formTemplates.find((ft) => ft.id === selectedSubmission.templateId)
    : undefined;
  const submittedByLabel = (id?: string) =>
    id ? catalog.lookups?.submitters[id] || id : '-';

  const handleDeleteTemplate = async (template: FormTemplate) => {
    const confirmed = window.confirm(
      `Delete form "${template.name}"? This action cannot be undone.`,
    );
    if (!confirmed) return;

    try {
      await deleteFormTemplate(template.id);
      toast({
        title: 'Form deleted',
        description: `"${template.name}" was deleted successfully.`,
      });
    } catch (error) {
      console.error('Failed to delete form template', error);
      toast({
        title: 'Unable to delete form',
        description: 'Please check your permissions and try again.',
        variant: 'destructive',
      });
    }
  };

  const handleDeleteSubmission = async (submission: FormSubmission) => {
    const template = formTemplates.find(
      (ft) => ft.id === submission.templateId,
    );
    const confirmed = window.confirm(
      `Delete submission "${template?.name || submission.id}"? This action cannot be undone.`,
    );
    if (!confirmed) return;

    try {
      await deleteFormSubmission(submission.id);
      setSelectedSubmissionId(null);
      toast({
        title: 'Submission deleted',
        description: 'The form submission was deleted successfully.',
      });
    } catch (error) {
      console.error('Failed to delete form submission', error);
      toast({
        title: 'Unable to delete submission',
        description: 'Please check your permissions and try again.',
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="p-3 sm:p-6 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-800">
            Forms & Field Data
          </h2>
          <p className="text-sm text-gray-500">
            Create, manage, and review field forms
          </p>
        </div>
        <button
          onClick={() => setShowBuilder(true)}
          className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 flex items-center gap-1"
        >
          <Plus size={14} /> Create Form
        </button>
      </div>

      {}
      <div className="flex border-b border-gray-200">
        <button
          onClick={() => setTab('templates')}
          className={`px-4 py-2 text-sm font-medium border-b-2 flex items-center gap-1.5 ${tab === 'templates' ? 'text-primary border-blue-600' : 'text-gray-500 border-transparent'}`}
        >
          <FileText size={14} />
          Form Templates ({formTemplates.length})
        </button>
        <button
          onClick={() => setTab('submissions')}
          className={`px-4 py-2 text-sm font-medium border-b-2 flex items-center gap-1.5 ${tab === 'submissions' ? 'text-primary border-blue-600' : 'text-gray-500 border-transparent'}`}
        >
          <ClipboardList size={14} />
          Submissions ({count.data?.total ?? catalog.meta?.totalItems ?? '…'})
        </button>
      </div>

      <div className="flex items-center bg-white rounded-lg border border-gray-200 px-3 py-1.5 max-w-sm">
        <Search size={14} className="text-gray-400 mr-2" />
        <input
          placeholder="Search forms..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="bg-transparent text-sm outline-none w-full"
        />
      </div>

      {tab === 'templates' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredTemplates.map((ft) => (
            <div
              key={ft.id}
              className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                  <FileText size={20} className="text-purple-600" />
                </div>
                <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                  {ft.category}
                </span>
              </div>
              <h3 className="font-semibold text-gray-800 mb-1">{ft.name}</h3>
              <p className="text-sm text-gray-500 mb-3">{ft.description}</p>
              <div className="flex items-center gap-2 text-xs text-gray-400 mb-3">
                <span>
                  {normalizeRenderableFields(ft.fields).length} fields
                </span>
                <span>|</span>
                <span>
                  Updated {new Date(ft.updatedAt).toLocaleDateString()}
                </span>
              </div>
              <div className="flex gap-1">
                <button
                  onClick={() => setPreviewTemplate(ft.id)}
                  className="flex-1 px-3 py-1.5 border border-gray-200 rounded text-sm text-gray-600 hover:bg-gray-50 flex items-center justify-center gap-1"
                >
                  <Eye size={12} /> Preview
                </button>
                <button
                  onClick={() => {
                    setEditingTemplate(ft.id);
                    setShowBuilder(true);
                  }}
                  className="flex-1 px-3 py-1.5 border border-gray-200 rounded text-sm text-gray-600 hover:bg-gray-50 flex items-center justify-center gap-1"
                >
                  <Edit2 size={12} /> Edit
                </button>
                <button
                  onClick={() => void handleDeleteTemplate(ft)}
                  className="px-3 py-1.5 border border-red-200 rounded text-sm text-red-600 hover:bg-red-50 flex items-center justify-center gap-1"
                  title="Delete form"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div
          className={`grid gap-4 ${selectedSubmission ? 'xl:grid-cols-[minmax(0,1fr)_minmax(360px,480px)]' : ''}`}
        >
          <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
            <CatalogQueryState
              loading={catalog.query.isPending}
              error={catalog.query.error}
              retry={() => void catalog.query.refetch()}
            />
            <table className="min-w-[860px] w-full">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
                    Form
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
                    Assignment
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
                    Submitted By
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
                    Date
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
                    Status
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase text-gray-500">
                    View
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredSubmissions.map((fs) => {
                  const template = formTemplates.find(
                    (ft) => ft.id === fs.templateId,
                  );
                  const project = getProjectById(fs.projectId);
                  const assignment = workOrders.find(
                    (wo) => wo.id === fs.workOrderId,
                  );
                  const active = selectedSubmission?.id === fs.id;
                  return (
                    <tr
                      key={fs.id}
                      onClick={() => setSelectedSubmissionId(fs.id)}
                      className={`cursor-pointer border-b border-gray-50 hover:bg-gray-50 ${active ? 'bg-blue-50/70' : ''}`}
                    >
                      <td className="px-4 py-3 text-sm font-medium text-gray-800">
                        {template?.name || '-'}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        <div className="max-w-[260px] truncate">
                          {assignment?.title ||
                            project?.name ||
                            fs.workOrderId ||
                            '-'}
                        </div>
                        {fs.shiftId ? (
                          <div className="text-xs text-gray-400">
                            Shift {fs.shiftId}
                          </div>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {submittedByLabel(fs.workerId)}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {new Date(fs.submittedAt).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className="rounded-full px-2 py-1 text-xs font-medium capitalize text-white"
                          style={{
                            backgroundColor:
                              formSubmissionStatusMap.get(fs.status)?.color ||
                              '#94A3B8',
                          }}
                        >
                          {formSubmissionStatusMap.get(fs.status)?.name ||
                            fs.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            setSelectedSubmissionId(fs.id);
                          }}
                          className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
                        >
                          <Eye size={12} /> Details
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {filteredSubmissions.length === 0 ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-4 py-10 text-center text-sm text-gray-500"
                    >
                      No submissions found.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
            <CatalogPagination
              meta={catalog.meta}
              page={catalog.page}
              onPage={catalog.setPage}
              busy={catalog.query.isFetching}
            />
          </div>
          {selectedSubmissionId &&
            catalog.rows.some((row) => row.id === selectedSubmissionId) && (
              <CatalogQueryState
                loading={detail.isPending}
                error={detail.error}
                retry={() => void detail.refetch()}
              />
            )}
          {selectedSubmission ? (
            <SubmissionDetailPanel
              submission={selectedSubmission}
              template={selectedSubmissionTemplate}
              onClose={() => setSelectedSubmissionId(null)}
              onDelete={(submission) => void handleDeleteSubmission(submission)}
            />
          ) : null}
        </div>
      )}

      {}
      {(showBuilder || previewTemplate) && !related.ready && (
        <div
          role="dialog"
          aria-label="Loading form"
          className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center"
        >
          <div className="bg-white p-6 rounded-xl">
            <CatalogQueryState
              loading={related.loading}
              error={related.error}
              retry={related.retry}
            />
            <button
              onClick={() => {
                setShowBuilder(false);
                setPreviewTemplate(null);
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
      <AppContextOverride value={related.data}>
        {showBuilder && related.ready && (
          <FormBuilderModal
            templateId={editingTemplate}
            onClose={() => {
              setShowBuilder(false);
              setEditingTemplate(null);
            }}
          />
        )}

        {}
        {previewTemplate && related.ready && (
          <FormPreviewModal
            templateId={previewTemplate}
            onClose={() => setPreviewTemplate(null)}
          />
        )}
      </AppContextOverride>
    </div>
  );
};

const TimesheetFormTab: React.FC = () => {
  const {
    workers,
    projects,
    workOrders,
    timesheets,
    settings,
    addTimesheet,
    getWorkerById,
    getProjectById,
  } = useAppContext();
  const { toast } = useToast();

  const [form, setForm] = useState({
    workerId: '',
    projectId: '',
    workOrderId: '',
    date: '2026-04-01',
    clockIn: '07:00',
    clockOut: '16:00',
    breakMinutes: 30,
    notes: '',
  });

  const [showSuccess, setShowSuccess] = useState(false);
  const [recentFilter, setRecentFilter] = useState<
    'all' | 'pending' | 'approved' | 'rejected'
  >('all');

  const filteredWorkOrders = useMemo(() => {
    if (!form.projectId) return workOrders;
    return workOrders.filter((wo) => wo.projectId === form.projectId);
  }, [form.projectId, workOrders]);

  const calculatedHours = useMemo(() => {
    const [inH, inM] = form.clockIn.split(':').map(Number);
    const [outH, outM] = form.clockOut.split(':').map(Number);
    let clockMinutes = outH * 60 + outM - (inH * 60 + inM);
    if (clockMinutes < 0) clockMinutes += 24 * 60;
    const totalMinutes = clockMinutes - form.breakMinutes;
    const totalHours = Math.max(0, totalMinutes / 60);

    const regularLimit = settings.overtimeRules.regularHoursLimit;
    const dtThreshold = settings.overtimeRules.doubleTimeThreshold;

    let regularHours = Math.min(totalHours, regularLimit);
    let overtimeHours = 0;
    let doubleTimeHours = 0;

    if (totalHours > regularLimit) {
      overtimeHours = Math.min(
        totalHours - regularLimit,
        dtThreshold - regularLimit,
      );
    }
    if (totalHours > dtThreshold) {
      doubleTimeHours = totalHours - dtThreshold;
    }

    const dateMatch = form.date.match(/^(\d{4})-(\d{2})-(\d{2})/);
    const weekday = dateMatch
      ? new Date(
          Number(dateMatch[1]),
          Number(dateMatch[2]) - 1,
          Number(dateMatch[3]),
          12,
        ).getDay()
      : -1;
    if (weekday === 0 && (settings.overtimeRules.sundayAllDoubleTime ?? true)) {
      regularHours = 0;
      overtimeHours = 0;
      doubleTimeHours = totalHours;
    } else if (
      weekday === 6 &&
      (settings.overtimeRules.saturdayAllOvertime ?? true)
    ) {
      const saturdayThreshold =
        settings.overtimeRules.saturdayDoubleTimeThreshold ?? 12;
      regularHours = 0;
      overtimeHours = Math.min(totalHours, saturdayThreshold);
      doubleTimeHours = Math.max(0, totalHours - saturdayThreshold);
    }

    return {
      totalHours: Math.round(totalHours * 100) / 100,
      regularHours: Math.round(regularHours * 100) / 100,
      overtimeHours: Math.round(Math.max(0, overtimeHours) * 100) / 100,
      doubleTimeHours: Math.round(Math.max(0, doubleTimeHours) * 100) / 100,
    };
  }, [
    form.clockIn,
    form.clockOut,
    form.breakMinutes,
    form.date,
    settings.overtimeRules,
  ]);

  const selectedWorker = form.workerId ? getWorkerById(form.workerId) : null;
  const selectedProject = form.projectId
    ? getProjectById(form.projectId)
    : null;

  const estimatedCost = useMemo(() => {
    if (!selectedWorker) return 0;
    const rate = selectedWorker.hourlyRate;
    const startMinutes = form.clockIn.split(':').map(Number);
    const isNight =
      startMinutes.length === 2 &&
      (startMinutes[0] >= 17 || startMinutes[0] < 5);
    return (
      calculatedHours.regularHours *
        (rate +
          (isNight ? (settings.overtimeRules.nightShiftPremium ?? 3) : 0)) +
      calculatedHours.overtimeHours *
        (rate * settings.overtimeRules.overtimeMultiplier +
          (isNight
            ? (settings.overtimeRules.overtimeNightPremium ?? 4.5)
            : 0)) +
      calculatedHours.doubleTimeHours *
        (rate * settings.overtimeRules.doubleTimeMultiplier +
          (isNight ? (settings.overtimeRules.doubleTimeNightPremium ?? 6) : 0))
    );
  }, [selectedWorker, calculatedHours, form.clockIn, settings.overtimeRules]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.workerId || !form.projectId) {
      toast({
        title: 'Missing Fields',
        description: 'Please select a worker and project.',
        variant: 'destructive',
      });
      return;
    }

    const newTimesheet: Timesheet = {
      id: `t_${Date.now()}`,
      workerId: form.workerId,
      projectId: form.projectId,
      workOrderId: form.workOrderId || filteredWorkOrders[0]?.id || '',
      date: form.date,
      clockIn: form.clockIn,
      clockOut: form.clockOut,
      breakMinutes: form.breakMinutes,
      regularHours: calculatedHours.regularHours,
      overtimeHours: calculatedHours.overtimeHours,
      doubleTimeHours: calculatedHours.doubleTimeHours,
      status: 'pending',
      notes: form.notes,
    };

    addTimesheet(newTimesheet);
    toast({
      title: 'Timesheet Submitted',
      description: `Timesheet for ${selectedWorker?.firstName} ${selectedWorker?.lastName} on ${form.date} submitted successfully.`,
    });
    setShowSuccess(true);
    setTimeout(() => setShowSuccess(false), 3000);

    setForm((prev) => ({
      ...prev,
      workerId: '',
      notes: '',
    }));
  };

  const recentTimesheets = useMemo(() => {
    let filtered = [...timesheets];
    if (recentFilter !== 'all') {
      filtered = filtered.filter((t) => t.status === recentFilter);
    }
    return filtered.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 15);
  }, [timesheets, recentFilter]);

  const activeWorkers = workers
    .filter((w) => w.status === 'active')
    .sort((a, b) => a.firstName.localeCompare(b.firstName));

  return (
    <div className="space-y-6">
      {}
      {showSuccess && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex items-center gap-3 animate-in fade-in">
          <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
            <Check size={20} className="text-green-600" />
          </div>
          <div>
            <p className="text-sm font-semibold text-green-800">
              Timesheet Submitted Successfully
            </p>
            <p className="text-xs text-green-600">
              The timesheet has been submitted for approval.
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {}
        <div className="lg:col-span-2">
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            {}
            <div className="bg-gradient-to-r from-gray-800 to-gray-900 px-3 sm:px-6 py-4">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-white/10 rounded-lg flex items-center justify-center">
                    <Clock size={20} className="text-blue-400" />
                  </div>
                  <div>
                    <h3 className="text-white font-semibold">
                      Daily Timesheet Entry
                    </h3>
                    <p className="text-gray-400 text-xs">
                      DR Traffic Control, LLC
                    </p>
                  </div>
                </div>
                <img
                  src={settings.logo || '/drtraffic-logo-horizontal.png'}
                  alt="DR Traffic Control"
                  className="h-8 opacity-80"
                />
              </div>
            </div>

            <form onSubmit={handleSubmit} className="p-3 sm:p-6 space-y-5">
              {}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                  Employee / Worker <span className="text-red-500">*</span>
                </label>
                <select
                  required
                  value={form.workerId}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, workerId: e.target.value }))
                  }
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">Select worker...</option>
                  {activeWorkers.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.firstName} {w.lastName} - {w.type} (${w.hourlyRate}/hr)
                    </option>
                  ))}
                </select>
                {selectedWorker && (
                  <div className="mt-2 flex items-center gap-2">
                    <div
                      className={`w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold ${
                        selectedWorker.type === 'Foreman'
                          ? 'bg-purple-500'
                          : selectedWorker.type === 'Flagger'
                            ? 'bg-blue-500'
                            : selectedWorker.type === 'Traffic Controller'
                              ? 'bg-teal-500'
                              : selectedWorker.type === 'Truck Driver'
                                ? 'bg-orange-500'
                                : 'bg-gray-500'
                      }`}
                    >
                      {selectedWorker.firstName[0]}
                      {selectedWorker.lastName[0]}
                    </div>
                    <span className="text-xs text-gray-500">
                      {selectedWorker.type} | ${selectedWorker.hourlyRate}/hr |{' '}
                      {selectedWorker.email}
                    </span>
                  </div>
                )}
              </div>

              {}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                    Project <span className="text-red-500">*</span>
                  </label>
                  <select
                    required
                    value={form.projectId}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        projectId: e.target.value,
                        workOrderId: '',
                      }))
                    }
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="">Select project...</option>
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        #{p.number} - {p.name}
                      </option>
                    ))}
                  </select>
                  {selectedProject && (
                    <p className="text-xs text-gray-400 mt-1 flex items-center gap-1">
                      <MapPin size={10} /> {selectedProject.location},{' '}
                      {selectedProject.city}
                    </p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                    Assignment
                  </label>
                  <select
                    value={form.workOrderId}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, workOrderId: e.target.value }))
                    }
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="">Select assignment...</option>
                    {filteredWorkOrders.map((wo) => (
                      <option key={wo.id} value={wo.id}>
                        {wo.orderNumber || wo.title}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                  Date <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  required
                  value={form.date}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, date: e.target.value }))
                  }
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 max-w-xs"
                />
              </div>

              {}
              <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
                <h4 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                  <Clock size={14} className="text-primary" />
                  Time Entry
                </h4>
                <div className="responsive-grid grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      Clock In <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="time"
                      required
                      value={form.clockIn}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, clockIn: e.target.value }))
                      }
                      className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      Clock Out <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="time"
                      required
                      value={form.clockOut}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, clockOut: e.target.value }))
                      }
                      className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      Break (min)
                    </label>
                    <input
                      type="number"
                      min={0}
                      step={5}
                      value={form.breakMinutes}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          breakMinutes: parseInt(e.target.value) || 0,
                        }))
                      }
                      className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                </div>
              </div>

              {}
              <div className="bg-blue-50 rounded-xl p-4 border border-blue-200">
                <h4 className="text-sm font-semibold text-blue-800 mb-3 flex items-center gap-2">
                  <ClipboardList size={14} className="text-primary" />
                  Calculated Hours ({settings.overtimeRules.name})
                </h4>
                <div className="responsive-grid grid grid-cols-4 gap-3">
                  <div className="bg-white rounded-lg p-3 border border-blue-100 text-center">
                    <p className="text-xs text-gray-500 mb-1">Total</p>
                    <p className="text-xl font-bold text-gray-800">
                      {calculatedHours.totalHours}
                    </p>
                    <p className="text-[10px] text-gray-400">hours</p>
                  </div>
                  <div className="bg-white rounded-lg p-3 border border-green-100 text-center">
                    <p className="text-xs text-green-600 mb-1">Regular</p>
                    <p className="text-xl font-bold text-green-700">
                      {calculatedHours.regularHours}
                    </p>
                    <p className="text-[10px] text-gray-400">1.0x rate</p>
                  </div>
                  <div className="bg-white rounded-lg p-3 border border-orange-100 text-center">
                    <p className="text-xs text-orange-600 mb-1">Overtime</p>
                    <p className="text-xl font-bold text-orange-700">
                      {calculatedHours.overtimeHours}
                    </p>
                    <p className="text-[10px] text-gray-400">
                      {settings.overtimeRules.overtimeMultiplier}x rate
                    </p>
                  </div>
                  <div className="bg-white rounded-lg p-3 border border-red-100 text-center">
                    <p className="text-xs text-red-600 mb-1">Double Time</p>
                    <p className="text-xl font-bold text-red-700">
                      {calculatedHours.doubleTimeHours}
                    </p>
                    <p className="text-[10px] text-gray-400">
                      {settings.overtimeRules.doubleTimeMultiplier}x rate
                    </p>
                  </div>
                </div>
                {selectedWorker && (
                  <div className="mt-3 pt-3 border-t border-blue-200 flex items-center justify-between flex-wrap gap-3">
                    <span className="text-xs text-blue-700">
                      Estimated labor cost:
                    </span>
                    <span className="text-sm font-bold text-blue-800">
                      ${estimatedCost.toFixed(2)}
                    </span>
                  </div>
                )}
                {calculatedHours.overtimeHours > 0 && (
                  <div className="mt-2 flex items-center gap-2 text-xs text-orange-700 bg-orange-50 rounded-lg px-3 py-1.5">
                    <AlertTriangle size={12} />
                    <span>
                      Overtime detected: {calculatedHours.overtimeHours} hours
                      at {settings.overtimeRules.overtimeMultiplier}x rate
                    </span>
                  </div>
                )}
              </div>

              {}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                  Notes / Comments
                </label>
                <textarea
                  value={form.notes}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, notes: e.target.value }))
                  }
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  rows={3}
                  placeholder="Additional notes, special circumstances, etc."
                />
              </div>

              {}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                  Employee Signature
                </label>
                <div className="border-2 border-dashed border-gray-300 rounded-lg h-20 flex items-center justify-center text-gray-400 text-sm hover:border-blue-300 hover:bg-primary/10/30 transition-colors cursor-pointer">
                  <PenTool size={16} className="mr-2" /> Tap or click to sign
                </div>
              </div>

              {}
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() =>
                    setForm({
                      workerId: '',
                      projectId: '',
                      workOrderId: '',
                      date: '2026-04-01',
                      clockIn: '07:00',
                      clockOut: '16:00',
                      breakMinutes: 30,
                      notes: '',
                    })
                  }
                  className="px-3 sm:px-6 py-2.5 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Clear Form
                </button>
                <button
                  type="submit"
                  className="flex-1 px-3 sm:px-6 py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 flex items-center justify-center gap-2 shadow-sm"
                >
                  <Save size={16} /> Submit Timesheet
                </button>
              </div>
            </form>
          </div>
        </div>

        {}
        <div className="space-y-4">
          {}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h4 className="text-sm font-semibold text-gray-700 mb-3">
              Today's Summary
            </h4>
            <div className="space-y-3">
              {(() => {
                const todayStr = '2026-04-01';
                const todaySheets = timesheets.filter(
                  (t) => t.date === todayStr,
                );
                const totalHours = todaySheets.reduce(
                  (acc, t) =>
                    acc + t.regularHours + t.overtimeHours + t.doubleTimeHours,
                  0,
                );
                const pendingCount = todaySheets.filter(
                  (t) => t.status === 'pending',
                ).length;
                const approvedCount = todaySheets.filter(
                  (t) => t.status === 'approved',
                ).length;

                return (
                  <>
                    <div className="flex items-center justify-between flex-wrap gap-3">
                      <span className="text-xs text-gray-500">
                        Timesheets Today
                      </span>
                      <span className="text-sm font-bold text-gray-800">
                        {todaySheets.length}
                      </span>
                    </div>
                    <div className="flex items-center justify-between flex-wrap gap-3">
                      <span className="text-xs text-gray-500">Total Hours</span>
                      <span className="text-sm font-bold text-gray-800">
                        {totalHours.toFixed(1)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between flex-wrap gap-3">
                      <span className="text-xs text-gray-500">
                        Pending Approval
                      </span>
                      <span className="text-sm font-bold text-yellow-600">
                        {pendingCount}
                      </span>
                    </div>
                    <div className="flex items-center justify-between flex-wrap gap-3">
                      <span className="text-xs text-gray-500">Approved</span>
                      <span className="text-sm font-bold text-green-600">
                        {approvedCount}
                      </span>
                    </div>
                  </>
                );
              })()}
            </div>
          </div>

          {}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h4 className="text-sm font-semibold text-gray-700 mb-3">
              Overtime Rules
            </h4>
            <div className="space-y-2 text-xs">
              <div className="flex items-center justify-between bg-green-50 rounded-lg px-3 py-2 flex-wrap gap-3">
                <span className="text-green-700">Regular</span>
                <span className="font-bold text-green-800">
                  0 - {settings.overtimeRules.regularHoursLimit} hrs (1.0x)
                </span>
              </div>
              <div className="flex items-center justify-between bg-orange-50 rounded-lg px-3 py-2 flex-wrap gap-3">
                <span className="text-orange-700">Overtime</span>
                <span className="font-bold text-orange-800">
                  {settings.overtimeRules.regularHoursLimit} -{' '}
                  {settings.overtimeRules.doubleTimeThreshold} hrs (
                  {settings.overtimeRules.overtimeMultiplier}x)
                </span>
              </div>
              <div className="flex items-center justify-between bg-red-50 rounded-lg px-3 py-2 flex-wrap gap-3">
                <span className="text-red-700">Double Time</span>
                <span className="font-bold text-red-800">
                  {settings.overtimeRules.doubleTimeThreshold}+ hrs (
                  {settings.overtimeRules.doubleTimeMultiplier}x)
                </span>
              </div>
            </div>
          </div>

          {}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-200 flex items-center justify-between flex-wrap gap-3">
              <h4 className="text-sm font-semibold text-gray-700">
                Recent Timesheets
              </h4>
              <select
                value={recentFilter}
                onChange={(e) => setRecentFilter(e.target.value as any)}
                className="text-xs border border-gray-200 rounded px-2 py-1"
              >
                <option value="all">All</option>
                <option value="pending">Pending</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
              </select>
            </div>
            <div className="max-h-[400px] overflow-y-auto">
              {recentTimesheets.map((t) => {
                const worker = getWorkerById(t.workerId);
                const project = getProjectById(t.projectId);
                const totalHrs =
                  t.regularHours + t.overtimeHours + t.doubleTimeHours;
                return (
                  <div
                    key={t.id}
                    className="px-4 py-3 border-b border-gray-50 hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex items-center justify-between mb-1 flex-wrap gap-3">
                      <span className="text-sm font-medium text-gray-800">
                        {worker
                          ? `${worker.firstName} ${worker.lastName}`
                          : 'Unknown'}
                      </span>
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${
                          t.status === 'pending'
                            ? 'bg-yellow-100 text-yellow-700'
                            : t.status === 'approved'
                              ? 'bg-green-100 text-green-700'
                              : 'bg-red-100 text-red-700'
                        }`}
                      >
                        {t.status}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                      <span>
                        {new Date(t.date + 'T12:00:00').toLocaleDateString(
                          'en-US',
                          { month: 'short', day: 'numeric' },
                        )}
                      </span>
                      <span>|</span>
                      <span>
                        {t.clockIn} - {t.clockOut}
                      </span>
                      <span>|</span>
                      <span className="font-bold text-gray-700">
                        {totalHrs.toFixed(1)} hrs
                      </span>
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5 truncate">
                      {project?.name || '-'}
                    </p>
                  </div>
                );
              })}
              {recentTimesheets.length === 0 && (
                <div className="p-3 sm:p-6 text-center text-sm text-gray-400">
                  No timesheets found
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const FormBuilderModal: React.FC<{
  templateId: string | null;
  onClose: () => void;
}> = ({ templateId, onClose }) => {
  const {
    formTemplates,
    addFormTemplate,
    updateFormTemplate,
    settings,
    workOrders,
  } = useAppContext();
  const { toast } = useToast();
  const existing = templateId
    ? formTemplates.find((ft) => ft.id === templateId)
    : null;
  const workerTypes = Array.isArray(settings.workerTypes)
    ? settings.workerTypes
    : [];

  const [name, setName] = useState(existing?.name || '');
  const [description, setDescription] = useState(existing?.description || '');
  const [category, setCategory] = useState(existing?.category || 'Work Order');
  const [isRequired, setIsRequired] = useState(existing?.isRequired ?? true);
  const [fields, setFields] = useState<FormField[]>(() =>
    normalizeRenderableFields(existing?.fields),
  );
  const [draggedFieldIndex, setDraggedFieldIndex] = useState<number | null>(
    null,
  );
  const [fieldDropIndex, setFieldDropIndex] = useState<number | null>(null);
  const [assignedRoles, setAssignedRoles] = useState<string[]>(() =>
    asArray<string>(existing?.assignedRoles),
  );

  const [bindingCatalog, setBindingCatalog] = useState<
    { path: string; description: string; requiresShift: boolean }[]
  >([]);
  const [bindingsStatus, setBindingsStatus] = useState<
    'idle' | 'loading' | 'error'
  >('loading');

  const [previewWoId, setPreviewWoId] = useState('');
  const [previewShiftId, setPreviewShiftId] = useState('');
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState('');
  const [previewResult, setPreviewResult] = useState<Awaited<
    ReturnType<typeof dbFetchFormContextPreview>
  > | null>(null);

  useEffect(() => {
    let cancelled = false;
    setBindingsStatus('loading');
    dbFetchFormDataBindings()
      .then((res) => {
        if (!cancelled) {
          setBindingCatalog(res.paths ?? []);
          setBindingsStatus('idle');
        }
      })
      .catch(() => {
        if (!cancelled) {
          setBindingCatalog([]);
          setBindingsStatus('error');
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const previewShifts = useMemo(() => {
    if (!previewWoId) return [];
    const wo = workOrders.find((w) => w.id === previewWoId);
    return wo?.shifts ?? [];
  }, [previewWoId, workOrders]);

  useEffect(() => {
    setPreviewShiftId('');
    setPreviewResult(null);
    setPreviewError('');
  }, [previewWoId]);

  const sortedWorkOrders = useMemo(
    () =>
      [...workOrders].sort((a, b) => {
        const aLabel = `${a.orderNumber || ''} ${a.title || ''}`.trim();
        const bLabel = `${b.orderNumber || ''} ${b.title || ''}`.trim();
        return aLabel.localeCompare(bLabel, undefined, { sensitivity: 'base' });
      }),
    [workOrders],
  );

  const addField = (type: FormField['type']) => {
    const defaultRules =
      type === 'number'
        ? { step: 1 }
        : type === 'photo'
          ? { maxPhotos: 3 }
          : type === 'attachment'
            ? {
                maxFiles: 5,
                maxFileSizeMb: 25,
                acceptedMimeTypes: [
                  'application/pdf',
                  'image/jpeg',
                  'image/png',
                ],
              }
            : undefined;
    const defaultUi =
      type === 'number'
        ? { keyboardType: 'numeric' as const, inputMode: 'decimal' as const }
        : undefined;

    setFields((prev) => [
      ...prev,
      {
        id: `field_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
        key: `field_${Date.now()}`,
        label:
          type === 'timesheet'
            ? 'Worker Timesheets'
            : type === 'resource_usage'
              ? 'Equipment & Materials Used'
              : type === 'work_order_types'
                ? 'Work Order Type'
                : '',
        type,
        required: false,
        options: type === 'dropdown' ? ['Option 1', 'Option 2'] : undefined,
        rules: defaultRules,
        ui: defaultUi,
        version: CONTRACT_VERSION,
        dataBinding:
          type === 'timesheet'
            ? { path: 'shift.timesheetWorkers', optional: false }
            : undefined,
      },
    ]);
  };

  const updateField = (id: string, updates: Partial<FormField>) => {
    setFields((prev) =>
      prev.map((f) => (f.id === id ? { ...f, ...updates } : f)),
    );
  };

  const removeField = (id: string) => {
    setFields((prev) => prev.filter((f) => f.id !== id));
  };

  const reorderFields = (sourceIndex: number, targetIndex: number) => {
    if (sourceIndex === targetIndex) return;
    setFields((previous) => {
      if (
        sourceIndex < 0 ||
        targetIndex < 0 ||
        sourceIndex >= previous.length ||
        targetIndex >= previous.length
      )
        return previous;
      const next = [...previous];
      const [moved] = next.splice(sourceIndex, 1);
      next.splice(targetIndex, 0, moved);
      return next;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const now = new Date().toISOString().split('T')[0];
    const fieldsPayload = fields.map((field) => {
      const cleaned: FormField = { ...field };
      if (
        cleaned.type === 'resource_usage' ||
        cleaned.type === 'work_order_types' ||
        !cleaned.dataBinding?.path
      )
        delete cleaned.dataBinding;
      else if (cleaned.dataBinding.optional === undefined) {
        cleaned.dataBinding = { ...cleaned.dataBinding, optional: true };
      }
      return cleaned;
    });
    try {
      if (templateId && existing) {
        await updateFormTemplate(templateId, {
          name,
          description,
          category,
          isRequired,
          contractVersion: CONTRACT_VERSION,
          fields: fieldsPayload,
          assignedRoles,
          updatedAt: now,
        });
      } else {
        await addFormTemplate({
          id: `ft_${Date.now()}`,
          name,
          description,
          category,
          isRequired,
          contractVersion: CONTRACT_VERSION,
          fields: fieldsPayload,
          assignedRoles,
          assignedProjects: [],
          createdAt: now,
          updatedAt: now,
        });
      }
      toast({
        title: templateId ? 'Form updated' : 'Form created',
        description: 'The dynamic form template was saved successfully.',
      });
      onClose();
    } catch (error) {
      console.error('Failed to save form template', error);
      toast({
        title: 'Unable to save form',
        description: 'Please check your session permissions and try again.',
        variant: 'destructive',
      });
    }
  };

  const runContextPreview = async () => {
    if (!templateId) {
      toast({
        title: 'Save first',
        description:
          'Create or save the template to get an ID before using preview.',
      });
      return;
    }
    const woId = previewWoId.trim();
    if (!woId) {
      toast({
        title: 'Missing assignment',
        description: 'Select an assignment (work order).',
        variant: 'destructive',
      });
      return;
    }
    const bindingPathsUsed = fields
      .map((f) => f.dataBinding?.path)
      .filter((p): p is string => Boolean(p));
    const needsShift = bindingPathsUsed.some((path) =>
      bindingCatalog.some((row) => row.path === path && row.requiresShift),
    );
    if (needsShift && !previewShiftId.trim()) {
      toast({
        title: 'Missing shift',
        description:
          'This form uses shift.* data. Choose a shift from the dropdown.',
        variant: 'destructive',
      });
      return;
    }
    setPreviewLoading(true);
    setPreviewError('');
    try {
      const res = await dbFetchFormContextPreview(
        templateId,
        woId,
        previewShiftId.trim() || undefined,
      );
      setPreviewResult(res);
      toast({
        title: 'Preview ready',
        description: `Assignment ${res.workOrderId}${res.shiftId ? ` - Shift ${res.shiftId}` : ''}`,
      });
    } catch (err) {
      setPreviewResult(null);
      const msg =
        err instanceof Error ? err.message : 'Could not load the preview.';
      setPreviewError(msg);
      toast({
        title: 'Preview error',
        description: msg,
        variant: 'destructive',
      });
    } finally {
      setPreviewLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-2 sm:p-4">
      <div className="bg-white rounded-xl w-full max-w-3xl max-h-[90dvh] overflow-y-auto">
        <div className="p-5 border-b border-gray-200 flex items-center justify-between sticky top-0 bg-white z-10 flex-wrap gap-3">
          <h2 className="text-lg font-semibold">
            {templateId ? 'Edit Form Template' : 'Create Form Template'}
          </h2>
          <button onClick={onClose}>
            <X size={20} className="text-gray-400" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div className="responsive-grid grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Form Name *
              </label>
              <input
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                placeholder="e.g., Jobsite Hazard Analysis"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Category
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              >
                <option>Work Order</option>
                <option>Timesheet</option>
                <option>Incident Report</option>
                <option>Other Form</option>
                <option>Safety</option>
                <option>Operations</option>
                <option>Compliance</option>
                <option>HR</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Description
            </label>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>

          <label className="flex items-start gap-3 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
            <input
              type="checkbox"
              checked={isRequired}
              onChange={(e) => setIsRequired(e.target.checked)}
              className="mt-1 rounded"
            />
            <span>
              <span className="block text-sm font-semibold text-gray-700">
                Required for shift completion
              </span>
              <span className="block text-xs text-gray-500">
                Required forms must be submitted for the shift to count as
                completed. Optional forms stay available but do not block
                completion.
              </span>
            </span>
          </label>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Assign to Roles
            </label>
            <div className="flex flex-wrap gap-2">
              {workerTypes.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() =>
                    setAssignedRoles((prev) =>
                      prev.includes(t)
                        ? prev.filter((r) => r !== t)
                        : [...prev, t],
                    )
                  }
                  className={`px-3 py-1 rounded-full text-xs font-medium ${assignedRoles.includes(t) ? 'bg-primary text-primary-foreground' : 'bg-gray-100 text-gray-600'}`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          {}
          <div className="border-t border-gray-200 pt-4">
            <div className="flex items-center justify-between mb-3 flex-wrap gap-3">
              <h3 className="font-semibold text-gray-700">Form Fields</h3>
              <div className="flex gap-1 flex-wrap">
                {(
                  [
                    'text',
                    'number',
                    'textarea',
                    'dropdown',
                    'checkbox',
                    'work_order_types',
                    'date',
                    'time',
                    'signature',
                    'photo',
                    'attachment',
                    'timesheet',
                    'resource_usage',
                  ] as const
                ).map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => addField(type)}
                    className="px-2 py-1 bg-gray-100 hover:bg-gray-200 rounded text-xs text-gray-600 flex items-center gap-1 capitalize"
                  >
                    {fieldTypeIcons[type]} {type}
                  </button>
                ))}
              </div>
            </div>
            <div className="mb-2 flex items-start gap-2 text-xs rounded-lg border border-blue-100 bg-blue-50/80 px-3 py-2 text-blue-900">
              <Link2 size={14} className="shrink-0 mt-0.5 opacity-70" />
              <div>
                {bindingsStatus === 'loading' && (
                  <span className="flex items-center gap-1">
                    <Loader2 size={12} className="animate-spin" /> Loading
                    binding paths...
                  </span>
                )}
                {bindingsStatus === 'error' && (
                  <span>
                    Could not load binding paths (GET
                    /form-contract/data-bindings). You can still save and bind
                    manually in JSON later.
                  </span>
                )}
                {bindingsStatus === 'idle' && bindingCatalog.length > 0 && (
                  <span>
                    Per field: choose a <strong>prefill</strong> source from
                    assignment/project/shift data.
                  </span>
                )}
                {bindingsStatus === 'idle' && bindingCatalog.length === 0 && (
                  <span>
                    No public binding paths are available in the contract.
                  </span>
                )}
              </div>
            </div>

            <div className="space-y-2">
              {fields.map((field, idx) => (
                <div
                  key={field.id}
                  onDragOver={(event) => {
                    if (draggedFieldIndex === null) return;
                    event.preventDefault();
                    event.dataTransfer.dropEffect = 'move';
                    setFieldDropIndex(idx);
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    if (draggedFieldIndex !== null)
                      reorderFields(draggedFieldIndex, idx);
                    setDraggedFieldIndex(null);
                    setFieldDropIndex(null);
                  }}
                  className={`flex items-start gap-2 rounded-lg p-3 border transition-colors ${fieldDropIndex === idx && draggedFieldIndex !== idx ? 'border-blue-400 bg-blue-50' : 'border-gray-200 bg-gray-50'}`}
                >
                  <span
                    draggable
                    onDragStart={(event) => {
                      setDraggedFieldIndex(idx);
                      setFieldDropIndex(idx);
                      event.dataTransfer.effectAllowed = 'move';
                      event.dataTransfer.setData('text/plain', field.id);
                    }}
                    onDragEnd={() => {
                      setDraggedFieldIndex(null);
                      setFieldDropIndex(null);
                    }}
                    className="mt-2 cursor-grab touch-none text-gray-400 active:cursor-grabbing"
                    title="Drag to change field position"
                    aria-label={`Drag ${field.label || field.type} to change position`}
                  >
                    <GripVertical size={16} />
                  </span>
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs bg-blue-100 text-primary px-1.5 py-0.5 rounded capitalize flex items-center gap-1">
                        {fieldTypeIcons[field.type]} {field.type}
                      </span>
                      <input
                        value={field.label}
                        onChange={(e) =>
                          updateField(field.id, { label: e.target.value })
                        }
                        className="flex-1 border border-gray-300 rounded px-2 py-1 text-sm"
                        placeholder="Field label"
                      />
                      <label className="flex items-center gap-1 text-xs text-gray-500">
                        <input
                          type="checkbox"
                          checked={field.required}
                          onChange={(e) =>
                            updateField(field.id, {
                              required: e.target.checked,
                            })
                          }
                          className="rounded"
                        />
                        Required
                      </label>
                    </div>
                    {field.type === 'dropdown' && (
                      <input
                        value={(field.options || []).join(', ')}
                        onChange={(e) =>
                          updateField(field.id, {
                            options: e.target.value
                              .split(',')
                              .map((s) => s.trim()),
                          })
                        }
                        className="w-full border border-gray-300 rounded px-2 py-1 text-xs"
                        placeholder="Options (comma separated)"
                      />
                    )}
                    {(field.type === 'text' || field.type === 'textarea') && (
                      <div className="responsive-grid grid grid-cols-2 gap-2">
                        <input
                          type="number"
                          min={0}
                          value={field.rules?.minLength ?? ''}
                          onChange={(e) =>
                            updateField(field.id, {
                              rules: {
                                ...(field.rules || {}),
                                minLength:
                                  e.target.value === ''
                                    ? undefined
                                    : Number(e.target.value),
                              },
                            })
                          }
                          className="w-full border border-gray-300 rounded px-2 py-1 text-xs"
                          placeholder="Min length"
                        />
                        <input
                          type="number"
                          min={0}
                          value={field.rules?.maxLength ?? ''}
                          onChange={(e) =>
                            updateField(field.id, {
                              rules: {
                                ...(field.rules || {}),
                                maxLength:
                                  e.target.value === ''
                                    ? undefined
                                    : Number(e.target.value),
                              },
                            })
                          }
                          className="w-full border border-gray-300 rounded px-2 py-1 text-xs"
                          placeholder="Max length"
                        />
                      </div>
                    )}
                    {field.type === 'number' && (
                      <div className="responsive-grid grid grid-cols-3 gap-2">
                        <input
                          type="number"
                          value={field.rules?.min ?? ''}
                          onChange={(e) =>
                            updateField(field.id, {
                              rules: {
                                ...(field.rules || {}),
                                min:
                                  e.target.value === ''
                                    ? undefined
                                    : Number(e.target.value),
                              },
                            })
                          }
                          className="w-full border border-gray-300 rounded px-2 py-1 text-xs"
                          placeholder="Min"
                        />
                        <input
                          type="number"
                          value={field.rules?.max ?? ''}
                          onChange={(e) =>
                            updateField(field.id, {
                              rules: {
                                ...(field.rules || {}),
                                max:
                                  e.target.value === ''
                                    ? undefined
                                    : Number(e.target.value),
                              },
                            })
                          }
                          className="w-full border border-gray-300 rounded px-2 py-1 text-xs"
                          placeholder="Max"
                        />
                        <input
                          type="number"
                          min={0.01}
                          step={0.01}
                          value={field.rules?.step ?? ''}
                          onChange={(e) =>
                            updateField(field.id, {
                              rules: {
                                ...(field.rules || {}),
                                step:
                                  e.target.value === ''
                                    ? undefined
                                    : Number(e.target.value),
                              },
                            })
                          }
                          className="w-full border border-gray-300 rounded px-2 py-1 text-xs"
                          placeholder="Step"
                        />
                      </div>
                    )}
                    {field.type === 'timesheet' && (
                      <div className="rounded-md border border-slate-200 bg-white px-3 py-2">
                        <label className="block text-xs font-medium text-gray-700 mb-1">
                          Default lunch and break answer
                        </label>
                        <select
                          value={
                            typeof field.ui?.lunchTakenDefault === 'boolean'
                              ? String(field.ui.lunchTakenDefault)
                              : ''
                          }
                          onChange={(e) =>
                            updateField(field.id, {
                              ui: {
                                ...(field.ui || {}),
                                lunchTakenDefault:
                                  e.target.value === ''
                                    ? undefined
                                    : e.target.value === 'true',
                              },
                            })
                          }
                          className="w-full border border-gray-300 rounded px-2 py-1 text-xs bg-white"
                        >
                          <option value="">No default</option>
                          <option value="true">Yes</option>
                          <option value="false">No</option>
                        </select>
                        <p className="mt-1 text-[11px] text-gray-500">
                          Applied to new WO timesheets in mobile; saved answers
                          are preserved.
                        </p>
                      </div>
                    )}
                    {field.type === 'photo' && (
                      <input
                        type="number"
                        min={1}
                        value={field.rules?.maxPhotos ?? ''}
                        onChange={(e) =>
                          updateField(field.id, {
                            rules: {
                              ...(field.rules || {}),
                              maxPhotos:
                                e.target.value === ''
                                  ? undefined
                                  : Number(e.target.value),
                            },
                          })
                        }
                        className="w-full border border-gray-300 rounded px-2 py-1 text-xs"
                        placeholder="Max photos"
                      />
                    )}
                    {field.type === 'attachment' && (
                      <div className="responsive-grid grid grid-cols-2 gap-2">
                        <input
                          type="number"
                          min={1}
                          value={field.rules?.maxFiles ?? ''}
                          onChange={(e) =>
                            updateField(field.id, {
                              rules: {
                                ...(field.rules || {}),
                                maxFiles:
                                  e.target.value === ''
                                    ? undefined
                                    : Number(e.target.value),
                              },
                            })
                          }
                          className="w-full border border-gray-300 rounded px-2 py-1 text-xs"
                          placeholder="Max files"
                        />
                        <input
                          value={(field.rules?.acceptedMimeTypes || []).join(
                            ', ',
                          )}
                          onChange={(e) =>
                            updateField(field.id, {
                              rules: {
                                ...(field.rules || {}),
                                acceptedMimeTypes: e.target.value
                                  .split(',')
                                  .map((s) => s.trim())
                                  .filter(Boolean),
                              },
                            })
                          }
                          className="w-full border border-gray-300 rounded px-2 py-1 text-xs"
                          placeholder="MIME types"
                        />
                      </div>
                    )}
                    {field.type === 'signature' ? (
                      <label className="flex items-center gap-2 rounded-md border border-slate-200 bg-white px-2 py-2 text-[11px] font-medium text-slate-600">
                        <input
                          type="checkbox"
                          checked={
                            field.rules?.requiresShiftWorkOrderAccessOnMobile ??
                            (field.rules?.hiddenForMobileRoles || []).includes(
                              'viewer',
                            )
                          }
                          onChange={(e) => {
                            const hiddenForMobileRoles = (
                              field.rules?.hiddenForMobileRoles || []
                            ).filter((role) => role.toLowerCase() !== 'viewer');
                            updateField(field.id, {
                              rules: {
                                ...(field.rules || {}),
                                requiresShiftWorkOrderAccessOnMobile: e.target
                                  .checked
                                  ? true
                                  : undefined,
                                hiddenForMobileRoles:
                                  hiddenForMobileRoles.length > 0
                                    ? hiddenForMobileRoles
                                    : undefined,
                              },
                            });
                          }}
                          className="rounded border-gray-300"
                        />
                        Only show this signature on mobile to users with shift
                        WO access
                      </label>
                    ) : null}
                    {field.type !== 'resource_usage' &&
                    bindingCatalog.length > 0 &&
                    bindingsStatus !== 'loading' ? (
                      <div className="rounded-md border border-blue-100 bg-white px-2 py-2 space-y-1.5">
                        <div className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-blue-800">
                          <Link2 size={11} /> Data binding (prefill)
                        </div>
                        <select
                          value={field.dataBinding?.path ?? ''}
                          onChange={(e) => {
                            const path = e.target.value;
                            updateField(field.id, {
                              dataBinding: path
                                ? {
                                    path,
                                    optional:
                                      field.dataBinding?.optional !== false,
                                    editable:
                                      field.dataBinding?.editable !== false,
                                  }
                                : undefined,
                            });
                          }}
                          className="w-full border border-gray-200 rounded px-2 py-1 text-xs text-gray-800"
                        >
                          <option value="">— No prefill —</option>
                          {bindingCatalog.map((row) => (
                            <option key={row.path} value={row.path}>
                              {row.path}
                              {row.requiresShift
                                ? ' shift required'
                                : ''} - {row.description}
                            </option>
                          ))}
                        </select>
                        {field.dataBinding?.path ? (
                          <div className="space-y-1.5">
                            <label className="flex items-center gap-2 text-[11px] text-gray-600 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={field.dataBinding.optional !== false}
                                onChange={(e) =>
                                  updateField(field.id, {
                                    dataBinding: {
                                      ...field.dataBinding,
                                      optional: e.target.checked,
                                    },
                                  })
                                }
                                className="rounded border-gray-300"
                              />
                              Suggestion only (missing server data will not
                              block submission)
                            </label>
                            <label className="flex items-center gap-2 text-[11px] text-gray-600 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={field.dataBinding.editable !== false}
                                onChange={(e) =>
                                  updateField(field.id, {
                                    dataBinding: {
                                      ...field.dataBinding,
                                      editable: e.target.checked,
                                    },
                                  })
                                }
                                className="rounded border-gray-300"
                              />
                              Allow workers to edit the prefilled value
                            </label>
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    onClick={() => removeField(field.id)}
                    className="p-1 hover:bg-red-100 rounded"
                  >
                    <Trash2 size={14} className="text-red-400" />
                  </button>
                </div>
              ))}
              {fields.length === 0 && (
                <div className="text-center py-8 text-gray-400 text-sm">
                  Click a field type above to start building your form
                </div>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50/90 p-4 space-y-3">
            <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
              <Eye size={16} className="text-slate-500" />
              Test Suggested Values (API)
            </h3>
            {!templateId ? (
              <p className="text-xs text-slate-600">
                Save the template once to enable preview against a real
                assignment.
              </p>
            ) : (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 mb-1">
                      Assignment
                    </label>
                    <select
                      value={previewWoId}
                      onChange={(e) => setPreviewWoId(e.target.value)}
                      className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs bg-white"
                    >
                      <option value="">Select...</option>
                      {sortedWorkOrders.map((wo) => (
                        <option key={wo.id} value={wo.id}>
                          {(wo.orderNumber ? `${wo.orderNumber} · ` : '') +
                            wo.title}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 mb-1">
                      Shift (if you use shift.* paths)
                    </label>
                    <select
                      value={previewShiftId}
                      onChange={(e) => setPreviewShiftId(e.target.value)}
                      disabled={!previewWoId || previewShifts.length === 0}
                      className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs bg-white disabled:bg-slate-100 disabled:text-slate-400"
                    >
                      <option value="">
                        {!previewWoId
                          ? '—'
                          : previewShifts.length === 0
                            ? 'No shifts'
                            : 'Optional / select'}
                      </option>
                      {previewShifts.map((s) => (
                        <option key={s.id} value={s.id}>
                          {(s.date || '') +
                            (s.startTime ? ` · ${s.startTime}` : '') +
                            (s.endTime ? `-${s.endTime}` : '')}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <button
                  type="button"
                  disabled={previewLoading}
                  onClick={() => void runContextPreview()}
                  className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800 text-white hover:bg-slate-700 disabled:opacity-50"
                >
                  {previewLoading ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <Eye size={14} />
                  )}
                  Load Preview
                </button>
                {previewError ? (
                  <p className="text-xs text-red-600">{previewError}</p>
                ) : null}
                {previewResult?.fieldPreviews?.length ? (
                  <div className="rounded-lg border border-slate-200 bg-white overflow-hidden max-h-52 overflow-y-auto">
                    <div
                      className="responsive-table"
                      role="region"
                      aria-label="Table data"
                      tabIndex={0}
                    >
                      <table className="w-full text-[11px]">
                        <thead className="bg-slate-100 text-slate-600 sticky top-0">
                          <tr>
                            <th className="text-left px-2 py-1 font-medium">
                              Field
                            </th>
                            <th className="text-left px-2 py-1 font-medium">
                              Path
                            </th>
                            <th className="text-left px-2 py-1 font-medium">
                              Value
                            </th>
                            <th className="text-center px-2 py-1 font-medium">
                              OK
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {previewResult.fieldPreviews.map((row) => {
                            const fld = fields.find(
                              (f) => f.id === row.fieldId,
                            );
                            return (
                              <tr
                                key={row.fieldId}
                                className="border-t border-slate-100"
                              >
                                <td className="px-2 py-1 align-top">
                                  {fld?.label || row.fieldId}
                                </td>
                                <td className="px-2 py-1 align-top font-mono text-[10px] text-slate-500">
                                  {row.bindingPath ?? '—'}
                                </td>
                                <td className="px-2 py-1 align-top break-all max-w-[140px]">
                                  {String(row.value ?? '')}
                                </td>
                                <td className="px-2 py-1 align-top text-center">
                                  {row.resolved ? (
                                    <Check
                                      size={12}
                                      className="inline text-green-600"
                                    />
                                  ) : row.hint ? (
                                    <span
                                      title={row.hint}
                                      className="text-amber-600 cursor-help"
                                    >
                                      ?
                                    </span>
                                  ) : (
                                    <span className="text-slate-300">—</span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : null}
              </>
            )}
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90"
            >
              {templateId ? 'Save Changes' : 'Create Form'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

const FormPreviewModal: React.FC<{
  templateId: string;
  onClose: () => void;
}> = ({ templateId, onClose }) => {
  const { formTemplates, settings } = useAppContext();
  const template = formTemplates.find((ft) => ft.id === templateId);
  if (!template) return null;
  const fields = normalizeRenderableFields(template.fields);

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-2 sm:p-4">
      <div className="bg-white rounded-xl w-full max-w-lg max-h-[90dvh] overflow-y-auto">
        <div className="p-5 border-b border-gray-200 flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-lg font-semibold">{template.name}</h2>
            <p className="text-sm text-gray-500">{template.description}</p>
          </div>
          <button onClick={onClose}>
            <X size={20} className="text-gray-400" />
          </button>
        </div>
        <div className="p-5 space-y-4">
          {}
          <div className="text-center border-b border-gray-200 pb-4">
            <img
              src={settings.logoIcon || settings.logo || '/drtraffic-logo.png'}
              alt="DR Traffic Control"
              className="h-10 mx-auto mb-2"
            />
            <p className="text-xs text-gray-500">DR TRAFFIC CONTROL, LLC</p>
          </div>

          {fields.map((field, index) => {
            const startsSection =
              field.ui?.section &&
              field.ui.section !== fields[index - 1]?.ui?.section;
            const tagTone =
              field.ui?.tagTone === 'amber'
                ? 'border-amber-200 bg-amber-50 text-amber-700'
                : field.ui?.tagTone === 'slate'
                  ? 'border-slate-200 bg-white text-slate-600'
                  : 'border-blue-200 bg-blue-50 text-blue-700';

            return (
              <div key={field.id}>
                {startsSection ? (
                  <div className="pt-2 border-t border-gray-100 first:border-t-0 first:pt-0">
                    <h3 className="text-base font-semibold text-gray-900">
                      {field.ui?.section}
                    </h3>
                    {field.ui?.sectionDescription ? (
                      <p className="text-xs text-gray-500 mt-0.5">
                        {field.ui.sectionDescription}
                      </p>
                    ) : null}
                  </div>
                ) : null}
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {field.label}{' '}
                  {field.required && <span className="text-red-500">*</span>}
                </label>
                {field.dataBinding?.path ? (
                  <p className="text-[10px] text-blue-700 mb-1 flex items-center gap-1">
                    <Link2 size={10} /> Prefill:{' '}
                    <code className="bg-blue-50 px-1 rounded">
                      {field.dataBinding.path}
                    </code>
                  </p>
                ) : null}
                {field.type === 'text' && (
                  <input
                    defaultValue={String(field.ui?.defaultValue ?? '')}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                    placeholder={field.placeholder}
                  />
                )}
                {field.type === 'number' && (
                  <input
                    defaultValue={String(field.ui?.defaultValue ?? '')}
                    type="number"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  />
                )}
                {field.type === 'textarea' && (
                  <textarea
                    defaultValue={String(field.ui?.defaultValue ?? '')}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                    rows={3}
                    placeholder={field.placeholder}
                  />
                )}
                {field.type === 'dropdown' && (
                  <select
                    defaultValue={String(field.ui?.defaultValue ?? '')}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  >
                    <option value="">Select...</option>
                    {field.options?.map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </select>
                )}
                {field.type === 'checkbox' && (
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      defaultChecked={field.ui?.defaultValue === true}
                      className="rounded"
                    />
                    <span className="text-sm text-gray-600">Yes</span>
                  </label>
                )}
                {field.type === 'work_order_types' && (
                  <div className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-3 text-sm text-blue-800">
                    Checkbox group populated from the selected shift&apos;s Work
                    Order Types. Mobile users may add more options.
                  </div>
                )}
                {field.type === 'date' && (
                  <input
                    type="date"
                    defaultValue={String(field.ui?.defaultValue ?? '')}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  />
                )}
                {field.type === 'time' && (
                  <input
                    type="time"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  />
                )}
                {field.type === 'signature' && (
                  <div className="border-2 border-dashed border-gray-300 rounded-lg h-24 flex items-center justify-center text-gray-400 text-sm">
                    <PenTool size={16} className="mr-2" /> Tap to sign
                  </div>
                )}
                {field.type === 'photo' && (
                  <div className="border-2 border-dashed border-gray-300 rounded-lg h-24 flex items-center justify-center text-gray-400 text-sm">
                    <Camera size={16} className="mr-2" /> Upload photo
                  </div>
                )}
                {field.type === 'attachment' && (
                  <div className="border-2 border-dashed border-gray-300 rounded-lg h-24 flex items-center justify-center text-gray-400 text-sm">
                    <Paperclip size={16} className="mr-2" /> Attach file
                  </div>
                )}
                {field.type === 'timesheet' && (
                  <div className="border border-blue-100 bg-blue-50 rounded-lg px-3 py-3 text-blue-800 text-sm flex items-center gap-2">
                    <Users size={16} /> Worker timesheet list from the selected
                    shift
                  </div>
                )}
                {field.type === 'resource_usage' && (
                  <div className="border border-purple-100 bg-purple-50 rounded-lg px-3 py-3 text-purple-800 text-sm flex items-center gap-2">
                    <ClipboardList size={16} /> Planned equipment IDs and actual
                    material quantities from the selected shift
                  </div>
                )}
                {field.ui?.helperText ? (
                  <p className="mt-1 text-xs text-gray-500">
                    {field.ui.helperText}
                  </p>
                ) : null}
                {field.ui?.quickTags?.length ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {field.ui.quickTags.map((tag) => (
                      <span
                        key={tag}
                        className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${tagTone}`}
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default FormsView;
