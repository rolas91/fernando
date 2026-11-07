import React, { useMemo, useState } from 'react';
import { useAppContext } from '@/contexts/AppContext';
import { useToast } from '@/hooks/use-toast';
import { StatusCatalogItem, StatusCatalogScope } from '@/lib/types';
import CatalogImportButton from '@/components/catalog-import/CatalogImportButton';
import { Edit2, Plus, Search, Trash2, X } from 'lucide-react';

const scopeLabel: Record<StatusCatalogScope, string> = {
  work_order: 'Assignment',
  work_status: 'Work Status',
  shift: 'Shift',
  timesheet: 'Timesheet',
  project: 'Project',
  equipment: 'Equipment',
  material: 'Material',
  availability_request: 'Availability Request',
  incident: 'Incident',
  form_submission: 'Form Submission',
};

const StatusCatalogView: React.FC<{ embedded?: boolean }> = ({
  embedded = false,
}) => {
  const {
    statusCatalog,
    addStatusCatalogItem,
    updateStatusCatalogItem,
    deleteStatusCatalogItem,
  } = useAppContext();
  const { toast } = useToast();
  const [search, setSearch] = useState('');
  const [scopeFilter, setScopeFilter] = useState<'all' | StatusCatalogScope>(
    'all',
  );
  const [statusFilter, setStatusFilter] = useState<
    'all' | StatusCatalogItem['status']
  >('all');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    let next = [...statusCatalog];
    if (search.trim()) {
      const q = search.toLowerCase();
      next = next.filter((item) => {
        return (
          item.name.toLowerCase().includes(q) ||
          item.value.toLowerCase().includes(q) ||
          scopeLabel[item.scope].toLowerCase().includes(q)
        );
      });
    }
    if (scopeFilter !== 'all')
      next = next.filter((item) => item.scope === scopeFilter);
    if (statusFilter !== 'all')
      next = next.filter((item) => item.status === statusFilter);
    next.sort(
      (a, b) =>
        a.scope.localeCompare(b.scope) ||
        a.sortOrder - b.sortOrder ||
        a.name.localeCompare(b.name),
    );
    return next;
  }, [statusCatalog, search, scopeFilter, statusFilter]);

  const openCreate = () => {
    setEditingId(null);
    setShowModal(true);
  };

  const openEdit = (id: string) => {
    setEditingId(id);
    setShowModal(true);
  };

  const handleDelete = async () => {
    if (!pendingDeleteId) return;
    try {
      await deleteStatusCatalogItem(pendingDeleteId);
      toast({ title: 'Status eliminado' });
    } catch (error) {
      toast({
        title: 'Error',
        description:
          error instanceof Error ? error.message : 'Could not delete.',
        variant: 'destructive',
      });
    } finally {
      setPendingDeleteId(null);
    }
  };

  return (
    <div className={embedded ? 'space-y-4' : 'p-6 space-y-4'}>
      {!embedded && (
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-3xl font-bold text-gray-900">Status Catalog</h2>
            <p className="text-sm text-gray-500">
              Manage statuses across business modules.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <CatalogImportButton scope="status-catalog" />
            <button
              onClick={openCreate}
              className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 flex items-center gap-2"
            >
              <Plus size={14} />
              Create Status
            </button>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center bg-gray-100 rounded-lg px-3 py-2 min-w-[240px]">
              <Search size={14} className="text-gray-400 mr-2" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search statuses..."
                className="bg-transparent text-sm outline-none w-full"
              />
            </div>
            <select
              value={scopeFilter}
              onChange={(e) =>
                setScopeFilter(e.target.value as 'all' | StatusCatalogScope)
              }
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white"
            >
              <option value="all">All Scopes</option>
              <option value="work_order">Assignment</option>
              <option value="work_status">Work Status</option>
              <option value="shift">Shift</option>
              <option value="timesheet">Timesheet</option>
              <option value="project">Project</option>
              <option value="equipment">Equipment</option>
              <option value="availability_request">Availability Request</option>
              <option value="incident">Incident</option>
              <option value="form_submission">Form Submission</option>
            </select>
            <select
              value={statusFilter}
              onChange={(e) =>
                setStatusFilter(
                  e.target.value as 'all' | StatusCatalogItem['status'],
                )
              }
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white"
            >
              <option value="all">All Status</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
          {embedded && (
            <button
              onClick={openCreate}
              className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 flex items-center gap-2"
            >
              <Plus size={14} />
              Create Status
            </button>
          )}
        </div>

        <div className="rounded-xl border border-gray-200 overflow-hidden">
          <div
            className="responsive-table"
            role="region"
            aria-label="Table data"
            tabIndex={0}
          >
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">
                    Name
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">
                    Value
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">
                    Scope
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">
                    Order
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">
                    Rules
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((item) => (
                  <tr
                    key={item.id}
                    className="border-b border-gray-100 last:border-b-0 hover:bg-gray-50/60"
                  >
                    <td className="px-4 py-3 text-sm font-medium text-gray-800">
                      <span className="inline-flex items-center gap-2">
                        <span
                          className="inline-block w-2.5 h-2.5 rounded-full"
                          style={{ backgroundColor: item.color }}
                        />
                        {item.name}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700 font-mono">
                      {item.value}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700">
                      {scopeLabel[item.scope]}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700">
                      {item.sortOrder}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-700">
                      <div className="flex items-center gap-2 flex-wrap">
                        {item.blocksEditing && (
                          <span className="px-2 py-1 rounded bg-gray-100">
                            Blocks edit
                          </span>
                        )}
                        {item.triggersNotification && (
                          <span className="px-2 py-1 rounded bg-blue-100 text-blue-700">
                            Notify
                          </span>
                        )}
                        {item.requiresApproval && (
                          <span className="px-2 py-1 rounded bg-amber-100 text-amber-700">
                            Approval
                          </span>
                        )}
                        {!item.blocksEditing &&
                          !item.triggersNotification &&
                          !item.requiresApproval && (
                            <span className="px-2 py-1 rounded bg-gray-100 text-gray-600">
                              —
                            </span>
                          )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => openEdit(item.id)}
                          className="p-1 hover:bg-gray-100 rounded"
                        >
                          <Edit2 size={14} className="text-gray-500" />
                        </button>
                        <button
                          onClick={() => setPendingDeleteId(item.id)}
                          className="p-1 hover:bg-red-50 rounded"
                          title="Delete status"
                          aria-label={`Delete ${item.name}`}
                        >
                          <Trash2 size={14} className="text-red-500" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-4 py-10 text-center text-sm text-gray-500"
                    >
                      No statuses found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {showModal && (
        <StatusCatalogModal
          itemId={editingId}
          onClose={() => {
            setShowModal(false);
            setEditingId(null);
          }}
          onCreate={addStatusCatalogItem}
          onUpdate={updateStatusCatalogItem}
        />
      )}

      {pendingDeleteId && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-2 sm:p-4">
          <div className="bg-white rounded-xl w-full max-w-sm p-5">
            <h3 className="text-lg font-semibold text-gray-800">
              Delete status?
            </h3>
            <p className="text-sm text-gray-500 mt-1">
              This action cannot be undone.
            </p>
            <div className="mt-4 flex gap-3">
              <button
                onClick={() => setPendingDeleteId(null)}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                className="flex-1 px-4 py-2 rounded-lg text-sm font-medium bg-red-600 text-white hover:bg-red-700"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const StatusCatalogModal: React.FC<{
  itemId: string | null;
  onClose: () => void;
  onCreate: (item: StatusCatalogItem) => void;
  onUpdate: (id: string, updates: Partial<StatusCatalogItem>) => void;
}> = ({ itemId, onClose, onCreate, onUpdate }) => {
  const { statusCatalog } = useAppContext();
  const { toast } = useToast();
  const existing = itemId
    ? statusCatalog.find((item) => item.id === itemId)
    : null;
  const [form, setForm] = useState<StatusCatalogItem>({
    id: existing?.id || `status_${Date.now()}`,
    scope: existing?.scope || 'work_order',
    value: existing?.value || '',
    name: existing?.name || '',
    color: existing?.color || '#3B82F6',
    sortOrder: existing?.sortOrder ?? 10,
    blocksEditing: existing?.blocksEditing || false,
    triggersNotification: existing?.triggersNotification || false,
    requiresApproval: existing?.requiresApproval || false,
    status: existing?.status || 'active',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.value.trim()) {
      toast({
        title: 'Validation',
        description: 'Name and value are required',
        variant: 'destructive',
      });
      return;
    }

    try {
      if (itemId) await onUpdate(itemId, form);
      else await onCreate(form);
      onClose();
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Could not save.',
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-2 sm:p-4">
      <div className="bg-white rounded-xl w-full max-w-md">
        <div className="p-5 border-b border-gray-200 flex items-center justify-between flex-wrap gap-3">
          <h3 className="text-lg font-semibold">
            {itemId ? 'Edit Status' : 'Create Status'}
          </h3>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded">
            <X size={18} className="text-gray-400" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div className="responsive-grid grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Scope
              </label>
              <select
                value={form.scope}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    scope: e.target.value as StatusCatalogScope,
                  }))
                }
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              >
                <option value="work_order">Assignment</option>
                <option value="work_status">Work Status</option>
                <option value="shift">Shift</option>
                <option value="timesheet">Timesheet</option>
                <option value="project">Project</option>
                <option value="equipment">Equipment</option>
                <option value="availability_request">
                  Availability Request
                </option>
                <option value="incident">Incident</option>
                <option value="form_submission">Form Submission</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Order
              </label>
              <input
                type="number"
                value={form.sortOrder}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    sortOrder: Number(e.target.value || 0),
                  }))
                }
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div className="responsive-grid grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Name
              </label>
              <input
                value={form.name}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, name: e.target.value }))
                }
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Value
              </label>
              <input
                value={form.value}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    value: e.target.value.toLowerCase().replace(/\s+/g, '_'),
                  }))
                }
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono"
                placeholder="in_progress"
                required
              />
            </div>
          </div>

          <div className="responsive-grid grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Color
              </label>
              <input
                type="color"
                value={form.color}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, color: e.target.value }))
                }
                className="w-full h-10 border border-gray-300 rounded-lg px-2"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Status
              </label>
              <select
                value={form.status}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    status: e.target.value as StatusCatalogItem['status'],
                  }))
                }
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-2 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={form.blocksEditing}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    blocksEditing: e.target.checked,
                  }))
                }
              />
              Blocks editing
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={form.triggersNotification}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    triggersNotification: e.target.checked,
                  }))
                }
              />
              Triggers notification
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={form.requiresApproval}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    requiresApproval: e.target.checked,
                  }))
                }
              />
              Requires approval
            </label>
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
              className="flex-1 px-4 py-2 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {itemId ? 'Save' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default StatusCatalogView;
