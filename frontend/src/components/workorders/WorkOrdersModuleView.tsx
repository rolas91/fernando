import React, { useEffect, useMemo, useState } from 'react';
import { useAppContext } from '@/contexts/AppContext';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import {
  CommercialCatalogItem,
  CommercialWorkOrder,
  CommercialWorkOrderItem,
  CommercialWorkOrderType,
} from '@/lib/types';
import { dbFetchCommercialWorkOrderPdf } from '@/lib/db';
import {
  ArrowLeft,
  Calendar,
  ChevronRight,
  Download,
  Eye,
  FileText,
  Filter,
  Package,
  Pencil,
  Plus,
  Printer,
  RefreshCcw,
  Save,
  ShoppingCart,
  Trash2,
  Undo2,
} from 'lucide-react';

type Screen =
  | { name: 'list' }
  | { name: 'new' }
  | {
      name: 'form';
      type: CommercialWorkOrderType;
      editing?: CommercialWorkOrder;
    }
  | { name: 'detail'; id: string }
  | { name: 'pdf'; id: string }
  | { name: 'offRent'; id?: string }
  | { name: 'offRentResult'; originalId: string; rolloverId?: string | null };

type Draft = {
  type: CommercialWorkOrderType;
  workOrderNumber?: string;
  jobNumber: string;
  jobName: string;
  projectId: string;
  customerId: string;
  customerName: string;
  contact: string;
  phone: string;
  email: string;
  customerOrderNumber: string;
  descriptionOfWork: string;
  workDate: string;
  onRentDate: string;
  previousBillingDate: string;
  nextInvoiceDate: string;
  notes: string;
  items: CommercialWorkOrderItem[];
};

const todayIso = () => new Date().toISOString().slice(0, 10);
const addDays = (date: string, days: number) => {
  const parsed = new Date(`${date}T00:00:00`);
  parsed.setDate(parsed.getDate() + days);
  return parsed.toISOString().slice(0, 10);
};
const money = (value: number) => `$${value.toFixed(2)}`;
const numberValue = (value: unknown) => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

const emptyLine = (
  type: CommercialWorkOrderType,
  onRentDate = todayIso(),
): CommercialWorkOrderItem => ({
  id: `local_${crypto.randomUUID()}`,
  sku: '',
  description: '',
  qty: type === 'sale' ? 1 : undefined,
  price: type === 'sale' ? 0 : undefined,
  onRentQty: type === 'on_rent' ? 1 : undefined,
  onRentDate: type === 'on_rent' ? onRentDate : undefined,
  notes: '',
});

const statusLabel: Record<string, string> = {
  draft: 'Draft',
  sale_completed: 'Sale Completed',
  on_rent: 'On Rent',
  closed: 'Closed',
};

const typeLabel: Record<CommercialWorkOrderType, string> = {
  sale: 'Sale',
  on_rent: 'On Rent',
};

const statusClass = (status: string) => {
  if (status === 'on_rent')
    return 'bg-green-100 text-green-700 border-green-200';
  if (status === 'sale_completed')
    return 'bg-emerald-100 text-emerald-700 border-emerald-200';
  if (status === 'closed') return 'bg-gray-100 text-gray-700 border-gray-200';
  return 'bg-amber-100 text-amber-700 border-amber-200';
};

const WorkOrdersModuleView: React.FC = () => {
  const {
    commercialWorkOrders,
    commercialCatalogItems,
    clients,
    projects,
    addCommercialWorkOrder,
    updateCommercialWorkOrder,
    processCommercialWorkOrderOffRent,
  } = useAppContext();
  const { user } = useAuth();
  const { toast } = useToast();
  const [screen, setScreen] = useState<Screen>({ name: 'list' });
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [customerFilter, setCustomerFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [pdfUrl, setPdfUrl] = useState('');

  const selected =
    'id' in screen
      ? commercialWorkOrders.find((item) => item.id === screen.id)
      : undefined;
  const catalog = useMemo(
    () => commercialCatalogItems.filter((item) => item.status !== 'inactive'),
    [commercialCatalogItems],
  );
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return commercialWorkOrders.filter((item) => {
      if (statusFilter !== 'all' && item.status !== statusFilter) return false;
      if (typeFilter !== 'all' && item.type !== typeFilter) return false;
      if (customerFilter !== 'all' && item.customerId !== customerFilter)
        return false;
      if (!term) return true;
      return [
        item.workOrderNumber,
        item.jobName,
        item.jobNumber,
        item.customerName,
      ]
        .join(' ')
        .toLowerCase()
        .includes(term);
    });
  }, [commercialWorkOrders, customerFilter, search, statusFilter, typeFilter]);

  const openPdf = async (id: string) => {
    if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    setPdfUrl('');
    setScreen({ name: 'pdf', id });
    try {
      const blob = await dbFetchCommercialWorkOrderPdf(id);
      setPdfUrl(URL.createObjectURL(blob));
    } catch (error) {
      toast({
        title: 'PDF preview failed',
        description:
          error instanceof Error
            ? error.message
            : 'Unable to load PDF preview.',
        variant: 'destructive',
      });
    }
  };

  const downloadPdf = async (workOrder: CommercialWorkOrder) => {
    const blob = await dbFetchCommercialWorkOrderPdf(workOrder.id);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${workOrder.workOrderNumber}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const printPdf = async (workOrder: CommercialWorkOrder) => {
    const blob = await dbFetchCommercialWorkOrderPdf(workOrder.id);
    const url = URL.createObjectURL(blob);
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    iframe.src = url;
    iframe.onload = () => {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
      window.setTimeout(() => {
        URL.revokeObjectURL(url);
        iframe.remove();
      }, 1000);
    };
    document.body.appendChild(iframe);
  };

  useEffect(
    () => () => {
      if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    },
    [pdfUrl],
  );

  if (screen.name === 'new') {
    return (
      <NewWorkOrderScreen
        onBack={() => setScreen({ name: 'list' })}
        onSelect={(type) => setScreen({ name: 'form', type })}
        onOffRent={() => setScreen({ name: 'offRent' })}
      />
    );
  }

  if (screen.name === 'form') {
    return (
      <WorkOrderForm
        type={screen.type}
        editing={screen.editing}
        catalog={catalog}
        clients={clients}
        projects={projects}
        createdBy={user ? `${user.firstName} ${user.lastName}` : ''}
        isSaving={isSaving}
        onCancel={() =>
          setScreen(
            screen.editing
              ? { name: 'detail', id: screen.editing.id }
              : { name: 'list' },
          )
        }
        onSave={async (draft) => {
          setIsSaving(true);
          try {
            const saved = screen.editing
              ? await updateCommercialWorkOrder(screen.editing.id, draft)
              : await addCommercialWorkOrder(draft);
            toast({
              title: 'Work order saved',
              description: 'The document was generated.',
            });
            if (saved) setScreen({ name: 'detail', id: saved.id });
          } catch (error) {
            toast({
              title: 'Could not save work order',
              description:
                error instanceof Error
                  ? error.message
                  : 'Please review the form.',
              variant: 'destructive',
            });
          } finally {
            setIsSaving(false);
          }
        }}
      />
    );
  }

  if (screen.name === 'detail' && selected) {
    return (
      <DetailScreen
        workOrder={selected}
        onBack={() => setScreen({ name: 'list' })}
        onEdit={() =>
          setScreen({ name: 'form', type: selected.type, editing: selected })
        }
        onPdf={() => void openPdf(selected.id)}
        onOffRent={() => setScreen({ name: 'offRent', id: selected.id })}
      />
    );
  }

  if (screen.name === 'pdf' && selected) {
    return (
      <PdfPreview
        workOrder={selected}
        pdfUrl={pdfUrl}
        onBack={() => setScreen({ name: 'detail', id: selected.id })}
        onDownload={() => void downloadPdf(selected)}
        onPrint={() => void printPdf(selected)}
      />
    );
  }

  if (screen.name === 'offRent') {
    return (
      <OffRentScreen
        selectedId={screen.id}
        workOrders={commercialWorkOrders.filter(
          (item) => item.type === 'on_rent' && item.status === 'on_rent',
        )}
        isSaving={isSaving}
        onCancel={() =>
          setScreen(
            screen.id ? { name: 'detail', id: screen.id } : { name: 'list' },
          )
        }
        onSubmit={async (id, payload) => {
          setIsSaving(true);
          try {
            const result = await processCommercialWorkOrderOffRent(id, payload);
            toast({
              title: 'Off rent processed',
              description: 'Quantities were updated successfully.',
            });
            setScreen({
              name: 'offRentResult',
              originalId: result?.original.id || id,
              rolloverId: result?.rollover?.id || null,
            });
          } catch (error) {
            toast({
              title: 'Could not process off rent',
              description:
                error instanceof Error
                  ? error.message
                  : 'Please review returned quantities.',
              variant: 'destructive',
            });
          } finally {
            setIsSaving(false);
          }
        }}
      />
    );
  }

  if (screen.name === 'offRentResult') {
    const original = commercialWorkOrders.find(
      (item) => item.id === screen.originalId,
    );
    const rollover = commercialWorkOrders.find(
      (item) => item.id === screen.rolloverId,
    );
    return (
      <OffRentResult
        original={original}
        rollover={rollover}
        onBack={() => setScreen({ name: 'list' })}
        onOpen={(id) => setScreen({ name: 'detail', id })}
      />
    );
  }

  return (
    <div className="p-3 sm:p-6 space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Work Orders</h2>
          <p className="mt-2 text-sm text-gray-500">
            View and manage sale and rental work orders.
          </p>
        </div>
        <button
          onClick={() => setScreen({ name: 'new' })}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-primary/90"
        >
          <Plus size={18} /> New Work Order
        </button>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <div className="grid gap-4 lg:grid-cols-[160px_160px_190px_1fr_auto]">
          <FilterSelect
            label="Status"
            value={statusFilter}
            onChange={setStatusFilter}
            options={[
              ['all', 'All Statuses'],
              ['draft', 'Draft'],
              ['sale_completed', 'Sale Completed'],
              ['on_rent', 'On Rent'],
              ['closed', 'Closed'],
            ]}
          />
          <FilterSelect
            label="Type"
            value={typeFilter}
            onChange={setTypeFilter}
            options={[
              ['all', 'All Types'],
              ['sale', 'Sale'],
              ['on_rent', 'On Rent'],
            ]}
          />
          <FilterSelect
            label="Customer"
            value={customerFilter}
            onChange={setCustomerFilter}
            options={[
              ['all', 'All Customers'],
              ...clients.map(
                (client) => [client.id, client.name] as [string, string],
              ),
            ]}
          />
          <label className="block">
            <span className="mb-2 block text-xs font-semibold text-gray-600">
              Search
            </span>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by Work Order #, Project / Job # or Customer"
              className="h-10 w-full rounded-md border border-gray-300 px-3 text-sm outline-none focus:border-primary"
            />
          </label>
          <div className="flex items-end">
            <button
              onClick={() => {
                setStatusFilter('all');
                setTypeFilter('all');
                setCustomerFilter('all');
                setSearch('');
              }}
              className="inline-flex h-10 items-center gap-2 rounded-md border border-primary px-4 text-sm font-semibold text-primary"
            >
              <Filter size={16} /> Filters
            </button>
          </div>
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
                <th className="px-4 py-3">Work Order #</th>
                <th className="px-4 py-3">Client</th>
                <th className="px-4 py-3">Project</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Created Date</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((item) => (
                <tr key={item.id} className="hover:bg-gray-50">
                  <td className="px-4 py-4 font-semibold text-primary">
                    {item.workOrderNumber}
                  </td>
                  <td className="px-4 py-4">{item.customerName}</td>
                  <td className="px-4 py-4">{item.jobName}</td>
                  <td className="px-4 py-4">
                    <Badge>{typeLabel[item.type]}</Badge>
                  </td>
                  <td className="px-4 py-4">
                    <span
                      className={`rounded border px-2 py-1 text-xs font-semibold ${statusClass(item.status)}`}
                    >
                      {statusLabel[item.status] || item.status}
                    </span>
                  </td>
                  <td className="px-4 py-4">
                    {formatDate(item.createdAt || item.workDate || '')}
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex justify-end gap-2">
                      <IconButton
                        label="View"
                        onClick={() =>
                          setScreen({ name: 'detail', id: item.id })
                        }
                      >
                        <Eye size={16} />
                      </IconButton>
                      <IconButton
                        label="Edit"
                        onClick={() =>
                          setScreen({
                            name: 'form',
                            type: item.type,
                            editing: item,
                          })
                        }
                      >
                        <Pencil size={16} />
                      </IconButton>
                      <IconButton
                        label="PDF"
                        onClick={() => void openPdf(item.id)}
                      >
                        <FileText size={16} />
                      </IconButton>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td
                    colSpan={7}
                    className="px-4 py-10 text-center text-gray-500"
                  >
                    No work orders found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

const FilterSelect: React.FC<{
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<[string, string]>;
}> = ({ label, value, onChange, options }) => (
  <label className="block">
    <span className="mb-2 block text-xs font-semibold text-gray-600">
      {label}
    </span>
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="h-10 w-full rounded-md border border-gray-300 bg-white px-3 text-sm outline-none focus:border-primary"
    >
      {options.map(([id, name]) => (
        <option key={id} value={id}>
          {name}
        </option>
      ))}
    </select>
  </label>
);

const IconButton: React.FC<{
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}> = ({ label, onClick, children }) => (
  <button
    type="button"
    onClick={onClick}
    title={label}
    className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-gray-200 text-gray-600 hover:border-primary hover:text-primary"
  >
    {children}
  </button>
);

const Badge: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span className="rounded border border-blue-200 bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-700">
    {children}
  </span>
);

const NewWorkOrderScreen: React.FC<{
  onBack: () => void;
  onSelect: (type: CommercialWorkOrderType) => void;
  onOffRent: () => void;
}> = ({ onBack, onSelect, onOffRent }) => (
  <div className="p-3 sm:p-6 space-y-7">
    <Breadcrumb parts={['Work Orders', 'New Work Order']} />
    <div>
      <h2 className="text-2xl font-bold text-gray-900">New Work Order</h2>
      <p className="mt-2 text-sm text-gray-500">
        Select the type of work order you want to create.
      </p>
    </div>
    <div className="rounded-lg border border-gray-200 bg-white p-7">
      <h3 className="mb-6 font-bold text-gray-900">Choose Work Order Type</h3>
      <div className="grid gap-5 md:grid-cols-3">
        <TypeCard
          title="Sale"
          tone="green"
          icon={<ShoppingCart size={38} />}
          onClick={() => onSelect('sale')}
          description="Create a work order for items that are sold."
          button="Create Sale Work Order"
        />
        <TypeCard
          title="On Rent"
          tone="blue"
          icon={<Calendar size={38} />}
          onClick={() => onSelect('on_rent')}
          description="Create a work order for items rented to a customer."
          button="Create On Rent Work Order"
        />
        <TypeCard
          title="Off Rent (Return)"
          tone="orange"
          icon={<Undo2 size={38} />}
          onClick={onOffRent}
          description="Process the return of rented items from an existing work order."
          button="Process Off Rent"
        />
      </div>
    </div>
    <button
      onClick={onBack}
      className="rounded-md border border-gray-300 bg-white px-5 py-2.5 text-sm font-semibold text-gray-700"
    >
      Cancel
    </button>
  </div>
);

const TypeCard: React.FC<{
  title: string;
  description: string;
  button: string;
  icon: React.ReactNode;
  tone: 'green' | 'blue' | 'orange';
  disabled?: boolean;
  onClick: () => void;
}> = ({ title, description, button, icon, tone, disabled, onClick }) => {
  const colors =
    tone === 'green'
      ? 'text-green-700 bg-green-50 border-green-600'
      : tone === 'orange'
        ? 'text-orange-600 bg-orange-50 border-orange-500'
        : 'text-primary bg-blue-50 border-primary';
  return (
    <div className="rounded-lg border border-gray-200 p-8 text-center">
      <div
        className={`mx-auto flex h-20 w-20 items-center justify-center rounded-full ${colors.split(' ')[1]} ${colors.split(' ')[0]}`}
      >
        {icon}
      </div>
      <h4 className={`mt-5 text-lg font-bold ${colors.split(' ')[0]}`}>
        {title}
      </h4>
      <p className="mx-auto mt-5 max-w-52 text-sm leading-6 text-gray-500">
        {description}
      </p>
      <button
        disabled={disabled}
        onClick={onClick}
        className={`mt-7 inline-flex items-center gap-2 rounded-md border px-5 py-2.5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50 ${colors}`}
      >
        {button} <ChevronRight size={16} />
      </button>
    </div>
  );
};

const ReadonlyTableCell: React.FC<{ value: React.ReactNode }> = ({ value }) => (
  <td className="px-3 py-2 text-center">
    <span className="inline-flex h-9 min-w-24 items-center justify-center rounded-md border border-gray-200 bg-gray-50 px-3 text-sm font-semibold text-gray-400">
      {value}
    </span>
  </td>
);

const Breadcrumb: React.FC<{ parts: string[] }> = ({ parts }) => (
  <div className="flex items-center gap-2 text-sm font-semibold text-primary">
    {parts.map((part, index) => (
      <React.Fragment key={part}>
        {index > 0 && <ChevronRight size={15} className="text-gray-400" />}
        <span className={index === parts.length - 1 ? 'text-gray-900' : ''}>
          {part}
        </span>
      </React.Fragment>
    ))}
  </div>
);

const WorkOrderForm: React.FC<{
  type: CommercialWorkOrderType;
  editing?: CommercialWorkOrder;
  clients: ReturnType<typeof useAppContext>['clients'];
  projects: ReturnType<typeof useAppContext>['projects'];
  catalog: CommercialCatalogItem[];
  createdBy: string;
  isSaving: boolean;
  onCancel: () => void;
  onSave: (draft: Draft) => Promise<void>;
}> = ({
  type,
  editing,
  clients,
  projects,
  catalog,
  createdBy,
  isSaving,
  onCancel,
  onSave,
}) => {
  const [draft, setDraft] = useState<Draft>(() => {
    const baseDate = editing?.workDate || editing?.onRentDate || todayIso();
    return {
      type,
      workOrderNumber: editing?.workOrderNumber,
      jobNumber: editing?.jobNumber || '',
      jobName: editing?.jobName || '',
      projectId: editing?.projectId || '',
      customerId: editing?.customerId || '',
      customerName: editing?.customerName || '',
      contact: editing?.contact || '',
      phone: editing?.phone || '',
      email: editing?.email || '',
      customerOrderNumber: editing?.customerOrderNumber || '',
      descriptionOfWork: editing?.descriptionOfWork || '',
      workDate: baseDate,
      onRentDate: editing?.onRentDate || baseDate,
      previousBillingDate: editing?.previousBillingDate || '',
      nextInvoiceDate: editing?.nextInvoiceDate || addDays(baseDate, 28),
      notes: editing?.notes || '',
      items: editing?.items?.length
        ? editing.items
        : [emptyLine(type, baseDate)],
    };
  });
  const total = draft.items.reduce(
    (sum, item) => sum + numberValue(item.qty) * numberValue(item.price),
    0,
  );

  const update = (key: keyof Draft, value: string) => {
    setDraft((current) => {
      if (key === 'customerId') {
        const client = clients.find((item) => item.id === value);
        return {
          ...current,
          customerId: value,
          customerName: client?.name || '',
          contact: client?.contactName || '',
          phone: client?.phone || '',
          email: client?.email || '',
        };
      }
      if (key === 'projectId') {
        const project = projects.find((item) => item.id === value);
        return {
          ...current,
          projectId: value,
          jobNumber: project?.number || current.jobNumber,
          jobName: project?.name || current.jobName,
          customerOrderNumber:
            project?.purchaseOrder || current.customerOrderNumber,
          descriptionOfWork: project?.description || current.descriptionOfWork,
        };
      }
      if (key === 'onRentDate')
        return {
          ...current,
          onRentDate: value,
          nextInvoiceDate: addDays(value, 28),
          items: current.items.map((item) => ({ ...item, onRentDate: value })),
        };
      return { ...current, [key]: value };
    });
  };
  const updateLine = (
    id: string,
    key: keyof CommercialWorkOrderItem,
    value: string | number,
  ) => {
    setDraft((current) => ({
      ...current,
      items: current.items.map((item) =>
        item.id === id ? { ...item, [key]: value } : item,
      ),
    }));
  };
  const selectCatalog = (lineId: string, value: string) => {
    const selected = catalog.find((item) => item.id === value);
    if (!selected) return;
    setDraft((current) => ({
      ...current,
      items: current.items.map((item) =>
        item.id === lineId
          ? {
              ...item,
              catalogItemId: selected.id,
              catalogSource: 'commercial',
              sku: selected.sku,
              description: selected.description,
              dailyRate: numberValue(selected.dailyRate),
              unit: selected.unit || 'Each',
              price:
                type === 'sale' ? numberValue(selected.itemPrice) : item.price,
            }
          : item,
      ),
    }));
  };

  return (
    <div className="p-3 sm:p-6 space-y-5">
      <Breadcrumb
        parts={[
          'Work Orders',
          editing ? editing.workOrderNumber : 'New Work Order',
          type === 'sale' ? 'Sale' : 'On Rent',
        ]}
      />
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">
            {type === 'sale' ? 'Sale Work Order' : 'On Rent Work Order'}
          </h2>
          <p className="mt-2 text-sm text-gray-500">
            {type === 'sale'
              ? 'Create a work order for items that are sold.'
              : 'Create a work order for items rented to a customer.'}
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="rounded-md border border-gray-300 bg-white px-5 py-2.5 text-sm font-semibold text-gray-700"
          >
            Cancel
          </button>
          <button
            disabled={isSaving}
            onClick={() => void onSave({ ...draft, createdBy } as Draft)}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
          >
            <Save size={16} /> {isSaving ? 'Saving...' : 'Save & Generate PDF'}
          </button>
        </div>
      </div>

      <Section title="General Information">
        <div className="grid gap-4 md:grid-cols-4">
          <Input
            label="Work Order #"
            value={draft.workOrderNumber || 'Auto'}
            disabled
            onChange={() => {}}
          />
          <Input
            label="Job #"
            value={draft.jobNumber}
            onChange={(value) => update('jobNumber', value)}
          />
          <Select
            label="Project"
            value={draft.projectId}
            onChange={(value) => update('projectId', value)}
            options={[
              ['', 'Select project'],
              ...projects.map(
                (project) =>
                  [project.id, `${project.number} - ${project.name}`] as [
                    string,
                    string,
                  ],
              ),
            ]}
          />
          <Input
            label="Date"
            type="date"
            value={draft.workDate}
            onChange={(value) => update('workDate', value)}
          />
          <Input
            label="Job Name *"
            value={draft.jobName}
            onChange={(value) => update('jobName', value)}
          />
          <Input
            label="Customer Order #"
            value={draft.customerOrderNumber}
            onChange={(value) => update('customerOrderNumber', value)}
          />
          <Select
            label="Client *"
            value={draft.customerId}
            onChange={(value) => update('customerId', value)}
            options={[
              ['', 'Select client'],
              ...clients.map(
                (client) => [client.id, client.name] as [string, string],
              ),
            ]}
          />
          <Input
            label="Contact"
            value={draft.contact}
            onChange={(value) => update('contact', value)}
          />
          <Input
            label="Phone"
            value={draft.phone}
            onChange={(value) => update('phone', value)}
          />
          <Input
            label="Email"
            value={draft.email}
            onChange={(value) => update('email', value)}
          />
          <label className="md:col-span-4">
            <span className="mb-2 block text-xs font-semibold text-gray-700">
              Description of Work
            </span>
            <textarea
              value={draft.descriptionOfWork}
              onChange={(event) =>
                update('descriptionOfWork', event.target.value)
              }
              rows={3}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-primary"
            />
          </label>
        </div>
      </Section>

      {type === 'on_rent' && (
        <Section title="Rental & Billing Information">
          <div className="grid gap-4 md:grid-cols-4">
            <Input
              label="On Rent Date *"
              type="date"
              value={draft.onRentDate}
              onChange={(value) => update('onRentDate', value)}
            />
            <Input
              label="Previous Billing Date"
              type="date"
              value={draft.previousBillingDate}
              onChange={(value) => update('previousBillingDate', value)}
            />
            <Input
              label="Next Invoice Date *"
              type="date"
              value={draft.nextInvoiceDate}
              onChange={(value) => update('nextInvoiceDate', value)}
            />
            <div className="rounded-md border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700">
              Invoices are generated every 28 days. Next Invoice Date is
              automatically calculated.
            </div>
          </div>
        </Section>
      )}

      <Section title={type === 'sale' ? 'Material' : 'Material & Equipment'}>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-xs font-semibold uppercase text-gray-500">
              {type === 'sale' ? (
                <tr>
                  <th className="px-3 py-3 text-left">Item #</th>
                  <th className="px-3 py-3 text-left">SKU</th>
                  <th className="px-3 py-3 text-left">Description</th>
                  <th className="px-3 py-3">Qty</th>
                  <th className="px-3 py-3">Price</th>
                  <th className="px-3 py-3">Amount</th>
                  <th className="px-3 py-3">Action</th>
                </tr>
              ) : (
                <tr>
                  <th className="px-3 py-3 text-left">Item #</th>
                  <th className="px-3 py-3 text-left">SKU</th>
                  <th className="px-3 py-3 text-left">Description</th>
                  <th className="px-3 py-3">On Rent Qty</th>
                  <th className="px-3 py-3">On Rent Date</th>
                  <th className="px-3 py-3">Off Rent Date</th>
                  <th className="px-3 py-3">
                    Rental Duration
                    <br />
                    (Days)
                  </th>
                  <th className="px-3 py-3">Off Rent Qty</th>
                  <th className="px-3 py-3">Remaining Qty</th>
                  <th className="px-3 py-3">Loss Qty</th>
                  <th className="px-3 py-3">Action</th>
                </tr>
              )}
            </thead>
            <tbody>
              {draft.items.map((line, index) => (
                <tr key={line.id} className="border-b border-gray-100">
                  <td className="px-3 py-2">{index + 1}</td>
                  <td className="px-3 py-2">
                    <select
                      value={line.catalogItemId || ''}
                      onChange={(event) =>
                        selectCatalog(line.id, event.target.value)
                      }
                      className="h-9 w-40 rounded-md border border-gray-300 bg-white px-2"
                    >
                      <option value="">Select...</option>
                      {catalog.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.sku}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-2">
                    <input
                      value={line.description}
                      onChange={(event) =>
                        updateLine(line.id, 'description', event.target.value)
                      }
                      className="h-9 w-full min-w-52 rounded-md border border-gray-300 px-2"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      min={0}
                      value={
                        type === 'sale' ? line.qty || 0 : line.onRentQty || 0
                      }
                      onChange={(event) =>
                        updateLine(
                          line.id,
                          type === 'sale' ? 'qty' : 'onRentQty',
                          Number(event.target.value),
                        )
                      }
                      className="h-9 w-24 rounded-md border border-gray-300 px-2 text-center"
                    />
                  </td>
                  {type === 'sale' ? (
                    <>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          value={line.price || 0}
                          onChange={(event) =>
                            updateLine(
                              line.id,
                              'price',
                              Number(event.target.value),
                            )
                          }
                          className="h-9 w-24 rounded-md border border-gray-300 px-2 text-center"
                        />
                      </td>
                      <td className="px-3 py-2 text-center font-semibold">
                        {money(numberValue(line.qty) * numberValue(line.price))}
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="px-3 py-2">
                        <input
                          type="date"
                          value={line.onRentDate || draft.onRentDate}
                          onChange={(event) =>
                            updateLine(
                              line.id,
                              'onRentDate',
                              event.target.value,
                            )
                          }
                          className="h-9 w-36 rounded-md border border-gray-300 px-2 text-center"
                        />
                      </td>
                      <ReadonlyTableCell value={line.offRentDate || '-'} />
                      <ReadonlyTableCell
                        value={line.rentalDurationDays ?? '-'}
                      />
                      <ReadonlyTableCell value={line.offRentQty ?? '-'} />
                      <ReadonlyTableCell value={line.remainingQty ?? '-'} />
                      <ReadonlyTableCell value={line.lossQty ?? '-'} />
                    </>
                  )}
                  <td className="px-3 py-2 text-center">
                    <button
                      onClick={() =>
                        setDraft((current) => ({
                          ...current,
                          items: current.items.filter(
                            (item) => item.id !== line.id,
                          ),
                        }))
                      }
                      className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-red-200 text-red-600"
                    >
                      <Trash2 size={15} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-3 flex items-center justify-between flex-wrap gap-3">
          <button
            onClick={() =>
              setDraft((current) => ({
                ...current,
                items: [...current.items, emptyLine(type, current.onRentDate)],
              }))
            }
            className="inline-flex items-center gap-2 rounded-md border border-primary px-3 py-2 text-sm font-semibold text-primary"
          >
            <Plus size={16} /> Add Material / Equipment Line
          </button>
          {type === 'sale' && (
            <div className="text-sm font-bold text-gray-900">
              Total Amount <span className="ml-10">{money(total)}</span>
            </div>
          )}
        </div>
      </Section>

      <Section title="Notes">
        <textarea
          value={draft.notes}
          onChange={(event) => update('notes', event.target.value)}
          rows={4}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-primary"
        />
      </Section>
    </div>
  );
};

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({
  title,
  children,
}) => (
  <section className="rounded-lg border border-gray-200 bg-white p-5">
    <h3 className="mb-4 text-sm font-bold uppercase text-primary">{title}</h3>
    {children}
  </section>
);

const Input: React.FC<{
  label: string;
  value: string;
  type?: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}> = ({ label, value, type = 'text', disabled, onChange }) => (
  <label className="block">
    <span className="mb-2 block text-xs font-semibold text-gray-700">
      {label}
    </span>
    <input
      type={type}
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
      className="h-10 w-full rounded-md border border-gray-300 px-3 text-sm outline-none focus:border-primary disabled:bg-gray-50"
    />
  </label>
);

const Select: React.FC<{
  label: string;
  value: string;
  options: Array<[string, string]>;
  onChange: (value: string) => void;
}> = ({ label, value, options, onChange }) => (
  <label className="block">
    <span className="mb-2 block text-xs font-semibold text-gray-700">
      {label}
    </span>
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="h-10 w-full rounded-md border border-gray-300 bg-white px-3 text-sm outline-none focus:border-primary"
    >
      {options.length === 0 && (
        <option value="">No work orders available</option>
      )}
      {options.map(([id, name]) => (
        <option key={id} value={id}>
          {name}
        </option>
      ))}
    </select>
  </label>
);

const DetailScreen: React.FC<{
  workOrder: CommercialWorkOrder;
  onBack: () => void;
  onEdit: () => void;
  onPdf: () => void;
  onOffRent: () => void;
}> = ({ workOrder, onBack, onEdit, onPdf, onOffRent }) => (
  <div className="p-3 sm:p-6 space-y-5">
    <Breadcrumb parts={['Work Orders', 'Work Order Detail']} />
    <div className="flex items-start justify-between gap-4">
      <div>
        <button
          onClick={onBack}
          className="mb-3 inline-flex items-center gap-2 text-sm font-semibold text-primary"
        >
          <ArrowLeft size={16} /> Back to Work Orders
        </button>
        <div className="flex items-center gap-3">
          <h2 className="text-2xl font-bold text-gray-900">
            Work Order {workOrder.workOrderNumber}
          </h2>
          <span
            className={`rounded border px-2 py-1 text-xs font-semibold ${statusClass(workOrder.status)}`}
          >
            {statusLabel[workOrder.status]}
          </span>
        </div>
        <p className="mt-2 text-sm text-gray-500">
          Created on {formatDate(workOrder.createdAt || '')}
        </p>
      </div>
      <div className="flex gap-3">
        <button
          onClick={onEdit}
          className="rounded-md border border-gray-300 bg-white px-5 py-2.5 text-sm font-semibold text-gray-700"
        >
          Edit
        </button>
        {workOrder.type === 'on_rent' && workOrder.status === 'on_rent' && (
          <button
            onClick={onOffRent}
            className="inline-flex items-center gap-2 rounded-md border border-gray-300 bg-white px-5 py-2.5 text-sm font-semibold text-gray-700"
          >
            <RefreshCcw size={16} /> Process Off Rent
          </button>
        )}
        <button
          onClick={onPdf}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-5 py-2.5 text-sm font-semibold text-white"
        >
          <FileText size={16} /> View PDF
        </button>
      </div>
    </div>
    <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
      <Section title="General Information">
        <div className="grid gap-6 md:grid-cols-3 text-sm">
          <Info label="Work Order #" value={workOrder.workOrderNumber} />
          <Info label="Job Name" value={workOrder.jobName} />
          <Info label="Customer" value={workOrder.customerName} />
          <Info label="Contact" value={workOrder.contact} />
          <Info label="Phone" value={workOrder.phone} />
          <Info label="Email" value={workOrder.email} />
          <Info
            label="Customer Order #"
            value={workOrder.customerOrderNumber}
          />
          <Info
            label="Description of Work"
            value={workOrder.descriptionOfWork}
          />
          <Info label="Notes" value={workOrder.notes} />
        </div>
      </Section>
      <Section title="Summary">
        <div className="space-y-4 text-sm">
          <Info label="Status" value={statusLabel[workOrder.status]} />
          <Info label="Work Order Type" value={typeLabel[workOrder.type]} />
          <Info label="Created by" value={workOrder.createdBy || '-'} />
          <Info
            label="Created on"
            value={formatDate(workOrder.createdAt || '')}
          />
          <Info
            label="Last updated"
            value={formatDate(workOrder.updatedAt || '')}
          />
        </div>
      </Section>
    </div>
    <Section
      title={workOrder.type === 'sale' ? 'Material' : 'Material & Equipment'}
    >
      <ItemsTable workOrder={workOrder} />
    </Section>
  </div>
);

const Info: React.FC<{ label: string; value?: string | number | null }> = ({
  label,
  value,
}) => (
  <div>
    <p className="text-xs font-medium text-gray-500">{label}</p>
    <p className="mt-1 font-semibold text-gray-900">{value || '-'}</p>
  </div>
);

const ItemsTable: React.FC<{ workOrder: CommercialWorkOrder }> = ({
  workOrder,
}) => {
  const isSale = workOrder.type === 'sale';
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead className="bg-gray-50 text-xs font-semibold uppercase text-gray-500">
          <tr>
            <th className="px-3 py-3 text-left">Item #</th>
            <th className="px-3 py-3 text-left">SKU</th>
            <th className="px-3 py-3 text-left">Description</th>
            <th className="px-3 py-3">{isSale ? 'Qty' : 'On Rent Qty'}</th>
            {isSale && <th className="px-3 py-3">Price</th>}
            {isSale && <th className="px-3 py-3">Amount</th>}
            {!isSale && <th className="px-3 py-3">On Rent Date</th>}
            {!isSale && <th className="px-3 py-3">Off Rent Qty</th>}
            {!isSale && <th className="px-3 py-3">Remaining Qty</th>}
            {!isSale && <th className="px-3 py-3">Loss Qty</th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {workOrder.items.map((item, index) => (
            <tr key={item.id}>
              <td className="px-3 py-3">{index + 1}</td>
              <td className="px-3 py-3 font-semibold">{item.sku}</td>
              <td className="px-3 py-3">{item.description}</td>
              <td className="px-3 py-3 text-center">
                {isSale ? item.qty : item.onRentQty}
              </td>
              {isSale && (
                <td className="px-3 py-3 text-center">
                  {money(numberValue(item.price))}
                </td>
              )}
              {isSale && (
                <td className="px-3 py-3 text-center font-semibold">
                  {money(numberValue(item.amount))}
                </td>
              )}
              {!isSale && (
                <td className="px-3 py-3 text-center">
                  {item.onRentDate || '-'}
                </td>
              )}
              {!isSale && (
                <td className="px-3 py-3 text-center">
                  {item.offRentQty ?? '-'}
                </td>
              )}
              {!isSale && (
                <td className="px-3 py-3 text-center">
                  {item.remainingQty ?? '-'}
                </td>
              )}
              {!isSale && (
                <td className="px-3 py-3 text-center">{item.lossQty ?? '-'}</td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

const PdfPreview: React.FC<{
  workOrder: CommercialWorkOrder;
  pdfUrl: string;
  onBack: () => void;
  onDownload: () => void;
  onPrint: () => void;
}> = ({ workOrder, pdfUrl, onBack, onDownload, onPrint }) => (
  <div className="p-3 sm:p-6 space-y-5">
    <Breadcrumb
      parts={['Work Orders', workOrder.workOrderNumber, 'PDF Preview']}
    />
    <div className="flex items-start justify-between gap-4">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">PDF Preview</h2>
        <p className="mt-2 text-sm text-gray-500">
          Preview the work order document before downloading or printing.
        </p>
      </div>
      <div className="flex gap-3">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-2 rounded-md border border-gray-300 bg-white px-5 py-2.5 text-sm font-semibold"
        >
          <ArrowLeft size={16} /> Back to Work Order
        </button>
        <button
          onClick={onDownload}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-5 py-2.5 text-sm font-semibold text-white"
        >
          <Download size={16} /> Download PDF
        </button>
        <button
          onClick={onPrint}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-5 py-2.5 text-sm font-semibold text-white"
        >
          <Printer size={16} /> Print PDF
        </button>
      </div>
    </div>
    <div className="grid gap-5 lg:grid-cols-[260px_1fr]">
      <Section title="Document Information">
        <div className="space-y-4 text-sm">
          <Info label="Work Order #" value={workOrder.workOrderNumber} />
          <Info label="Type" value={typeLabel[workOrder.type]} />
          <Info label="Customer" value={workOrder.customerName} />
          <Info label="Job Name" value={workOrder.jobName} />
          <Info label="Created By" value={workOrder.createdBy} />
        </div>
      </Section>
      <div className="overflow-hidden rounded-lg border border-gray-300 bg-gray-900 p-3">
        {pdfUrl ? (
          <iframe
            title="Work order PDF preview"
            src={pdfUrl}
            className="h-[760px] w-full rounded bg-white"
          />
        ) : (
          <div className="flex h-[760px] items-center justify-center text-white">
            Loading preview...
          </div>
        )}
      </div>
    </div>
  </div>
);

const OffRentScreen: React.FC<{
  selectedId?: string;
  workOrders: CommercialWorkOrder[];
  isSaving: boolean;
  onCancel: () => void;
  onSubmit: (
    id: string,
    payload: {
      offRentDate: string;
      notes?: string;
      items: Array<{ itemId: string; offRentQty: number; lossQty?: number }>;
    },
  ) => Promise<void>;
}> = ({ selectedId, workOrders, isSaving, onCancel, onSubmit }) => {
  const [workOrderId, setWorkOrderId] = useState(
    selectedId || workOrders[0]?.id || '',
  );
  useEffect(() => {
    if (
      workOrders.length > 0 &&
      !workOrders.find((item) => item.id === workOrderId)
    ) {
      setWorkOrderId(workOrders[0].id);
    }
  }, [workOrders, workOrderId]);
  const workOrder = workOrders.find((item) => item.id === workOrderId);
  const [offRentDate, setOffRentDate] = useState(todayIso());
  const [notes, setNotes] = useState('');
  const [returns, setReturns] = useState<
    Record<string, { offRentQty: number; lossQty: number }>
  >({});
  const updateReturn = (
    itemId: string,
    key: 'offRentQty' | 'lossQty',
    value: number,
  ) =>
    setReturns((current) => ({
      ...current,
      [itemId]: {
        offRentQty: current[itemId]?.offRentQty ?? 0,
        lossQty: current[itemId]?.lossQty ?? 0,
        [key]: value,
      },
    }));
  const payloadItems = (workOrder?.items || []).map((item) => ({
    itemId: item.id,
    offRentQty: returns[item.id]?.offRentQty ?? 0,
    lossQty: returns[item.id]?.lossQty ?? 0,
  }));
  return (
    <div className="p-3 sm:p-6 space-y-5">
      <Breadcrumb parts={['Work Orders', 'Off Rent (Return)']} />
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">
            Off Rent (Return) Work Order
          </h2>
          <p className="mt-2 text-sm text-gray-500">
            Record the return of rented items from an existing On Rent work
            order.
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="rounded-md border border-gray-300 bg-white px-5 py-2.5 text-sm font-semibold"
          >
            Cancel
          </button>
          <button
            disabled={!workOrder || isSaving}
            onClick={() =>
              workOrder &&
              void onSubmit(workOrder.id, {
                offRentDate,
                notes,
                items: payloadItems,
              })
            }
            className="rounded-md bg-primary px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
          >
            {isSaving ? 'Saving...' : 'Save & Generate PDF'}
          </button>
        </div>
      </div>
      <Section title="1. Select On Rent Work Order">
        <div className="grid gap-4 md:grid-cols-4">
          <Select
            label="On Rent Work Order *"
            value={workOrderId}
            onChange={setWorkOrderId}
            options={workOrders.map((item) => [
              item.id,
              `${item.workOrderNumber} - ${item.jobName}`,
            ])}
          />
          <Input
            label="Customer"
            value={workOrder?.customerName || ''}
            disabled
            onChange={() => {}}
          />
          <Input
            label="Job Name"
            value={workOrder?.jobName || ''}
            disabled
            onChange={() => {}}
          />
          <Input
            label="On Rent Date"
            value={workOrder?.onRentDate || ''}
            disabled
            onChange={() => {}}
          />
        </div>
      </Section>
      <Section title="2. Return Information">
        <div className="grid gap-4 md:grid-cols-2">
          <Input
            label="Off Rent Date *"
            type="date"
            value={offRentDate}
            onChange={setOffRentDate}
          />
          <label>
            <span className="mb-2 block text-xs font-semibold text-gray-700">
              Notes (Return Condition)
            </span>
            <textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              rows={3}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </label>
        </div>
      </Section>
      <Section title="3. Returned Items">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-xs font-semibold uppercase text-gray-500">
              <tr>
                <th className="px-3 py-3">SKU</th>
                <th className="px-3 py-3 text-left">Description</th>
                <th className="px-3 py-3">On Rent Qty</th>
                <th className="px-3 py-3">This Return</th>
                <th className="px-3 py-3">Remaining Qty</th>
                <th className="px-3 py-3">Loss Qty</th>
              </tr>
            </thead>
            <tbody>
              {workOrder?.items.map((item) => {
                const ret = returns[item.id]?.offRentQty ?? 0;
                const loss = returns[item.id]?.lossQty ?? 0;
                const remaining = Math.max(
                  numberValue(item.onRentQty) - ret - loss,
                  0,
                );
                return (
                  <tr key={item.id} className="border-b border-gray-100">
                    <td className="px-3 py-3 text-center font-semibold">
                      {item.sku}
                    </td>
                    <td className="px-3 py-3">{item.description}</td>
                    <td className="px-3 py-3 text-center">{item.onRentQty}</td>
                    <td className="px-3 py-3 text-center">
                      <input
                        type="number"
                        min={0}
                        max={item.onRentQty || 0}
                        value={ret}
                        onChange={(event) =>
                          updateReturn(
                            item.id,
                            'offRentQty',
                            Number(event.target.value),
                          )
                        }
                        className="h-9 w-24 rounded-md border px-2 text-center"
                      />
                    </td>
                    <td className="px-3 py-3 text-center font-semibold">
                      {remaining}
                    </td>
                    <td className="px-3 py-3 text-center">
                      <input
                        type="number"
                        min={0}
                        value={loss}
                        onChange={(event) =>
                          updateReturn(
                            item.id,
                            'lossQty',
                            Number(event.target.value),
                          )
                        }
                        className="h-9 w-24 rounded-md border px-2 text-center"
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  );
};

const OffRentResult: React.FC<{
  original?: CommercialWorkOrder;
  rollover?: CommercialWorkOrder;
  onBack: () => void;
  onOpen: (id: string) => void;
}> = ({ original, rollover, onBack, onOpen }) => (
  <div className="p-3 sm:p-6 space-y-5">
    <Breadcrumb
      parts={['Work Orders', original?.workOrderNumber || 'Off Rent', 'Result']}
    />
    <div>
      <h2 className="text-2xl font-bold text-gray-900">
        Off Rent Completed Successfully
      </h2>
      <p className="mt-2 text-sm text-gray-500">
        The off rent has been processed. The original work order has been closed
        {rollover
          ? ' and a new work order has been created for the remaining equipment.'
          : '.'}
      </p>
    </div>
    <div className="rounded-lg border border-green-200 bg-green-50 p-3 sm:p-6 text-green-800">
      <div className="text-lg font-bold">Off Rent Processed Successfully</div>
      <p className="mt-2 text-sm">
        Original work order <strong>{original?.workOrderNumber}</strong> has
        been closed.{' '}
        {rollover && (
          <>
            New work order <strong>{rollover.workOrderNumber}</strong> has been
            created.
          </>
        )}
      </p>
    </div>
    <div className="grid gap-5 md:grid-cols-2">
      <Section title="Original Work Order (Closed)">
        <Info label="Work Order #" value={original?.workOrderNumber} />
        <Info label="Customer" value={original?.customerName} />
        <Info label="Status" value={original?.status} />
      </Section>
      {rollover && (
        <Section title="New Work Order Created">
          <Info label="Work Order #" value={rollover.workOrderNumber} />
          <Info label="Type" value={typeLabel[rollover.type]} />
          <Info label="Status" value={statusLabel[rollover.status]} />
        </Section>
      )}
    </div>
    <div className="flex justify-between">
      <button
        onClick={onBack}
        className="inline-flex items-center gap-2 rounded-md border border-gray-300 bg-white px-5 py-2.5 text-sm font-semibold"
      >
        <ArrowLeft size={16} /> Back to Work Orders
      </button>
      {rollover && (
        <button
          onClick={() => onOpen(rollover.id)}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-5 py-2.5 text-sm font-semibold text-white"
        >
          View New WO {rollover.workOrderNumber} <ChevronRight size={16} />
        </button>
      )}
    </div>
  </div>
);

function formatDate(value: string) {
  if (!value) return '-';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString('en-US', {
    month: '2-digit',
    day: '2-digit',
    year: 'numeric',
  });
}

export default WorkOrdersModuleView;
