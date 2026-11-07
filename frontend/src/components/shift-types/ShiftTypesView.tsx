import React, { useMemo, useState } from 'react';
import { Clock3, Edit2, Plus, Search, Trash2, X } from 'lucide-react';
import { useAppContext } from '@/contexts/AppContext';
import { useToast } from '@/hooks/use-toast';
import type { ShiftTemplate } from '@/lib/types';

const typeLabel: Record<ShiftTemplate['type'], string> = {
  standard: 'Standard',
  on_call: 'On Call',
  temporary: 'Temporary',
};

const formatTime = (value?: string | null) => {
  if (!value) return '—';
  const [hours, minutes] = value.split(':').map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return value;
  const date = new Date();
  date.setHours(hours, minutes, 0, 0);
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });
};

const ShiftTypesView: React.FC<{ embedded?: boolean }> = ({
  embedded = false,
}) => {
  const { shifts, addShift, updateShift, deleteShift } = useAppContext();
  const { toast } = useToast();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<
    'all' | ShiftTemplate['status']
  >('all');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return shifts
      .filter((item) => statusFilter === 'all' || item.status === statusFilter)
      .filter(
        (item) =>
          !query ||
          `${item.name} ${typeLabel[item.type]}`.toLowerCase().includes(query),
      )
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [search, shifts, statusFilter]);

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
    setDeleting(true);
    try {
      await deleteShift(pendingDeleteId);
      toast({
        title: 'Shift type deleted',
        description: 'The shift type was removed successfully.',
      });
      setPendingDeleteId(null);
    } catch (error) {
      toast({
        title: 'Could not delete shift type',
        description:
          error instanceof Error ? error.message : 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className={embedded ? 'space-y-4' : 'p-6 space-y-4'}>
      {!embedded && (
        <div>
          <h2 className="text-3xl font-bold text-gray-900">Shift Types</h2>
          <p className="text-sm text-gray-500">
            Manage the shift templates available in assignments.
          </p>
        </div>
      )}

      <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex min-w-[240px] items-center rounded-lg bg-gray-100 px-3 py-2">
              <Search size={14} className="mr-2 text-gray-400" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search shift types..."
                className="w-full bg-transparent text-sm outline-none"
              />
            </div>
            <select
              value={statusFilter}
              onChange={(event) =>
                setStatusFilter(event.target.value as typeof statusFilter)
              }
              className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
            >
              <option value="all">All Status</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
          <button
            type="button"
            onClick={openCreate}
            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            <Plus size={14} /> Create Shift Type
          </button>
        </div>

        <div className="overflow-hidden rounded-xl border border-gray-200">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-gray-200 bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-500">
                    Name
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-500">
                    Type
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-500">
                    Time Range
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-500">
                    Duration
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-500">
                    Status
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase text-gray-500">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((item) => (
                  <tr
                    key={item.id}
                    className="border-b border-gray-100 last:border-0 hover:bg-gray-50/60"
                  >
                    <td className="px-4 py-3 text-sm font-medium text-gray-800">
                      {item.name}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {typeLabel[item.type]}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {formatTime(item.startTime)} – {formatTime(item.endTime)}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {item.durationHours
                        ? `${item.durationHours} hours`
                        : 'Calculated from range'}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2 py-1 text-xs font-medium ${
                          item.status === 'active'
                            ? 'bg-green-100 text-green-700'
                            : 'bg-gray-100 text-gray-600'
                        }`}
                      >
                        {item.status === 'active' ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => openEdit(item.id)}
                          className="rounded p-1.5 hover:bg-gray-100"
                          title="Edit shift type"
                        >
                          <Edit2 size={14} className="text-gray-500" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setPendingDeleteId(item.id)}
                          className="rounded p-1.5 hover:bg-red-50"
                          title="Delete shift type"
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
                      No shift types found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {showModal && (
        <ShiftTypeModal
          itemId={editingId}
          onClose={() => {
            setShowModal(false);
            setEditingId(null);
          }}
          onCreate={addShift}
          onUpdate={updateShift}
        />
      )}

      {pendingDeleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-2 sm:p-4">
          <div className="w-full max-w-sm rounded-xl bg-white p-5">
            <h3 className="text-lg font-semibold text-gray-800">
              Delete shift type?
            </h3>
            <p className="mt-1 text-sm text-gray-500">
              Existing shifts may still reference this type. Use Inactive
              instead if you need to preserve it for historical records.
            </p>
            <div className="mt-4 flex gap-3">
              <button
                type="button"
                disabled={deleting}
                onClick={() => setPendingDeleteId(null)}
                className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={handleDelete}
                className="flex-1 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60"
              >
                {deleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const ShiftTypeModal: React.FC<{
  itemId: string | null;
  onClose: () => void;
  onCreate: (item: ShiftTemplate) => void;
  onUpdate: (id: string, item: Partial<ShiftTemplate>) => void;
}> = ({ itemId, onClose, onCreate, onUpdate }) => {
  const { shifts } = useAppContext();
  const { toast } = useToast();
  const existing = itemId ? shifts.find((item) => item.id === itemId) : null;
  const [form, setForm] = useState<ShiftTemplate>({
    id: existing?.id || `shift_type_${Date.now()}`,
    name: existing?.name || '',
    type: existing?.type || 'standard',
    startTime: existing?.startTime || '07:00',
    endTime: existing?.endTime || '16:00',
    durationHours: existing?.durationHours ?? null,
    status: existing?.status || 'active',
  });
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.name.trim()) {
      toast({ title: 'Shift type name is required', variant: 'destructive' });
      return;
    }
    if (!form.startTime || !form.endTime) {
      toast({
        title: 'Start and end times are required',
        variant: 'destructive',
      });
      return;
    }
    if (
      form.durationHours !== null &&
      form.durationHours !== undefined &&
      form.durationHours <= 0
    ) {
      toast({
        title: 'Duration must be greater than zero',
        variant: 'destructive',
      });
      return;
    }

    const payload: ShiftTemplate = {
      ...form,
      name: form.name.trim(),
      durationHours: form.durationHours || null,
    };
    setSaving(true);
    try {
      if (itemId) await onUpdate(itemId, payload);
      else await onCreate(payload);
      toast({
        title: itemId ? 'Shift type updated' : 'Shift type created',
        description: `${payload.name} was saved successfully.`,
      });
      onClose();
    } catch (error) {
      toast({
        title: 'Could not save shift type',
        description:
          error instanceof Error
            ? error.message
            : 'Please review the information and try again.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-2 sm:p-4">
      <div className="w-full max-w-lg rounded-xl bg-white">
        <div className="flex items-center justify-between border-b border-gray-200 p-5 flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <Clock3 size={18} className="text-primary" />
            <h3 className="text-lg font-semibold">
              {itemId ? 'Edit Shift Type' : 'Create Shift Type'}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 hover:bg-gray-100"
          >
            <X size={18} className="text-gray-400" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4 p-5">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Name *
            </label>
            <input
              required
              value={form.name}
              onChange={(event) =>
                setForm((current) => ({ ...current, name: event.target.value }))
              }
              placeholder="e.g., Day Shift"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Category *
            </label>
            <select
              value={form.type}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  type: event.target.value as ShiftTemplate['type'],
                }))
              }
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
            >
              <option value="standard">Standard</option>
              <option value="on_call">On Call</option>
              <option value="temporary">Temporary</option>
            </select>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Start Time *
              </label>
              <input
                required
                type="time"
                value={form.startTime || ''}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    startTime: event.target.value,
                  }))
                }
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                End Time *
              </label>
              <input
                required
                type="time"
                value={form.endTime || ''}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    endTime: event.target.value,
                  }))
                }
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Duration Hours
            </label>
            <input
              type="number"
              min={0.25}
              step={0.25}
              value={form.durationHours ?? ''}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  durationHours: event.target.value
                    ? Number(event.target.value)
                    : null,
                }))
              }
              placeholder="Calculated from time range"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
            <p className="mt-1 text-xs text-gray-500">
              Optional. Leave empty to calculate duration from the time range.
            </p>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Status
            </label>
            <select
              value={form.status}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  status: event.target.value as ShiftTemplate['status'],
                }))
              }
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
            >
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              disabled={saving}
              onClick={onClose}
              className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
            >
              {saving
                ? 'Saving...'
                : itemId
                  ? 'Save Changes'
                  : 'Create Shift Type'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ShiftTypesView;
