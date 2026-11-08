import DataPagination from '@/components/shared/DataPagination';
import { usePagedCatalog } from '@/hooks/use-paged-catalog';
import { useDeferredAppData } from '@/hooks/use-deferred-app-data';
import CatalogQueryState from '@/components/shared/CatalogQueryState';
import React, { useEffect, useMemo, useState } from 'react';
import { useAppContext } from '@/contexts/AppContext';
import { useToast } from '@/hooks/use-toast';
import {
  AlertTriangle,
  Plus,
  Search,
  MapPin,
  Calendar,
  X,
  Loader2,
} from 'lucide-react';
import { FormField, FormTemplate, WorkOrder, Incident } from '@/lib/types';
import { dbFetchFormContextPreview } from '@/lib/db';

function isIncidentTemplate(template: FormTemplate) {
  return [template.category, template.name]
    .filter(Boolean)
    .some((value) => String(value).toLowerCase().includes('incident'));
}

function fieldDefaultValue(
  field: FormField,
  suggestedData: Record<string, unknown>,
) {
  if (Object.prototype.hasOwnProperty.call(suggestedData, field.id))
    return suggestedData[field.id];
  if (
    field.ui &&
    Object.prototype.hasOwnProperty.call(field.ui, 'defaultValue')
  )
    return field.ui.defaultValue;
  if (field.type === 'checkbox') return false;
  return '';
}

function normalizeFields(fields: FormTemplate['fields']) {
  return Array.isArray(fields) ? fields : [];
}

function renderDynamicField(
  field: FormField,
  value: unknown,
  setValue: (fieldId: string, value: unknown) => void,
) {
  const common =
    'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-primary';
  const stringValue =
    value === null || value === undefined ? '' : String(value);

  if (field.type === 'textarea') {
    return (
      <textarea
        required={field.required}
        value={stringValue}
        onChange={(event) => setValue(field.id, event.target.value)}
        className={common}
        rows={4}
        placeholder={field.placeholder || field.label}
      />
    );
  }

  if (field.type === 'dropdown') {
    return (
      <select
        required={field.required}
        value={stringValue}
        onChange={(event) => setValue(field.id, event.target.value)}
        className={common}
      >
        <option value="">Select {field.label}</option>
        {(field.options || []).map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    );
  }

  if (field.type === 'checkbox') {
    return (
      <label className="flex items-start gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700">
        <input
          type="checkbox"
          checked={Boolean(value)}
          required={field.required}
          onChange={(event) => setValue(field.id, event.target.checked)}
          className="mt-1"
        />
        <span>{field.label}</span>
      </label>
    );
  }

  const inputType =
    field.type === 'date'
      ? 'date'
      : field.type === 'time'
        ? 'time'
        : field.type === 'number'
          ? 'number'
          : 'text';

  return (
    <input
      type={inputType}
      required={field.required}
      value={stringValue}
      onChange={(event) => setValue(field.id, event.target.value)}
      className={common}
      placeholder={
        field.type === 'signature'
          ? 'Type signer name or signature reference'
          : field.type === 'attachment' || field.type === 'photo'
            ? 'Paste file URL or evidence reference'
            : field.placeholder || field.label
      }
    />
  );
}

const DynamicIncidentReportModal: React.FC<{
  template: FormTemplate | null;
  workOrders: WorkOrder[];
  onClose: () => void;
  onSubmit: (submission: {
    templateId: string;
    projectId: string;
    workOrderId: string;
    shiftId: string;
    data: Record<string, unknown>;
  }) => Promise<void>;
}> = ({ template, workOrders, onClose, onSubmit }) => {
  const [selectedWorkOrderId, setSelectedWorkOrderId] = useState('');
  const [selectedShiftId, setSelectedShiftId] = useState('');
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [saving, setSaving] = useState(false);
  const fields = useMemo(
    () => normalizeFields(template?.fields || []),
    [template],
  );
  const selectedWorkOrder =
    workOrders.find((item) => item.id === selectedWorkOrderId) || null;

  useEffect(() => {
    if (!template) return;
    let cancelled = false;
    const load = async () => {
      setLoadingPreview(Boolean(selectedWorkOrderId));
      let suggestedData: Record<string, unknown> = {};
      if (selectedWorkOrderId) {
        try {
          const preview = await dbFetchFormContextPreview(
            template.id,
            selectedWorkOrderId,
            selectedShiftId || undefined,
          );
          suggestedData = preview.suggestedData || {};
        } catch {
          suggestedData = {};
        }
      }
      if (cancelled) return;
      setValues(
        Object.fromEntries(
          fields.map((field) => [
            field.id,
            fieldDefaultValue(field, suggestedData),
          ]),
        ),
      );
      setLoadingPreview(false);
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [fields, selectedShiftId, selectedWorkOrderId, template]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!template) return;
    setSaving(true);
    try {
      await onSubmit({
        templateId: template.id,
        projectId: selectedWorkOrder?.projectId || '',
        workOrderId: selectedWorkOrderId,
        shiftId: selectedShiftId,
        data: values,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-2 sm:p-4">
      <form
        onSubmit={submit}
        className="bg-white rounded-xl w-full max-w-3xl max-h-[90dvh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-5 border-b border-gray-200 flex items-center justify-between flex-wrap gap-3">
          <div>
            <h3 className="text-lg font-semibold text-gray-800">
              {template?.name || 'Report Incident'}
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Dynamic Incident Report form
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 hover:bg-gray-100 rounded"
          >
            <X size={16} />
          </button>
        </div>

        {!template ? (
          <div className="p-5 text-sm text-red-600">
            No Incident Report form template is configured. Create one in Forms
            first.
          </div>
        ) : (
          <div className="p-5 space-y-4">
            <div className="responsive-grid grid grid-cols-2 gap-3">
              <select
                value={selectedWorkOrderId}
                onChange={(event) => {
                  setSelectedWorkOrderId(event.target.value);
                  setSelectedShiftId('');
                }}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
              >
                <option value="">Assignment (optional)</option>
                {workOrders.map((wo) => (
                  <option key={wo.id} value={wo.id}>
                    {wo.orderNumber || wo.id} - {wo.title}
                  </option>
                ))}
              </select>
              <select
                value={selectedShiftId}
                onChange={(event) => setSelectedShiftId(event.target.value)}
                disabled={!selectedWorkOrder}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm disabled:bg-gray-100"
              >
                <option value="">Shift (optional)</option>
                {(selectedWorkOrder?.shifts || []).map((shift) => (
                  <option key={shift.id} value={shift.id}>
                    {shift.date} {shift.startTime}-{shift.endTime}
                  </option>
                ))}
              </select>
            </div>

            {loadingPreview ? (
              <div className="flex items-center gap-2 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-sm text-blue-700">
                <Loader2 size={14} className="animate-spin" />
                Loading assignment context...
              </div>
            ) : null}

            <div className="grid grid-cols-1 gap-4">
              {fields.map((field) => (
                <div key={field.id}>
                  {field.type !== 'checkbox' ? (
                    <label className="mb-1 block text-xs font-semibold uppercase text-gray-500">
                      {field.label}
                      {field.required ? ' *' : ''}
                    </label>
                  ) : null}
                  {renderDynamicField(
                    field,
                    values[field.id],
                    (fieldId, nextValue) =>
                      setValues((prev) => ({ ...prev, [fieldId]: nextValue })),
                  )}
                  {field.ui?.helperText ? (
                    <p className="mt-1 text-xs text-gray-500">
                      {String(field.ui.helperText)}
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="p-5 border-t border-gray-200 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 border border-gray-300 rounded-lg text-sm"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!template || saving}
            className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-60"
          >
            {saving ? 'Submitting...' : 'Submit Incident'}
          </button>
        </div>
      </form>
    </div>
  );
};

const IncidentsView: React.FC = () => {
  const { statusCatalog, formTemplates } = useAppContext();
  const { toast } = useToast();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const catalog = usePagedCatalog<Incident>('incidents', {
    search,
    status: statusFilter,
  });
  const { addFormSubmission, updateIncident } = catalog.overrides;
  const related = useDeferredAppData(['workOrders'], showCreateModal);
  const workOrders = related.data.workOrders || [];
  const getProjectById = (id: string) =>
    catalog.lookups?.projects.find((item) => item.id === id);
  const getWorkerById = (id: string) =>
    catalog.lookups?.workers.find((item) => item.id === id);
  const incidentStatuses = useMemo(() => {
    const configured = statusCatalog
      .filter((item) => item.scope === 'incident' && item.status === 'active')
      .sort(
        (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name),
      );
    if (configured.length > 0) return configured;
    return [
      {
        id: 'ic_open',
        scope: 'incident',
        value: 'open',
        name: 'Open',
        color: '#EF4444',
        sortOrder: 10,
        blocksEditing: false,
        triggersNotification: true,
        requiresApproval: false,
        status: 'active',
      },
      {
        id: 'ic_investigating',
        scope: 'incident',
        value: 'investigating',
        name: 'Investigating',
        color: '#F59E0B',
        sortOrder: 20,
        blocksEditing: false,
        triggersNotification: true,
        requiresApproval: false,
        status: 'active',
      },
      {
        id: 'ic_resolved',
        scope: 'incident',
        value: 'resolved',
        name: 'Resolved',
        color: '#22C55E',
        sortOrder: 30,
        blocksEditing: false,
        triggersNotification: true,
        requiresApproval: false,
        status: 'active',
      },
      {
        id: 'ic_closed',
        scope: 'incident',
        value: 'closed',
        name: 'Closed',
        color: '#6B7280',
        sortOrder: 40,
        blocksEditing: true,
        triggersNotification: false,
        requiresApproval: false,
        status: 'active',
      },
    ];
  }, [statusCatalog]);
  const incidentStatusMap = useMemo(
    () => new Map(incidentStatuses.map((item) => [item.value, item])),
    [incidentStatuses],
  );
  const openStatusValue =
    incidentStatuses.find((s) => s.value.includes('open'))?.value || 'open';
  const incidentTemplate = useMemo(
    () => formTemplates.find(isIncidentTemplate) || null,
    [formTemplates],
  );

  const filtered = catalog.rows;

  const severityColor = (s: string) => {
    switch (s) {
      case 'low':
        return 'bg-blue-100 text-blue-700';
      case 'medium':
        return 'bg-yellow-100 text-yellow-700';
      case 'high':
        return 'bg-orange-100 text-orange-700';
      case 'critical':
        return 'bg-red-100 text-red-700';
      default:
        return 'bg-gray-100 text-gray-600';
    }
  };

  const statusColor = (s: string) => {
    if (incidentStatusMap.has(s)) return 'text-white';
    return 'bg-gray-100 text-gray-600';
  };

  const setNextStatus = async (id: string, status: string) => {
    await updateIncident(id, { status });
    toast({
      title: 'Incident updated',
      description: `Status changed to ${incidentStatusMap.get(status)?.name || status.replace('_', ' ')}`,
    });
  };

  const createIncidentSubmission = async (payload: {
    templateId: string;
    projectId: string;
    workOrderId: string;
    shiftId: string;
    data: Record<string, unknown>;
  }) => {
    try {
      await addFormSubmission({
        id: `fs_incident_${Date.now()}`,
        templateId: payload.templateId,
        projectId: payload.projectId,
        workOrderId: payload.workOrderId,
        shiftId: payload.shiftId,
        workerId: '',
        submittedAt: new Date().toISOString(),
        data: payload.data,
        status: 'submitted',
      });
      setShowCreateModal(false);
      toast({
        title: 'Incident created',
        description: 'The dynamic incident report was submitted successfully.',
      });
    } catch (err) {
      console.error('Failed to create incident', err);
      toast({
        title: 'Could not create incident',
        description: 'Please verify your permissions and try again.',
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="p-3 sm:p-6 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-800">
            Incidents & Safety
          </h2>
          <p className="text-sm text-gray-500">
            {catalog.meta?.totalItems ?? 0} total incidents
          </p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 flex items-center gap-1"
        >
          <Plus size={14} /> Report Incident
        </button>
      </div>

      {}
      <div className="responsive-grid grid grid-cols-4 gap-4">
        {incidentStatuses.map((status) => (
          <button
            key={status.id}
            onClick={() =>
              setStatusFilter(statusFilter === status.value ? '' : status.value)
            }
            className={`bg-white rounded-xl border p-4 text-left ${statusFilter === status.value ? 'border-blue-400 shadow-md' : 'border-gray-200 hover:shadow-md'}`}
          >
            <p className="text-2xl font-bold text-gray-800">
              {catalog.meta?.statusCounts?.[status.value] ?? 0}
            </p>
            <p className="text-sm text-gray-500 capitalize">{status.name}</p>
          </button>
        ))}
      </div>

      <div className="flex items-center bg-white border border-gray-200 rounded-lg px-3 py-1.5 max-w-sm">
        <Search size={14} className="text-gray-400 mr-2" />
        <input
          placeholder="Search incidents..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="bg-transparent text-sm outline-none w-full"
        />
      </div>

      <CatalogQueryState
        loading={catalog.query.isPending}
        refreshing={catalog.query.isFetching && !catalog.query.isPending}
        error={catalog.query.error}
        retry={() => void catalog.query.refetch()}
      />
      <div className="space-y-3">
        {filtered.map((inc) => {
          const project = getProjectById(inc.projectId);
          const reporter = getWorkerById(inc.reportedBy);
          return (
            <div
              key={inc.id}
              className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-start gap-3">
                  <div
                    className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                      inc.severity === 'critical' || inc.severity === 'high'
                        ? 'bg-red-100'
                        : 'bg-yellow-100'
                    }`}
                  >
                    <AlertTriangle
                      size={20}
                      className={
                        inc.severity === 'critical' || inc.severity === 'high'
                          ? 'text-red-600'
                          : 'text-yellow-600'
                      }
                    />
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-800">{inc.title}</h3>
                    <p className="text-sm text-gray-500 mt-0.5">
                      {inc.description}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <span
                    className={`text-xs px-2 py-1 rounded-full font-medium capitalize ${severityColor(inc.severity)}`}
                  >
                    {inc.severity}
                  </span>
                  <span
                    className={`text-xs px-2 py-1 rounded-full font-medium capitalize ${statusColor(inc.status)}`}
                    style={{
                      backgroundColor:
                        incidentStatusMap.get(inc.status)?.color || undefined,
                    }}
                  >
                    {incidentStatusMap.get(inc.status)?.name || inc.status}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-4 text-xs text-gray-500">
                <span className="flex items-center gap-1">
                  <MapPin size={12} /> {inc.location}
                </span>
                <span className="flex items-center gap-1">
                  <Calendar size={12} />{' '}
                  {new Date(inc.date).toLocaleDateString()}
                </span>
                <span>Project: {project?.name || '-'}</span>
                <span>
                  Reported by:{' '}
                  {reporter
                    ? `${reporter.firstName} ${reporter.lastName}`
                    : '-'}
                </span>
              </div>
              {inc.actions && (
                <div className="mt-2 bg-gray-50 rounded p-2 text-sm text-gray-600">
                  <span className="font-medium">Actions taken:</span>{' '}
                  {inc.actions}
                </div>
              )}
              <div className="mt-3 flex items-center gap-2">
                {inc.status !== 'investigating' && (
                  <button
                    onClick={() => setNextStatus(inc.id, 'investigating')}
                    className="text-xs px-2 py-1 rounded bg-yellow-100 text-yellow-700 hover:bg-yellow-200"
                  >
                    Mark Investigating
                  </button>
                )}
                {inc.status !== 'resolved' && (
                  <button
                    onClick={() => setNextStatus(inc.id, 'resolved')}
                    className="text-xs px-2 py-1 rounded bg-green-100 text-green-700 hover:bg-green-200"
                  >
                    Mark Resolved
                  </button>
                )}
                {inc.status !== 'closed' && (
                  <button
                    onClick={() => setNextStatus(inc.id, 'closed')}
                    className="text-xs px-2 py-1 rounded bg-gray-100 text-gray-700 hover:bg-gray-200"
                  >
                    Close
                  </button>
                )}
                {inc.status !== openStatusValue && (
                  <button
                    onClick={() => setNextStatus(inc.id, openStatusValue)}
                    className="text-xs px-2 py-1 rounded bg-red-100 text-red-700 hover:bg-red-200"
                  >
                    Re-open
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <DataPagination page={catalog.page} total={(catalog.meta)?.total} pageSize={catalog.pageSize} onPage={catalog.setPage} onPageSize={catalog.setPageSize} busy={catalog.query.isFetching} />
      {showCreateModal && !related.ready && (
        <div
          role="dialog"
          aria-label="Loading incident form"
          className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center"
        >
          <div className="bg-white p-6 rounded-xl">
            <CatalogQueryState
              loading={related.loading}
              error={related.error}
              retry={related.retry}
            />
            <button onClick={() => setShowCreateModal(false)}>Cancel</button>
          </div>
        </div>
      )}
      {showCreateModal && related.ready && (
        <DynamicIncidentReportModal
          template={incidentTemplate}
          workOrders={workOrders}
          onClose={() => setShowCreateModal(false)}
          onSubmit={createIncidentSubmission}
        />
      )}
    </div>
  );
};

export default IncidentsView;
