import DataPagination from '@/components/shared/DataPagination';
import { usePagedCatalog } from '@/hooks/use-paged-catalog';
import CatalogQueryState from '@/components/shared/CatalogQueryState';
import React, { useEffect, useMemo, useState } from 'react';
import type { Material } from '@/lib/types';
import { useAppContext, AppContextOverride } from '@/contexts/AppContext';
import { useToast } from '@/hooks/use-toast';
import CatalogImportButton from '@/components/catalog-import/CatalogImportButton';
import {
  Download,
  Edit2,
  Package,
  Plus,
  Search,
  Trash2,
  Wrench,
  X,
} from 'lucide-react';

const MaterialsView: React.FC = () => {
  const { settings, statusCatalog } = useAppContext();
  const { toast } = useToast();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const catalog = usePagedCatalog<Material>('materials', {
    search,
    status: statusFilter,
    type: typeFilter,
  });
  const materials = catalog.rows;
  const { updateMaterial, deleteMaterial, deleteMaterials } = catalog.overrides;
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  useEffect(() => {
    setSelectedIds(new Set());
  }, [search, typeFilter, statusFilter]);
  useEffect(() => {
    setSelectedIds(
      (previous) =>
        new Set(
          [...previous].filter((id) =>
            materials.some((item) => item.id === id),
          ),
        ),
    );
  }, [materials]);

  const materialStatuses = useMemo(() => {
    const configured = statusCatalog
      .filter((item) => item.scope === 'material' && item.status === 'active')
      .sort(
        (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name),
      );
    if (configured.length > 0) return configured;
    return [
      {
        id: 'mat_available',
        scope: 'material',
        value: 'available',
        name: 'Available',
        color: '#22C55E',
        sortOrder: 10,
        blocksEditing: false,
        triggersNotification: false,
        requiresApproval: false,
        status: 'active',
      },
      {
        id: 'mat_assigned',
        scope: 'material',
        value: 'assigned',
        name: 'Assigned',
        color: '#F59E0B',
        sortOrder: 20,
        blocksEditing: false,
        triggersNotification: true,
        requiresApproval: false,
        status: 'active',
      },
      {
        id: 'mat_maintenance',
        scope: 'material',
        value: 'maintenance',
        name: 'Maintenance',
        color: '#EF4444',
        sortOrder: 30,
        blocksEditing: false,
        triggersNotification: true,
        requiresApproval: true,
        status: 'active',
      },
      {
        id: 'mat_retired',
        scope: 'material',
        value: 'retired',
        name: 'Retired',
        color: '#6B7280',
        sortOrder: 40,
        blocksEditing: true,
        triggersNotification: false,
        requiresApproval: false,
        status: 'active',
      },
    ];
  }, [statusCatalog]);

  const materialStatusMap = useMemo(
    () => new Map(materialStatuses.map((item) => [item.value, item])),
    [materialStatuses],
  );

  const filtered = materials;
  const statusCounts = catalog.meta?.statusCounts || {};

  const handleExport = async () => {
    const records = await catalog.exportAll();
    if (!records) return;
    const csv = [
      [
        'ID',
        'SKU',
        'Identifier',
        'Name',
        'Type',
        'Brand',
        'Price',
        'Status',
      ].join(','),
      ...records.map((material) =>
        [
          material.id,
          material.sku || '',
          material.identifier,
          material.name,
          material.type,
          material.brand || '',
          material.price ?? '',
          material.status,
        ]
          .map((value) => `"${String(value).replace(/"/g, '""')}"`)
          .join(','),
      ),
    ].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'materials.csv';
    anchor.click();
  };

  const handleDelete = async (id: string, name: string) => {
    if (
      !window.confirm(
        `Delete material "${name}"? It will no longer appear in the catalog.`,
      )
    )
      return;
    setDeleting(true);
    try {
      await deleteMaterial(id);
    } catch (error) {
      toast({
        title: 'Could not delete material',
        description:
          error instanceof Error ? error.message : 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setDeleting(false);
    }
  };

  const selectedVisible = filtered.filter((item) => selectedIds.has(item.id));
  const allSelected =
    filtered.length > 0 && selectedVisible.length === filtered.length;
  const handleBulkDelete = async () => {
    const ids = selectedVisible.map((item) => item.id);
    if (
      !ids.length ||
      !window.confirm(
        `Delete ${ids.length} selected materials from the catalog? Existing assignments and historical records will be preserved.`,
      )
    )
      return;
    setDeleting(true);
    try {
      const count = await deleteMaterials(ids);
      setSelectedIds(new Set());
      toast({ title: `${count} materials removed from the catalog` });
    } catch (error) {
      toast({
        title: 'Could not delete materials',
        description:
          error instanceof Error ? error.message : 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <AppContextOverride value={catalog.overrides}>
      <div className="p-3 sm:p-6 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-lg font-semibold text-gray-800">Materials</h2>
            <p className="text-sm text-gray-500">
              {catalog.meta?.totalItems ?? '—'} total items
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={handleExport}
              disabled={catalog.exporting || catalog.query.isPending}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50 flex items-center gap-1"
            >
              <Download size={14} /> Export
            </button>
            <CatalogImportButton
              scope="materials"
              onDone={() => void catalog.refresh()}
            />
            <button
              disabled={catalog.query.isPending || Boolean(catalog.query.error)}
              onClick={() => setShowAddModal(true)}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 flex items-center gap-1"
            >
              <Plus size={14} /> Add Material
            </button>
          </div>
        </div>

        <div className="responsive-grid grid grid-cols-3 gap-4">
          {materialStatuses.slice(0, 3).map((status) => (
            <div
              key={status.id}
              className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-3"
            >
              <div
                className="w-10 h-10 rounded-lg flex items-center justify-center"
                style={{ backgroundColor: `${status.color}22` }}
              >
                {status.value.includes('maintenance') ? (
                  <Wrench size={20} style={{ color: status.color }} />
                ) : (
                  <Package size={20} style={{ color: status.color }} />
                )}
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-800">
                  {catalog.meta ? Number(statusCounts[status.value]) || 0 : '—'}
                </p>
                <p className="text-xs text-gray-500">{status.name}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-3 bg-white p-3 rounded-lg border border-gray-200 flex-wrap">
          <div className="flex items-center bg-gray-100 rounded px-3 py-1.5 basis-48 flex-1 max-w-sm">
            <Search size={14} className="text-gray-400 mr-2" />
            <input
              placeholder="Search materials..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="bg-transparent text-sm outline-none w-full"
            />
          </div>
          <select
            value={typeFilter}
            onChange={(event) => setTypeFilter(event.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm bg-white"
          >
            <option value="">All Types</option>
            {settings.materialTypes.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm bg-white"
          >
            <option value="">All Status</option>
            {materialStatuses.map((status) => (
              <option key={status.id} value={status.value}>
                {status.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-600">
            {selectedVisible.length} selected
          </span>
          <button
            disabled={
              deleting ||
              !selectedVisible.length ||
              selectedVisible.length > 1000
            }
            onClick={() => void handleBulkDelete()}
            className="px-3 py-2 rounded-lg text-sm text-red-600 border border-red-200 disabled:opacity-50"
          >
            {deleting ? 'Deleting...' : 'Delete selected'}
          </button>
          {selectedVisible.length > 1000 && (
            <span className="text-sm text-red-600">
              Select up to 1000 materials at a time.
            </span>
          )}
        </div>
        <CatalogQueryState
          loading={catalog.query.isPending}
          error={catalog.query.error}
          retry={() => void catalog.query.refetch()}
        />
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div
            className="responsive-table"
            role="region"
            aria-label="Table data"
            tabIndex={0}
          >
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="px-4 py-3">
                    <input
                      type="checkbox"
                      aria-label="Select all materials on this page"
                      checked={allSelected}
                      disabled={deleting || !filtered.length}
                      onChange={(event) =>
                        setSelectedIds(
                          event.target.checked
                            ? new Set(filtered.map((item) => item.id))
                            : new Set(),
                        )
                      }
                    />
                  </th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-3">
                    ID
                  </th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-3">
                    SKU
                  </th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-3">
                    Legacy reference
                  </th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-3">
                    Material
                  </th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-3">
                    Type
                  </th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-3">
                    Brand
                  </th>
                  <th className="text-right text-xs font-medium text-gray-500 uppercase px-4 py-3">
                    Price
                  </th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-3">
                    Status
                  </th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-3">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((material) => (
                  <tr
                    key={material.id}
                    className="border-b border-gray-50 hover:bg-gray-50"
                  >
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        aria-label={`Select ${material.name}`}
                        checked={selectedIds.has(material.id)}
                        disabled={deleting}
                        onChange={(event) => {
                          const checked = event.target.checked;
                          setSelectedIds((previous) => {
                            const next = new Set(previous);
                            if (checked) next.add(material.id);
                            else next.delete(material.id);
                            return next;
                          });
                        }}
                      />
                    </td>
                    <td className="px-4 py-3 text-sm font-mono text-gray-600">
                      {material.id}
                    </td>
                    <td className="px-4 py-3 text-sm font-mono text-primary">
                      {material.sku || '-'}
                    </td>
                    <td className="px-4 py-3 text-sm font-mono text-primary">
                      {material.identifier}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div
                          className="w-8 h-8 rounded flex items-center justify-center text-white text-xs font-bold"
                          style={{
                            backgroundColor:
                              materialStatusMap.get(material.status)?.color ||
                              '#9CA3AF',
                          }}
                        >
                          {material.identifier.split('-')[0]}
                        </div>
                        <span className="text-sm font-medium text-gray-800">
                          {material.name}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {material.type}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {material.brand || '-'}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600 text-right">
                      {material.price !== undefined &&
                      material.price !== null &&
                      String(material.price) !== ''
                        ? `$${Number(material.price).toFixed(2)}`
                        : '-'}
                    </td>
                    <td className="px-4 py-3">
                      <select
                        value={material.status}
                        onChange={(event) =>
                          updateMaterial(material.id, {
                            status: event.target.value as any,
                          })
                        }
                        className="text-xs px-2 py-1 rounded-full font-medium border-0 cursor-pointer text-white"
                        style={{
                          backgroundColor:
                            materialStatusMap.get(material.status)?.color ||
                            '#9CA3AF',
                        }}
                      >
                        {materialStatuses.map((status) => (
                          <option key={status.id} value={status.value}>
                            {status.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <button
                          disabled={deleting}
                          onClick={() => setEditingId(material.id)}
                          className="p-1 hover:bg-gray-100 rounded"
                          aria-label={`Edit ${material.name}`}
                        >
                          <Edit2 size={14} className="text-gray-400" />
                        </button>
                        <button
                          disabled={deleting}
                          onClick={() =>
                            void handleDelete(material.id, material.name)
                          }
                          className="p-1 hover:bg-red-50 rounded"
                          aria-label={`Delete ${material.name}`}
                        >
                          <Trash2 size={14} className="text-red-500" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {showAddModal || editingId ? (
          <MaterialModal
            materialId={editingId}
            onClose={() => {
              setShowAddModal(false);
              setEditingId(null);
            }}
          />
        ) : null}
        <DataPagination page={catalog.page} total={(catalog.meta)?.total} pageSize={catalog.pageSize} onPage={catalog.setPage} onPageSize={catalog.setPageSize} busy={catalog.query.isFetching} />
      </div>
    </AppContextOverride>
  );
};

const MaterialModal: React.FC<{
  materialId: string | null;
  onClose: () => void;
}> = ({ materialId, onClose }) => {
  const { materials, settings, statusCatalog, addMaterial, updateMaterial } =
    useAppContext();
  const { toast } = useToast();
  const materialStatuses = useMemo(() => {
    const configured = statusCatalog
      .filter((item) => item.scope === 'material' && item.status === 'active')
      .sort(
        (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name),
      );
    if (configured.length > 0) return configured;
    return [
      {
        id: 'mat_available',
        scope: 'material',
        value: 'available',
        name: 'Available',
        color: '#22C55E',
        sortOrder: 10,
        blocksEditing: false,
        triggersNotification: false,
        requiresApproval: false,
        status: 'active',
      },
      {
        id: 'mat_assigned',
        scope: 'material',
        value: 'assigned',
        name: 'Assigned',
        color: '#F59E0B',
        sortOrder: 20,
        blocksEditing: false,
        triggersNotification: true,
        requiresApproval: false,
        status: 'active',
      },
      {
        id: 'mat_maintenance',
        scope: 'material',
        value: 'maintenance',
        name: 'Maintenance',
        color: '#EF4444',
        sortOrder: 30,
        blocksEditing: false,
        triggersNotification: true,
        requiresApproval: true,
        status: 'active',
      },
      {
        id: 'mat_retired',
        scope: 'material',
        value: 'retired',
        name: 'Retired',
        color: '#6B7280',
        sortOrder: 40,
        blocksEditing: true,
        triggersNotification: false,
        requiresApproval: false,
        status: 'active',
      },
    ];
  }, [statusCatalog]);
  const existing = materialId
    ? materials.find((material) => material.id === materialId)
    : null;

  const [form, setForm] = useState({
    name: existing?.name || '',
    type: existing?.type || settings.materialTypes[0],
    identifier: existing?.identifier || '',
    sku: existing?.sku || '',
    brand: existing?.brand || '',
    price:
      existing?.price !== undefined && existing?.price !== null
        ? String(existing.price)
        : '',
    status: existing?.status || materialStatuses[0]?.value || 'available',
    notes: existing?.notes || '',
  });
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const price = form.price === '' ? 0 : Number(form.price);
    if (!Number.isFinite(price) || price < 0) {
      toast({
        title: 'Invalid price',
        description:
          'Price must be a valid number greater than or equal to zero.',
        variant: 'destructive',
      });
      return;
    }
    if (!form.type) {
      toast({
        title: 'Material type is required',
        description: 'Select a material type before saving.',
        variant: 'destructive',
      });
      return;
    }

    const payload: Partial<Material> = {
      ...form,
      name: form.name.trim(),
      identifier: form.identifier.trim(),
      sku: form.sku.trim(),
      status: form.status as Material['status'],
      brand: form.brand.trim(),
      notes: form.notes.trim(),
      price,
    };

    setSaving(true);
    try {
      if (materialId) {
        await updateMaterial(materialId, payload);
      } else {
        await addMaterial({
          id: `m_${crypto.randomUUID()}`,
          ...payload,
        } as Material);
      }
      toast({
        title: materialId ? 'Material updated' : 'Material created',
        description: `${payload.name} was saved successfully.`,
      });
      onClose();
    } catch (error) {
      toast({
        title: materialId
          ? 'Could not update material'
          : 'Could not create material',
        description:
          error instanceof Error
            ? error.message
            : 'Please review the material information and try again.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-2 sm:p-4">
      <div className="bg-white rounded-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="p-5 border-b border-gray-200 flex items-center justify-between flex-wrap gap-3">
          <h2 className="text-lg font-semibold">
            {materialId ? 'Edit Material' : 'Add Material'}
          </h2>
          <button onClick={onClose}>
            <X size={20} className="text-gray-400" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              ID (internal, read-only)
            </label>
            <input
              readOnly
              value={existing?.id || 'Automatically assigned when saved'}
              className="w-full border border-gray-200 bg-gray-50 rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              SKU
            </label>
            <input
              maxLength={120}
              value={form.sku}
              onChange={(event) =>
                setForm((current) => ({ ...current, sku: event.target.value }))
              }
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Name *
            </label>
            <input
              required
              value={form.name}
              onChange={(event) =>
                setForm((current) => ({ ...current, name: event.target.value }))
              }
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div className="responsive-grid grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Legacy reference *
              </label>
              <input
                required
                value={form.identifier}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    identifier: event.target.value,
                  }))
                }
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                placeholder="e.g., M-01"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Type *
              </label>
              <select
                value={form.type}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    type: event.target.value,
                  }))
                }
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              >
                {settings.materialTypes.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="responsive-grid grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Brand
              </label>
              <input
                value={form.brand}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    brand: event.target.value,
                  }))
                }
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Price
              </label>
              <input
                type="number"
                min={0}
                step="0.01"
                value={form.price}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    price: event.target.value,
                  }))
                }
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                placeholder="0.00"
              />
            </div>
          </div>
          <div className="responsive-grid grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Status
              </label>
              <select
                value={form.status}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    status: event.target.value as any,
                  }))
                }
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              >
                {materialStatuses.map((status) => (
                  <option key={status.id} value={status.value}>
                    {status.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Notes
              </label>
              <textarea
                value={form.notes}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    notes: event.target.value,
                  }))
                }
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                rows={1}
              />
            </div>
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
              disabled={saving}
              className="flex-1 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? 'Saving...' : materialId ? 'Save' : 'Add Material'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default MaterialsView;
