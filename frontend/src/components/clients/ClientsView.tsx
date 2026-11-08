import DataPagination from '@/components/shared/DataPagination';
import type { Client } from '@/lib/types';
import { usePagedCatalog } from '@/hooks/use-paged-catalog';
import CatalogQueryState from '@/components/shared/CatalogQueryState';
import React, { useState } from 'react';
import { useAppContext, AppContextOverride } from '@/contexts/AppContext';
import { DEFAULT_ASSIGNMENT_COUNTRY } from '@/lib/googlePlaceAddress';
import PlacesStructuredAddressField from '@/components/shared/PlacesStructuredAddressField';
import CatalogImportButton from '@/components/catalog-import/CatalogImportButton';
import {
  Plus,
  Search,
  Edit2,
  Archive,
  Building2,
  Phone,
  Mail,
  MapPin,
  Globe,
  X,
} from 'lucide-react';

const ClientsView: React.FC = () => {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('active');
  const catalog = usePagedCatalog<Client>('clients', {
    search,
    status: statusFilter,
  });
  const clients = catalog.rows;
  const { updateClient } = catalog.overrides;
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const filtered = clients;

  return (
    <AppContextOverride value={catalog.overrides}>
      <div className="p-3 sm:p-6 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-lg font-semibold text-gray-800">
              Client Management
            </h2>
            <p className="text-sm text-gray-500">
              {catalog.meta?.statusCounts?.active ?? '—'} active clients
            </p>
          </div>
          <div className="flex items-center gap-2">
            <CatalogImportButton
              scope="clients"
              onDone={() => void catalog.refresh()}
            />
            <button
              onClick={() => {
                if (!catalog.query.data) return;
                setEditingId(null);
                setShowModal(true);
              }}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 flex items-center gap-1"
            >
              <Plus size={14} /> Add Client
            </button>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center bg-white border border-gray-200 rounded-lg px-3 py-1.5 basis-48 flex-1 max-w-sm">
            <Search size={14} className="text-gray-400 mr-2" />
            <input
              placeholder="Search clients..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="bg-transparent text-sm outline-none w-full"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm bg-white"
          >
            <option value="active">Active</option>
            <option value="archived">Archived</option>
            <option value="">All</option>
          </select>
        </div>

        <CatalogQueryState
          loading={catalog.query.isPending}
          error={catalog.query.error}
          retry={() => void catalog.query.refetch()}
        />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((c) => {
            const projectCount = Number(catalog.projectCounts[c.id]) || 0;
            return (
              <div
                key={c.id}
                className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                    <Building2 size={20} className="text-primary" />
                  </div>
                  <div className="flex gap-1">
                    <button
                      onClick={() => {
                        setEditingId(c.id);
                        setShowModal(true);
                      }}
                      className="p-1 hover:bg-gray-100 rounded"
                    >
                      <Edit2 size={14} className="text-gray-400" />
                    </button>
                    <button
                      onClick={() =>
                        updateClient(c.id, {
                          status:
                            c.status === 'archived' ? 'active' : 'archived',
                        }).catch(catalog.reportError)
                      }
                      className="p-1 hover:bg-gray-100 rounded"
                    >
                      <Archive size={14} className="text-gray-400" />
                    </button>
                  </div>
                </div>
                <h3 className="font-semibold text-gray-800 mb-1">{c.name}</h3>
                <p className="text-sm text-gray-500 mb-3">{c.contactName}</p>
                <div className="space-y-1.5 text-xs text-gray-500 [overflow-wrap:anywhere] [&_svg]:shrink-0">
                  <div className="flex items-center gap-1.5">
                    <Mail size={12} /> {c.email}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Phone size={12} /> {c.phone}
                  </div>
                  {c.website ? (
                    <div className="flex items-center gap-1.5">
                      <Globe size={12} />
                      <a
                        href={c.website}
                        target="_blank"
                        rel="noreferrer"
                        className="text-blue-600 hover:underline truncate"
                      >
                        {c.website}
                      </a>
                    </div>
                  ) : null}
                  <div className="flex items-center gap-1.5">
                    <MapPin size={12} /> {c.address}
                  </div>
                </div>
                <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between flex-wrap gap-3">
                  <span className="text-xs text-gray-500">
                    {projectCount} project
                    {projectCount !== 1 ? 's' : ''}
                  </span>
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full font-medium ${c.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}
                  >
                    {c.status}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {showModal && (
          <ClientModal
            clientId={editingId}
            onClose={() => {
              setShowModal(false);
              setEditingId(null);
            }}
          />
        )}
        <DataPagination page={catalog.page} total={(catalog.meta)?.total} pageSize={catalog.pageSize} onPage={catalog.setPage} onPageSize={catalog.setPageSize} busy={catalog.query.isFetching} />
      </div>
    </AppContextOverride>
  );
};

const ClientModal: React.FC<{
  clientId: string | null;
  onClose: () => void;
}> = ({ clientId, onClose }) => {
  const { clients, addClient, updateClient } = useAppContext();
  const existing = clientId ? clients.find((c) => c.id === clientId) : null;
  const [error, setError] = useState('');

  const [form, setForm] = useState({
    name: existing?.name || '',
    contactName: existing?.contactName || '',
    email: existing?.email || '',
    phone: existing?.phone || '',
    website: existing?.website || '',
    address: existing?.address || '',
    city: existing?.city || '',
    state: existing?.state || '',
    zipCode: existing?.zipCode || '',
    country: existing?.country || DEFAULT_ASSIGNMENT_COUNTRY,
    latitude:
      existing?.latitude !== undefined && existing?.latitude !== null
        ? Number(existing.latitude)
        : null,
    longitude:
      existing?.longitude !== undefined && existing?.longitude !== null
        ? Number(existing.longitude)
        : null,
    notes: existing?.notes || '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      if (clientId) {
        await updateClient(clientId, form);
      } else {
        await addClient({ id: `cl_${Date.now()}`, ...form, status: 'active' });
      }
      onClose();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to save client to server';
      setError(message);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-2 sm:p-4">
      <div className="bg-white rounded-xl w-full max-w-xl">
        <div className="p-5 border-b border-gray-200 flex items-center justify-between flex-wrap gap-3">
          <h2 className="text-lg font-semibold">
            {clientId ? 'Edit Client' : 'Add Client'}
          </h2>
          <button onClick={onClose}>
            <X size={20} className="text-gray-400" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error ? (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          ) : null}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Company Name *
            </label>
            <input
              required
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Contact Name *
            </label>
            <input
              required
              value={form.contactName}
              onChange={(e) =>
                setForm((f) => ({ ...f, contactName: e.target.value }))
              }
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div className="responsive-grid grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Email *
              </label>
              <input
                type="email"
                required
                value={form.email}
                onChange={(e) =>
                  setForm((f) => ({ ...f, email: e.target.value }))
                }
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Phone *
              </label>
              <input
                required
                value={form.phone}
                onChange={(e) =>
                  setForm((f) => ({ ...f, phone: e.target.value }))
                }
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Website
            </label>
            <input
              type="url"
              value={form.website}
              onChange={(e) =>
                setForm((f) => ({ ...f, website: e.target.value }))
              }
              placeholder="https://example.com"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <PlacesStructuredAddressField
            id={`client-address-${clientId ?? 'new'}`}
            label="Address"
            value={{
              addressLine: form.address,
              latitude: form.latitude ?? null,
              longitude: form.longitude ?? null,
              city: form.city,
              state: form.state,
              zipCode: form.zipCode,
              country: form.country || DEFAULT_ASSIGNMENT_COUNTRY,
            }}
            onChange={(next) =>
              setForm((f) => ({
                ...f,
                address: next.addressLine,
                latitude: next.latitude,
                longitude: next.longitude,
                city: next.city,
                state: next.state,
                zipCode: next.zipCode,
                country: next.country || DEFAULT_ASSIGNMENT_COUNTRY,
              }))
            }
          />
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
              {clientId ? 'Save' : 'Add Client'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ClientsView;
