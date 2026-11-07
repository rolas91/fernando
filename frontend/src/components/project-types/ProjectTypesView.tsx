import React, { useMemo, useState } from 'react';
import { useAppContext } from '@/contexts/AppContext';
import { useToast } from '@/hooks/use-toast';
import { ProjectType } from '@/lib/types';
import CatalogImportButton from '@/components/catalog-import/CatalogImportButton';
import { Edit2, Plus, Search, Trash2, X } from 'lucide-react';

const statusBadgeClass = (status: ProjectType['status']) =>
  status === 'active'
    ? 'bg-green-100 text-green-700'
    : 'bg-gray-100 text-gray-600';

const ProjectTypesView: React.FC<{ embedded?: boolean }> = ({
  embedded = false,
}) => {
  const { projectTypes, addProjectType, updateProjectType, deleteProjectType } =
    useAppContext();
  const { toast } = useToast();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<
    'all' | ProjectType['status']
  >('all');
  const [sortMode, setSortMode] = useState<'a-z' | 'z-a'>('a-z');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    let next = [...projectTypes];
    if (search.trim()) {
      const q = search.toLowerCase();
      next = next.filter((item) => {
        const name = item.name.toLowerCase();
        const description = (item.description || '').toLowerCase();
        return name.includes(q) || description.includes(q);
      });
    }
    if (statusFilter !== 'all')
      next = next.filter((item) => item.status === statusFilter);
    next.sort((a, b) =>
      sortMode === 'a-z'
        ? a.name.localeCompare(b.name)
        : b.name.localeCompare(a.name),
    );
    return next;
  }, [projectTypes, search, statusFilter, sortMode]);

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
      await deleteProjectType(pendingDeleteId);
      toast({ title: 'Project type eliminado' });
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
            <h2 className="text-3xl font-bold text-gray-900">Project Types</h2>
            <p className="text-sm text-gray-500">
              Manage and configure project types.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <CatalogImportButton scope="project-types" />
            <button
              onClick={openCreate}
              className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 flex items-center gap-2"
            >
              <Plus size={14} />
              Create Type
            </button>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap gap-3">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center bg-gray-100 rounded-lg px-3 py-2 min-w-[240px]">
              <Search size={14} className="text-gray-400 mr-2" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search project types..."
                className="bg-transparent text-sm outline-none w-full"
              />
            </div>
            <select
              value={statusFilter}
              onChange={(e) =>
                setStatusFilter(e.target.value as 'all' | ProjectType['status'])
              }
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white"
            >
              <option value="all">All Status</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
          <select
            value={sortMode}
            onChange={(e) => setSortMode(e.target.value as 'a-z' | 'z-a')}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white"
          >
            <option value="a-z">Sort: A-Z</option>
            <option value="z-a">Sort: Z-A</option>
          </select>
        </div>
        {embedded && (
          <div className="flex justify-end">
            <button
              onClick={openCreate}
              className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 flex items-center gap-2"
            >
              <Plus size={14} />
              Create Type
            </button>
          </div>
        )}

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
                    <td className="px-4 py-3 text-sm font-medium text-gray-800">
                      {item.name}
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
                          onClick={() => openEdit(item.id)}
                          className="p-1 hover:bg-gray-100 rounded"
                        >
                          <Edit2 size={14} className="text-gray-500" />
                        </button>
                        <button
                          onClick={() => setPendingDeleteId(item.id)}
                          className="p-1 hover:bg-red-50 rounded"
                          title="Delete project type"
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
                      colSpan={4}
                      className="px-4 py-10 text-center text-sm text-gray-500"
                    >
                      No project types found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {showModal && (
        <ProjectTypeModal
          itemId={editingId}
          onClose={() => {
            setShowModal(false);
            setEditingId(null);
          }}
          onCreate={addProjectType}
          onUpdate={updateProjectType}
        />
      )}

      {pendingDeleteId && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-2 sm:p-4">
          <div className="bg-white rounded-xl w-full max-w-sm p-5">
            <h3 className="text-lg font-semibold text-gray-800">
              Delete project type?
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

const ProjectTypeModal: React.FC<{
  itemId: string | null;
  onClose: () => void;
  onCreate: (item: ProjectType) => void;
  onUpdate: (id: string, updates: Partial<ProjectType>) => void;
}> = ({ itemId, onClose, onCreate, onUpdate }) => {
  const { projectTypes } = useAppContext();
  const { toast } = useToast();
  const existing = itemId
    ? projectTypes.find((item) => item.id === itemId)
    : null;
  const [form, setForm] = useState<ProjectType>({
    id: existing?.id || `pt_${Date.now()}`,
    name: existing?.name || '',
    description: existing?.description || '',
    status: existing?.status || 'active',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      toast({
        title: 'Validation',
        description: 'Type name is required',
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
            {itemId ? 'Edit Project Type' : 'Create Project Type'}
          </h3>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded">
            <X size={18} className="text-gray-400" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Type Name
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
              Description
            </label>
            <textarea
              value={form.description || ''}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, description: e.target.value }))
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
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  status: e.target.value as ProjectType['status'],
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

export default ProjectTypesView;
