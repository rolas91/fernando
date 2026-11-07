import React, { useMemo, useState } from 'react';
import { useAppContext } from '@/contexts/AppContext';
import { useToast } from '@/hooks/use-toast';
import { CommercialCatalogItem } from '@/lib/types';
import CatalogImportButton from '@/components/catalog-import/CatalogImportButton';
import { Edit2, Plus, RefreshCcw, Search, Trash2 } from 'lucide-react';

type Draft = {
  sku: string;
  description: string;
  type: string;
  dailyRate: string;
  itemPrice: string;
  unit: string;
  status: string;
  notes: string;
};

const emptyDraft: Draft = {
  sku: '',
  description: '',
  type: '',
  dailyRate: '0',
  itemPrice: '0',
  unit: 'Each',
  status: 'active',
  notes: '',
};

const money = (value: number) => `$${Number(value || 0).toFixed(2)}`;

const ItemsCatalogView: React.FC = () => {
  const {
    commercialCatalogItems,
    addCommercialCatalogItem,
    updateCommercialCatalogItem,
    deleteCommercialCatalogItem,
  } = useAppContext();
  const { toast } = useToast();
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [editing, setEditing] = useState<CommercialCatalogItem | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const types = useMemo(
    () =>
      Array.from(
        new Set(
          commercialCatalogItems.map((item) => item.type).filter(Boolean),
        ),
      ).sort(),
    [commercialCatalogItems],
  );

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    return commercialCatalogItems.filter((item) => {
      if (typeFilter !== 'all' && item.type !== typeFilter) return false;
      if (statusFilter !== 'all' && item.status !== statusFilter) return false;
      if (!term) return true;
      return [item.sku, item.description, item.type, item.unit, item.status]
        .join(' ')
        .toLowerCase()
        .includes(term);
    });
  }, [commercialCatalogItems, query, statusFilter, typeFilter]);

  const openCreate = () => {
    setEditing(null);
    setShowForm(true);
  };

  const openEdit = (item: CommercialCatalogItem) => {
    setEditing(item);
    setShowForm(true);
  };

  const save = async (draft: Draft) => {
    setIsSaving(true);
    try {
      const payload = {
        sku: draft.sku.trim(),
        description: draft.description.trim(),
        type: draft.type.trim(),
        dailyRate: Number(draft.dailyRate || 0),
        itemPrice: Number(draft.itemPrice || 0),
        unit: draft.unit.trim() || 'Each',
        status: draft.status,
        notes: draft.notes.trim(),
      };
      if (editing) {
        await updateCommercialCatalogItem(editing.id, payload);
        toast({
          title: 'Item updated',
          description: `${payload.sku} was saved.`,
        });
      } else {
        await addCommercialCatalogItem(payload);
        toast({
          title: 'Item added',
          description: `${payload.sku} is available for work orders.`,
        });
      }
      setShowForm(false);
      setEditing(null);
    } catch (error) {
      toast({
        title: 'Could not save item',
        description:
          error instanceof Error ? error.message : 'Please review the item.',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const remove = async (item: CommercialCatalogItem) => {
    if (!window.confirm(`Delete ${item.sku} from the work order catalog?`))
      return;
    try {
      await deleteCommercialCatalogItem(item.id);
      toast({ title: 'Item deleted', description: `${item.sku} was removed.` });
    } catch (error) {
      toast({
        title: 'Could not delete item',
        description:
          error instanceof Error ? error.message : 'Please try again.',
        variant: 'destructive',
      });
    }
  };

  if (showForm) {
    return (
      <ItemForm
        editing={editing}
        isSaving={isSaving}
        onCancel={() => {
          setShowForm(false);
          setEditing(null);
        }}
        onSave={save}
      />
    );
  }

  return (
    <div className="p-3 sm:p-6 space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="mb-2 text-sm font-semibold text-primary">
            Catalog &gt; Items Catalog
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Items Catalog</h1>
          <p className="mt-2 text-sm text-gray-500">
            Manage reusable SKU, descriptions and billing rates for work orders.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <CatalogImportButton
            scope="commercial-catalog-items"
            label="Import Excel"
          />
          <button
            onClick={openCreate}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary/90"
          >
            <Plus size={18} /> Add New Item
          </button>
        </div>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <div className="grid gap-4 lg:grid-cols-[1fr_220px_180px_auto]">
          <label className="flex h-10 items-center rounded-md border border-gray-300 px-3">
            <Search size={16} className="mr-2 text-gray-400" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by SKU or description..."
              className="w-full text-sm outline-none"
            />
          </label>
          <select
            value={typeFilter}
            onChange={(event) => setTypeFilter(event.target.value)}
            className="h-10 rounded-md border border-gray-300 bg-white px-3 text-sm"
          >
            <option value="all">All Types</option>
            {types.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            className="h-10 rounded-md border border-gray-300 bg-white px-3 text-sm"
          >
            <option value="all">All Statuses</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
          <button
            onClick={() => {
              setQuery('');
              setTypeFilter('all');
              setStatusFilter('all');
            }}
            className="inline-flex h-10 items-center gap-2 rounded-md border border-gray-300 px-4 text-sm font-semibold text-gray-700"
          >
            <RefreshCcw size={16} /> Clear Filters
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        <div
          className="responsive-table"
          role="region"
          aria-label="Table data"
          tabIndex={0}
        >
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50 text-left text-xs font-semibold uppercase text-gray-500">
              <tr>
                <th className="px-4 py-3">SKU</th>
                <th className="px-4 py-3">Description</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Unit</th>
                <th className="px-4 py-3 text-right">Item Price</th>
                <th className="px-4 py-3 text-right">Daily Rate</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((item) => (
                <tr key={item.id} className="hover:bg-gray-50">
                  <td className="px-4 py-4 font-semibold text-primary">
                    {item.sku}
                  </td>
                  <td className="px-4 py-4">{item.description}</td>
                  <td className="px-4 py-4">{item.type || '-'}</td>
                  <td className="px-4 py-4">{item.unit}</td>
                  <td className="px-4 py-4 text-right font-semibold">
                    {money(Number(item.itemPrice))}
                  </td>
                  <td className="px-4 py-4 text-right font-semibold">
                    {money(Number(item.dailyRate))}
                  </td>
                  <td className="px-4 py-4">
                    <span
                      className={`rounded border px-2 py-1 text-xs font-semibold capitalize ${item.status === 'inactive' ? 'border-gray-200 bg-gray-100 text-gray-700' : 'border-green-200 bg-green-100 text-green-700'}`}
                    >
                      {item.status}
                    </span>
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => openEdit(item)}
                        title="Edit item"
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-gray-200 text-gray-600 hover:border-primary hover:text-primary"
                      >
                        <Edit2 size={15} />
                      </button>
                      <button
                        onClick={() => void remove(item)}
                        title="Delete item"
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-red-200 text-red-600 hover:bg-red-50"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td
                    colSpan={8}
                    className="px-4 py-10 text-center text-gray-500"
                  >
                    No catalog items found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-800">
        Daily Rate is used to calculate rental billing amounts. This catalog
        does not track stock, warehouses or asset movement.
      </div>
    </div>
  );
};

const ItemForm: React.FC<{
  editing: CommercialCatalogItem | null;
  isSaving: boolean;
  onCancel: () => void;
  onSave: (draft: Draft) => Promise<void>;
}> = ({ editing, isSaving, onCancel, onSave }) => {
  const [draft, setDraft] = useState<Draft>(() =>
    editing
      ? {
          sku: editing.sku,
          description: editing.description,
          type: editing.type || '',
          dailyRate: String(editing.dailyRate ?? 0),
          itemPrice: String(editing.itemPrice ?? 0),
          unit: editing.unit || 'Each',
          status: editing.status || 'active',
          notes: editing.notes || '',
        }
      : emptyDraft,
  );

  const update = (key: keyof Draft, value: string) =>
    setDraft((current) => ({ ...current, [key]: value }));

  return (
    <div className="p-3 sm:p-6 space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="mb-2 text-sm font-semibold text-primary">
            Catalog &gt; Items Catalog &gt;{' '}
            {editing ? 'Edit Item' : 'Add New Item'}
          </div>
          <h1 className="text-2xl font-bold text-gray-900">
            {editing ? 'Edit Item' : 'Add New Item'}
          </h1>
          <p className="mt-2 text-sm text-gray-500">
            Create a catalog item for use in work orders.
          </p>
        </div>
        <button
          onClick={onCancel}
          className="rounded-md border border-gray-300 bg-white px-5 py-2.5 text-sm font-semibold text-gray-700"
        >
          Back to Items Catalog
        </button>
      </div>

      <section className="rounded-lg border border-gray-200 bg-white p-3 sm:p-6">
        <h2 className="mb-5 text-lg font-bold text-gray-900">
          Item Information
        </h2>
        <div className="grid gap-5 md:grid-cols-3">
          <Input
            label="SKU *"
            value={draft.sku}
            onChange={(value) => update('sku', value)}
          />
          <Input
            label="Description *"
            value={draft.description}
            onChange={(value) => update('description', value)}
          />
          <Input
            label="Type"
            value={draft.type}
            onChange={(value) => update('type', value)}
            placeholder="Cone, Base, Sign..."
          />
          <Select
            label="Unit *"
            value={draft.unit}
            onChange={(value) => update('unit', value)}
            options={['Each', 'Day', 'Hour', 'Unit']}
          />
          <Input
            label="Item Price (Sale)"
            type="number"
            value={draft.itemPrice}
            onChange={(value) => update('itemPrice', value)}
          />
          <Input
            label="Rental Price (Daily Rate)"
            type="number"
            value={draft.dailyRate}
            onChange={(value) => update('dailyRate', value)}
          />
          <Select
            label="Status *"
            value={draft.status}
            onChange={(value) => update('status', value)}
            options={['active', 'inactive']}
          />
          <label className="md:col-span-3">
            <span className="mb-2 block text-xs font-semibold text-gray-700">
              Notes
            </span>
            <textarea
              value={draft.notes}
              onChange={(event) => update('notes', event.target.value)}
              rows={4}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-primary"
            />
          </label>
        </div>
      </section>

      <div className="flex justify-end gap-3">
        <button
          onClick={onCancel}
          className="rounded-md border border-gray-300 bg-white px-5 py-2.5 text-sm font-semibold text-gray-700"
        >
          Cancel
        </button>
        <button
          disabled={isSaving || !draft.sku.trim() || !draft.description.trim()}
          onClick={() => void onSave(draft)}
          className="rounded-md bg-primary px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
        >
          {isSaving ? 'Saving...' : 'Save Item'}
        </button>
      </div>
    </div>
  );
};

const Input: React.FC<{
  label: string;
  value: string;
  type?: string;
  placeholder?: string;
  onChange: (value: string) => void;
}> = ({ label, value, type = 'text', placeholder, onChange }) => (
  <label>
    <span className="mb-2 block text-xs font-semibold text-gray-700">
      {label}
    </span>
    <input
      type={type}
      value={value}
      placeholder={placeholder}
      onChange={(event) => onChange(event.target.value)}
      className="h-10 w-full rounded-md border border-gray-300 px-3 text-sm outline-none focus:border-primary"
    />
  </label>
);

const Select: React.FC<{
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}> = ({ label, value, options, onChange }) => (
  <label>
    <span className="mb-2 block text-xs font-semibold text-gray-700">
      {label}
    </span>
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="h-10 w-full rounded-md border border-gray-300 bg-white px-3 text-sm outline-none focus:border-primary"
    >
      {options.map((option) => (
        <option key={option} value={option}>
          {option}
        </option>
      ))}
    </select>
  </label>
);

export default ItemsCatalogView;
