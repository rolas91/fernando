import DataPagination from '@/components/shared/DataPagination';
import { usePagedCatalog } from '@/hooks/use-paged-catalog';
import CatalogQueryState from '@/components/shared/CatalogQueryState';
import React, { useState, useMemo } from 'react';
import { useAppContext, AppContextOverride } from '@/contexts/AppContext';
import CatalogImportButton from '@/components/catalog-import/CatalogImportButton';
import type { Equipment, EquipmentStatus } from '@/lib/types';
import {
  Plus,
  Search,
  Download,
  Edit2,
  Trash2,
  Truck,
  Wrench,
  X,
} from 'lucide-react';

const EquipmentView: React.FC = () => {
  const { settings, statusCatalog } = useAppContext();
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const catalog = usePagedCatalog<Equipment>('equipment', {
    search,
    status: statusFilter,
    type: typeFilter,
  });
  const equipment = catalog.rows;
  const { updateEquipment, deleteEquipment } = catalog.overrides;
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const equipmentStatuses = useMemo(() => {
    const configured = statusCatalog
      .filter((item) => item.scope === 'equipment' && item.status === 'active')
      .sort(
        (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name),
      );
    if (configured.length > 0) return configured;
    return [
      {
        id: 'eq_available',
        scope: 'equipment',
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
        id: 'eq_assigned',
        scope: 'equipment',
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
        id: 'eq_maintenance',
        scope: 'equipment',
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
        id: 'eq_retired',
        scope: 'equipment',
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

  const equipmentStatusMap = useMemo(
    () => new Map(equipmentStatuses.map((item) => [item.value, item])),
    [equipmentStatuses],
  );

  const filtered = equipment;
  const statusCounts = catalog.meta?.statusCounts || {};

  const handleExport = async () => {
    const records = await catalog.exportAll();
    if (!records) return;
    const csv = [
      ['Identifier', 'Name', 'Type', 'Brand', 'Status'].join(','),
      ...records.map((e) =>
        [e.identifier, e.name, e.type, e.brand || '', e.status].join(','),
      ),
    ].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'equipment.csv';
    a.click();
  };

  const handleDelete = async (id: string, name: string) => {
    if (
      !window.confirm(
        `Delete equipment "${name}"? It will no longer appear in the catalog.`,
      )
    )
      return;
    try {
      await deleteEquipment(id);
    } catch (error) {
      catalog.reportError(error);
    }
  };

  return (
    <AppContextOverride value={catalog.overrides}>
      <div className="p-3 sm:p-6 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-lg font-semibold text-gray-800">
              Equipment & Assets
            </h2>
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
              scope="equipment"
              onDone={() => void catalog.refresh()}
            />
            <button
              disabled={catalog.query.isPending || Boolean(catalog.query.error)}
              onClick={() => setShowAddModal(true)}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 flex items-center gap-1"
            >
              <Plus size={14} /> Add Equipment
            </button>
          </div>
        </div>

        {}
        <div className="responsive-grid grid grid-cols-3 gap-4">
          {equipmentStatuses.slice(0, 3).map((status) => (
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
                  <Truck size={20} style={{ color: status.color }} />
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

        {}
        <div className="flex items-center gap-3 bg-white p-3 rounded-lg border border-gray-200 flex-wrap">
          <div className="flex items-center bg-gray-100 rounded px-3 py-1.5 basis-48 flex-1 max-w-sm">
            <Search size={14} className="text-gray-400 mr-2" />
            <input
              placeholder="Search equipment..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="bg-transparent text-sm outline-none w-full"
            />
          </div>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm bg-white"
          >
            <option value="">All Types</option>
            {settings.equipmentTypes.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm bg-white"
          >
            <option value="">All Status</option>
            {equipmentStatuses.map((status) => (
              <option key={status.id} value={status.value}>
                {status.name}
              </option>
            ))}
          </select>
        </div>

        {}
        <CatalogQueryState
          loading={catalog.query.isPending}
          refreshing={catalog.query.isFetching && !catalog.query.isPending}
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
                  <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-3">
                    ID
                  </th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-3">
                    Equipment
                  </th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-3">
                    Type
                  </th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-3">
                    Brand
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
                {filtered.map((e) => (
                  <tr
                    key={e.id}
                    className="border-b border-gray-50 hover:bg-gray-50"
                  >
                    <td className="px-4 py-3 text-sm font-mono text-primary">
                      {e.identifier}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div
                          className={`w-8 h-8 rounded flex items-center justify-center text-white text-xs font-bold ${''}`}
                          style={{
                            backgroundColor:
                              equipmentStatusMap.get(e.status)?.color ||
                              '#9CA3AF',
                          }}
                        >
                          {e.identifier.split('-')[0]}
                        </div>
                        <span className="text-sm font-medium text-gray-800">
                          {e.name}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {e.type}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {e.brand || '-'}
                    </td>
                    <td className="px-4 py-3">
                      <select
                        value={e.status}
                        onChange={(ev) =>
                          updateEquipment(e.id, {
                            status: ev.target.value as any,
                          })
                        }
                        className="text-xs px-2 py-1 rounded-full font-medium border-0 cursor-pointer text-white"
                        style={{
                          backgroundColor:
                            equipmentStatusMap.get(e.status)?.color ||
                            '#9CA3AF',
                        }}
                      >
                        {equipmentStatuses.map((status) => (
                          <option key={status.id} value={status.value}>
                            {status.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => setEditingId(e.id)}
                          className="p-1 hover:bg-gray-100 rounded"
                          aria-label={`Edit ${e.name}`}
                        >
                          <Edit2 size={14} className="text-gray-400" />
                        </button>
                        <button
                          onClick={() => void handleDelete(e.id, e.name)}
                          className="p-1 hover:bg-red-50 rounded"
                          aria-label={`Delete ${e.name}`}
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

        {}
        {(showAddModal || editingId) && (
          <EquipmentModal
            equipmentId={editingId}
            onClose={() => {
              setShowAddModal(false);
              setEditingId(null);
            }}
          />
        )}
        <DataPagination page={catalog.page} total={(catalog.meta)?.total} pageSize={catalog.pageSize} onPage={catalog.setPage} onPageSize={catalog.setPageSize} busy={catalog.query.isFetching} />
      </div>
    </AppContextOverride>
  );
};

const EquipmentModal: React.FC<{
  equipmentId: string | null;
  onClose: () => void;
}> = ({ equipmentId, onClose }) => {
  const { equipment, settings, statusCatalog, addEquipment, updateEquipment } =
    useAppContext();
  const equipmentStatuses = useMemo(() => {
    const configured = statusCatalog
      .filter((item) => item.scope === 'equipment' && item.status === 'active')
      .sort(
        (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name),
      );
    if (configured.length > 0) return configured;
    return [
      {
        id: 'eq_available',
        scope: 'equipment',
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
        id: 'eq_assigned',
        scope: 'equipment',
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
        id: 'eq_maintenance',
        scope: 'equipment',
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
        id: 'eq_retired',
        scope: 'equipment',
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
  const existing = equipmentId
    ? equipment.find((e) => e.id === equipmentId)
    : null;

  const [form, setForm] = useState({
    name: existing?.name || '',
    type: existing?.type || settings.equipmentTypes[0],
    identifier: existing?.identifier || '',
    brand: existing?.brand || '',
    status: existing?.status || equipmentStatuses[0]?.value || 'available',
    notes: existing?.notes || '',
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (equipmentId) {
      updateEquipment(equipmentId, {
        ...form,
        status: form.status as EquipmentStatus,
      });
    } else {
      addEquipment({ id: `e_${Date.now()}`, ...form } as any);
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-2 sm:p-4">
      <div className="bg-white rounded-xl w-full max-w-md">
        <div className="p-5 border-b border-gray-200 flex items-center justify-between flex-wrap gap-3">
          <h2 className="text-lg font-semibold">
            {equipmentId ? 'Edit Equipment' : 'Add Equipment'}
          </h2>
          <button onClick={onClose}>
            <X size={20} className="text-gray-400" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Name *
            </label>
            <input
              required
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div className="responsive-grid grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Identifier *
              </label>
              <input
                required
                value={form.identifier}
                onChange={(e) =>
                  setForm((f) => ({ ...f, identifier: e.target.value }))
                }
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                placeholder="e.g., 2-01"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Type *
              </label>
              <select
                value={form.type}
                onChange={(e) =>
                  setForm((f) => ({ ...f, type: e.target.value }))
                }
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              >
                {settings.equipmentTypes.map((t) => (
                  <option key={t} value={t}>
                    {t}
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
                onChange={(e) =>
                  setForm((f) => ({ ...f, brand: e.target.value }))
                }
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Status
              </label>
              <select
                value={form.status}
                onChange={(e) =>
                  setForm((f) => ({ ...f, status: e.target.value as any }))
                }
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              >
                {equipmentStatuses.map((status) => (
                  <option key={status.id} value={status.value}>
                    {status.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Notes
            </label>
            <textarea
              value={form.notes}
              onChange={(e) =>
                setForm((f) => ({ ...f, notes: e.target.value }))
              }
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              rows={2}
            />
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
              {equipmentId ? 'Save' : 'Add Equipment'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default EquipmentView;
