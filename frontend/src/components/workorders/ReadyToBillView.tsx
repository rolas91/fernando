import React, { useMemo, useState } from 'react';
import { useAppContext } from '@/contexts/AppContext';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { CommercialInvoice, CommercialWorkOrder } from '@/lib/types';
import { dbFetchCommercialInvoicePdf } from '@/lib/db';
import {
  ArrowLeft,
  CalendarDays,
  Download,
  FileText,
  Printer,
  Search,
  X,
} from 'lucide-react';

const todayIso = () => new Date().toISOString().slice(0, 10);
const addDays = (date: string, days: number) => {
  const parsed = new Date(`${date}T00:00:00`);
  parsed.setDate(parsed.getDate() + days);
  return parsed.toISOString().slice(0, 10);
};
const daysBetween = (start?: string | null, end = todayIso()) => {
  if (!start) return 0;
  const a = new Date(`${start}T00:00:00`).getTime();
  const b = new Date(`${end}T00:00:00`).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.max(Math.ceil((b - a) / 86400000), 0);
};
const money = (value: number) => `$${value.toFixed(2)}`;
const numberValue = (value: unknown) => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};
const invoiceAmountFor = (workOrder: CommercialWorkOrder) =>
  workOrder.items.reduce(
    (sum, item) =>
      sum + numberValue(item.onRentQty) * numberValue(item.dailyRate) * 28,
    0,
  );
const formatDate = (value?: string | null) => {
  if (!value) return '-';
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString('en-US', {
    month: '2-digit',
    day: '2-digit',
    year: 'numeric',
  });
};

const ReadyToBillView: React.FC = () => {
  const { commercialWorkOrders, generateCommercialInvoice } = useAppContext();
  const { user } = useAuth();
  const { toast } = useToast();
  const [query, setQuery] = useState('');
  const [selectedWorkOrder, setSelectedWorkOrder] =
    useState<CommercialWorkOrder | null>(null);
  const [selectedInvoice, setSelectedInvoice] =
    useState<CommercialInvoice | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  const rows = useMemo(() => {
    const term = query.trim().toLowerCase();
    return commercialWorkOrders
      .filter((item) => item.type === 'on_rent' && item.status === 'on_rent')
      .filter((item) => {
        if (!term) return true;
        return [item.workOrderNumber, item.customerName, item.jobName]
          .join(' ')
          .toLowerCase()
          .includes(term);
      })
      .sort((a, b) =>
        (a.nextInvoiceDate || '').localeCompare(b.nextInvoiceDate || ''),
      );
  }, [commercialWorkOrders, query]);

  const downloadInvoice = async (invoice: CommercialInvoice) => {
    const blob = await dbFetchCommercialInvoicePdf(invoice.id);
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${invoice.invoiceNumber}.pdf`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const printInvoice = async (invoice: CommercialInvoice) => {
    const blob = await dbFetchCommercialInvoicePdf(invoice.id);
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

  if (selectedInvoice) {
    return (
      <InvoiceDetail
        invoice={selectedInvoice}
        onBack={() => setSelectedInvoice(null)}
        onDownload={() => void downloadInvoice(selectedInvoice)}
        onPrint={() => void printInvoice(selectedInvoice)}
      />
    );
  }

  return (
    <div className="p-3 sm:p-6 space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="mb-2 text-sm font-semibold text-primary">
            Work Orders &gt; Ready to Bill
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Ready to Bill</h1>
          <p className="mt-2 text-sm text-gray-500">
            Work orders ready for 28-day rental billing.
          </p>
        </div>
        <label className="flex h-11 w-full max-w-md items-center rounded-md border border-gray-300 bg-white px-3">
          <Search size={18} className="mr-2 text-gray-400" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by WO #, customer, job name..."
            className="w-full text-sm outline-none"
          />
        </label>
      </div>

      <div className="rounded-lg border border-blue-200 bg-blue-50 px-5 py-4 text-sm text-blue-800">
        <div className="flex items-start gap-3">
          <CalendarDays size={20} className="mt-0.5" />
          <p>
            Invoices are generated every 28 days from the On Rent Date. Next
            Invoice Date is calculated automatically.
          </p>
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
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Job Name</th>
                <th className="px-4 py-3">On Rent Date</th>
                <th className="px-4 py-3">Previous Billing Date</th>
                <th className="px-4 py-3">Next Invoice Date</th>
                <th className="px-4 py-3 text-center">
                  Days Since Last Billing
                </th>
                <th className="px-4 py-3 text-right">Amount (Est.)</th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((item) => {
                const lastBillingBase =
                  item.previousBillingDate || item.onRentDate;
                return (
                  <tr key={item.id} className="hover:bg-gray-50">
                    <td className="px-4 py-4 font-semibold text-primary">
                      {item.workOrderNumber}
                    </td>
                    <td className="px-4 py-4">{item.customerName}</td>
                    <td className="px-4 py-4">{item.jobName}</td>
                    <td className="px-4 py-4">{formatDate(item.onRentDate)}</td>
                    <td className="px-4 py-4">
                      {formatDate(item.previousBillingDate)}
                    </td>
                    <td className="px-4 py-4">
                      {formatDate(item.nextInvoiceDate)}
                    </td>
                    <td className="px-4 py-4 text-center text-green-700">
                      {daysBetween(lastBillingBase)}
                    </td>
                    <td className="px-4 py-4 text-right font-semibold">
                      {money(invoiceAmountFor(item))}
                    </td>
                    <td className="px-4 py-4 text-right">
                      <button
                        onClick={() => setSelectedWorkOrder(item)}
                        className="inline-flex items-center gap-2 rounded-md border border-primary px-3 py-2 text-sm font-semibold text-primary hover:bg-blue-50"
                      >
                        <FileText size={16} /> Generate Invoice
                      </button>
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr>
                  <td
                    colSpan={9}
                    className="px-4 py-10 text-center text-gray-500"
                  >
                    No active rental work orders are ready to bill.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="inline-flex items-start gap-3 rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-800">
        <CalendarDays size={18} />
        <div>
          <div className="font-semibold">
            Billing Cycle: Every 28 days from On Rent Date
          </div>
          <div>
            Example: On Rent Date 05/15/2026 - Next Invoice Date 06/12/2026
          </div>
        </div>
      </div>

      {selectedWorkOrder && (
        <GenerateInvoiceModal
          workOrder={selectedWorkOrder}
          isGenerating={isGenerating}
          createdBy={user ? `${user.firstName} ${user.lastName}` : ''}
          onClose={() => setSelectedWorkOrder(null)}
          onConfirm={async (billingDate, itemIds) => {
            setIsGenerating(true);
            try {
              const invoice = await generateCommercialInvoice(
                selectedWorkOrder.id,
                {
                  billingDate,
                  itemIds,
                  createdBy: user ? `${user.firstName} ${user.lastName}` : '',
                },
              );
              if (invoice) {
                toast({
                  title: 'Invoice generated',
                  description: `${invoice.invoiceNumber} was created.`,
                });
                setSelectedWorkOrder(null);
                setSelectedInvoice(invoice);
              }
            } catch (error) {
              toast({
                title: 'Could not generate invoice',
                description:
                  error instanceof Error
                    ? error.message
                    : 'Please review the work order.',
                variant: 'destructive',
              });
            } finally {
              setIsGenerating(false);
            }
          }}
        />
      )}
    </div>
  );
};

const GenerateInvoiceModal: React.FC<{
  workOrder: CommercialWorkOrder;
  createdBy: string;
  isGenerating: boolean;
  onClose: () => void;
  onConfirm: (billingDate: string, itemIds: string[]) => Promise<void>;
}> = ({
  workOrder,
  createdBy: _createdBy,
  isGenerating,
  onClose,
  onConfirm,
}) => {
  const [billingDate, setBillingDate] = useState(todayIso());
  const [selectedItems, setSelectedItems] = useState<Record<string, boolean>>(
    () => Object.fromEntries(workOrder.items.map((item) => [item.id, true])),
  );
  const itemIds = workOrder.items
    .filter((item) => selectedItems[item.id])
    .map((item) => item.id);
  const nextInvoiceDate = addDays(billingDate, 28);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-2 sm:p-4">
      <div className="w-full max-w-3xl rounded-lg bg-white shadow-xl">
        <div className="flex items-start justify-between border-b border-gray-200 px-3 sm:px-6 py-5 flex-wrap gap-3">
          <div>
            <h2 className="text-xl font-bold text-gray-900">
              Generate Invoice
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              You are about to generate an invoice for this work order.
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-gray-500 hover:bg-gray-100"
          >
            <X size={20} />
          </button>
        </div>
        <div className="space-y-4 px-3 sm:px-6 py-5">
          <div className="grid gap-4 rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm md:grid-cols-2">
            <Info label="Work Order #" value={workOrder.workOrderNumber} />
            <Info label="Job Name" value={workOrder.jobName} />
            <Info label="Customer" value={workOrder.customerName} />
            <Info
              label="On Rent Date"
              value={formatDate(workOrder.onRentDate)}
            />
          </div>
          <div className="grid gap-4 rounded-lg border border-gray-200 p-4 md:grid-cols-2">
            <label>
              <span className="mb-2 block text-xs font-semibold text-gray-700">
                Billing Date *
              </span>
              <input
                type="date"
                value={billingDate}
                onChange={(event) => setBillingDate(event.target.value)}
                className="h-10 w-full rounded-md border border-gray-300 px-3 text-sm outline-none focus:border-primary"
              />
              <span className="mt-2 block text-xs text-gray-500">
                This will be the invoice date.
              </span>
            </label>
            <label>
              <span className="mb-2 block text-xs font-semibold text-gray-700">
                Next Invoice Date
              </span>
              <input
                type="date"
                value={nextInvoiceDate}
                disabled
                className="h-10 w-full rounded-md border border-gray-200 bg-gray-50 px-3 text-sm text-gray-600"
              />
              <span className="mt-2 block text-xs text-gray-500">
                Calculated automatically (28 days).
              </span>
            </label>
          </div>
          <div className="rounded-lg border border-gray-200">
            <div className="border-b border-gray-200 px-4 py-3 text-sm font-bold text-gray-900">
              Items to be Invoiced
            </div>
            <div
              className="responsive-table"
              role="region"
              aria-label="Table data"
              tabIndex={0}
            >
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 text-xs font-semibold uppercase text-gray-500">
                  <tr>
                    <th className="w-12 px-3 py-3"></th>
                    <th className="px-3 py-3 text-left">SKU</th>
                    <th className="px-3 py-3 text-left">Description</th>
                    <th className="px-3 py-3">On Rent Qty</th>
                    <th className="px-3 py-3">Rental Duration</th>
                    <th className="px-3 py-3">This Invoice Qty</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {workOrder.items.map((item) => (
                    <tr key={item.id}>
                      <td className="px-3 py-3 text-center">
                        <input
                          type="checkbox"
                          checked={selectedItems[item.id] ?? false}
                          onChange={(event) =>
                            setSelectedItems((current) => ({
                              ...current,
                              [item.id]: event.target.checked,
                            }))
                          }
                          className="h-4 w-4 accent-primary"
                        />
                      </td>
                      <td className="px-3 py-3 font-semibold">{item.sku}</td>
                      <td className="px-3 py-3">{item.description}</td>
                      <td className="px-3 py-3 text-center">
                        {item.onRentQty || 0}
                      </td>
                      <td className="px-3 py-3 text-center">
                        {daysBetween(
                          item.onRentDate || workOrder.onRentDate,
                          billingDate,
                        )}
                      </td>
                      <td className="px-3 py-3 text-center">
                        {item.onRentQty || 0}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-3 border-t border-gray-200 px-3 sm:px-6 py-4">
          <button
            onClick={onClose}
            className="rounded-md border border-gray-300 bg-white px-5 py-2.5 text-sm font-semibold text-gray-700"
          >
            Cancel
          </button>
          <button
            disabled={isGenerating || itemIds.length === 0}
            onClick={() => void onConfirm(billingDate, itemIds)}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
          >
            <FileText size={16} />{' '}
            {isGenerating ? 'Generating...' : 'Generate Invoice'}
          </button>
        </div>
      </div>
    </div>
  );
};

const InvoiceDetail: React.FC<{
  invoice: CommercialInvoice;
  onBack: () => void;
  onDownload: () => void;
  onPrint: () => void;
}> = ({ invoice, onBack, onDownload, onPrint }) => (
  <div className="p-3 sm:p-6 space-y-5">
    <div className="flex items-start justify-between gap-4">
      <div>
        <div className="mb-2 text-sm font-semibold text-primary">
          Invoices &gt; Invoice Detail
        </div>
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-gray-900">
            Invoice {invoice.invoiceNumber}
          </h1>
          <span className="rounded border border-green-200 bg-green-100 px-2 py-1 text-xs font-bold uppercase text-green-700">
            {invoice.status}
          </span>
        </div>
        <p className="mt-2 text-sm text-gray-500">
          Generated on {formatDate(invoice.createdAt || invoice.billingDate)}
        </p>
      </div>
      <div className="flex gap-3">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-2 rounded-md border border-gray-300 bg-white px-5 py-2.5 text-sm font-semibold"
        >
          <ArrowLeft size={16} /> Back to Ready to Bill
        </button>
        <button
          onClick={onDownload}
          className="inline-flex items-center gap-2 rounded-md border border-gray-300 bg-white px-5 py-2.5 text-sm font-semibold"
        >
          <Download size={16} /> Download PDF
        </button>
        <button
          onClick={onPrint}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-5 py-2.5 text-sm font-semibold text-white"
        >
          <Printer size={16} /> Print
        </button>
      </div>
    </div>

    <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
      <Section title="Invoice Information">
        <div className="grid gap-6 md:grid-cols-3">
          <Info label="Invoice #" value={invoice.invoiceNumber} />
          <Info label="Work Order #" value={invoice.workOrderNumber} />
          <Info label="Customer" value={invoice.customerName} />
          <Info label="Job Name" value={invoice.jobName} />
          <Info label="Billing Date" value={formatDate(invoice.billingDate)} />
          <Info
            label="Next Invoice Date"
            value={formatDate(invoice.nextInvoiceDate)}
          />
        </div>
      </Section>
      <Section title="Summary">
        <div className="space-y-4">
          <Info label="Status" value={invoice.status} />
          <Info
            label="Invoice Amount"
            value={money(numberValue(invoice.amount))}
          />
          <Info label="Billing Cycle" value="Every 28 days" />
          <Info label="Created by" value={invoice.createdBy || '-'} />
        </div>
      </Section>
    </div>

    <Section title="Items Invoiced">
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-xs font-semibold uppercase text-gray-500">
            <tr>
              <th className="px-3 py-3 text-left">#</th>
              <th className="px-3 py-3 text-left">SKU</th>
              <th className="px-3 py-3 text-left">Description</th>
              <th className="px-3 py-3">On Rent Qty</th>
              <th className="px-3 py-3">Rental Duration</th>
              <th className="px-3 py-3">This Invoice Qty</th>
              <th className="px-3 py-3">Unit Price</th>
              <th className="px-3 py-3 text-right">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {invoice.items.map((item, index) => (
              <tr key={`${item.itemId}:${index}`}>
                <td className="px-3 py-3">{index + 1}</td>
                <td className="px-3 py-3 font-semibold">{item.sku}</td>
                <td className="px-3 py-3">{item.description}</td>
                <td className="px-3 py-3 text-center">{item.onRentQty}</td>
                <td className="px-3 py-3 text-center">
                  {item.rentalDurationDays}
                </td>
                <td className="px-3 py-3 text-center">{item.invoiceQty}</td>
                <td className="px-3 py-3 text-center">
                  {money(numberValue(item.unitPrice))}
                </td>
                <td className="px-3 py-3 text-right font-semibold">
                  {money(numberValue(item.amount))}
                </td>
              </tr>
            ))}
            <tr>
              <td colSpan={7} className="px-3 py-3 text-right font-bold">
                Total
              </td>
              <td className="px-3 py-3 text-right text-lg font-bold text-primary">
                {money(numberValue(invoice.amount))}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </Section>
  </div>
);

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({
  title,
  children,
}) => (
  <section className="rounded-lg border border-gray-200 bg-white p-5">
    <h3 className="mb-4 text-sm font-bold text-gray-900">{title}</h3>
    {children}
  </section>
);

const Info: React.FC<{ label: string; value?: React.ReactNode }> = ({
  label,
  value,
}) => (
  <div>
    <p className="text-xs font-medium text-gray-500">{label}</p>
    <p className="mt-1 font-semibold text-gray-900">{value || '-'}</p>
  </div>
);

export default ReadyToBillView;
