import React, { useMemo, useState } from 'react';
import { useAppContext } from '@/contexts/AppContext';
import { useToast } from '@/hooks/use-toast';
import { Skill } from '@/lib/types';
import CatalogImportButton from '@/components/catalog-import/CatalogImportButton';
import { Edit2, Plus, Search, Sparkles, Trash2, X } from 'lucide-react';

const statusBadgeClass = (status: Skill['status']) =>
  status === 'active'
    ? 'bg-green-100 text-green-700'
    : 'bg-gray-100 text-gray-600';

const SkillsView: React.FC<{ embedded?: boolean }> = ({ embedded = false }) => {
  const { skills, addSkill, updateSkill, deleteSkill } = useAppContext();
  const { toast } = useToast();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | Skill['status']>(
    'all',
  );
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    let next = [...skills];
    if (search.trim()) {
      const query = search.toLowerCase();
      next = next.filter((item) => {
        const name = item.name.toLowerCase();
        const description = (item.description || '').toLowerCase();
        return name.includes(query) || description.includes(query);
      });
    }
    if (statusFilter !== 'all') {
      next = next.filter((item) => item.status === statusFilter);
    }
    return next.sort((a, b) => a.name.localeCompare(b.name));
  }, [skills, search, statusFilter]);

  const handleDelete = async () => {
    if (!pendingDeleteId) return;
    try {
      await deleteSkill(pendingDeleteId);
      toast({ title: 'Skill eliminada' });
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
      {!embedded ? (
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-3xl font-bold text-gray-900">Skills</h2>
            <p className="text-sm text-gray-500">
              Manage skill options available to workers.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <CatalogImportButton scope="skills" />
            <button
              onClick={() => {
                setEditingId(null);
                setShowModal(true);
              }}
              className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 flex items-center gap-2"
            >
              <Plus size={14} />
              Create Skill
            </button>
          </div>
        </div>
      ) : null}

      <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center bg-gray-100 rounded-lg px-3 py-2 min-w-[240px]">
              <Search size={14} className="text-gray-400 mr-2" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search skills..."
                className="bg-transparent text-sm outline-none w-full"
              />
            </div>
            <select
              value={statusFilter}
              onChange={(event) =>
                setStatusFilter(event.target.value as 'all' | Skill['status'])
              }
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white"
            >
              <option value="all">All Status</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
          {embedded ? (
            <button
              onClick={() => {
                setEditingId(null);
                setShowModal(true);
              }}
              className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 flex items-center gap-2"
            >
              <Plus size={14} />
              Create Skill
            </button>
          ) : null}
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
                    Description
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">
                    Status
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
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2 text-sm font-medium text-gray-800">
                        <Sparkles size={14} className="text-amber-500" />
                        {item.name}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700">
                      {item.description || '—'}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`text-xs px-2 py-1 rounded-full font-medium ${statusBadgeClass(item.status)}`}
                      >
                        {item.status === 'active' ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => {
                            setEditingId(item.id);
                            setShowModal(true);
                          }}
                          className="p-1 hover:bg-gray-100 rounded"
                        >
                          <Edit2 size={14} className="text-gray-500" />
                        </button>
                        <button
                          onClick={() => setPendingDeleteId(item.id)}
                          className="p-1 hover:bg-red-50 rounded"
                          title="Delete skill"
                          aria-label={`Delete ${item.name}`}
                        >
                          <Trash2 size={14} className="text-red-500" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 ? (
                  <tr>
                    <td
                      colSpan={4}
                      className="px-4 py-10 text-center text-sm text-gray-500"
                    >
                      No skills found.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {showModal ? (
        <SkillModal
          itemId={editingId}
          onClose={() => {
            setShowModal(false);
            setEditingId(null);
          }}
          onCreate={addSkill}
          onUpdate={updateSkill}
        />
      ) : null}

      {pendingDeleteId ? (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-2 sm:p-4">
          <div className="bg-white rounded-xl w-full max-w-sm p-5">
            <h3 className="text-lg font-semibold text-gray-800">
              Delete skill?
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
      ) : null}
    </div>
  );
};

const SkillModal: React.FC<{
  itemId: string | null;
  onClose: () => void;
  onCreate: (item: Skill) => void;
  onUpdate: (id: string, updates: Partial<Skill>) => void;
}> = ({ itemId, onClose, onCreate, onUpdate }) => {
  const { skills } = useAppContext();
  const { toast } = useToast();
  const existing = itemId ? skills.find((item) => item.id === itemId) : null;
  const [form, setForm] = useState<Skill>({
    id: existing?.id || `skill_${Date.now()}`,
    name: existing?.name || '',
    description: existing?.description || '',
    status: existing?.status || 'active',
  });

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.name.trim()) {
      toast({
        title: 'Validation',
        description: 'Skill name is required',
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
            {itemId ? 'Edit Skill' : 'Create Skill'}
          </h3>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded">
            <X size={18} className="text-gray-400" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Skill Name
            </label>
            <input
              value={form.name}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, name: event.target.value }))
              }
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Description
            </label>
            <textarea
              value={form.description || ''}
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  description: event.target.value,
                }))
              }
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              rows={3}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Status
            </label>
            <select
              value={form.status}
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  status: event.target.value as Skill['status'],
                }))
              }
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            >
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
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

export default SkillsView;
