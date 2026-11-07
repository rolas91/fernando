import React, { useEffect, useState } from 'react';
import {
  AssignmentAddressField,
  type AssignmentAddressValue,
} from '@/components/workorders/AssignmentAddressField';
import { fetchSystemUsers } from '@/lib/db';
import { useShiftStatusCatalog } from '@/lib/useShiftStatusCatalog';
import { DEFAULT_ASSIGNMENT_COUNTRY } from '@/lib/googlePlaceAddress';
import type { UserProfile } from '@/lib/types';

export interface ShiftOverviewValue {
  status: string;
  createdByUserId: string;
  requesterName: string;
  requesterPhone: string;
  requesterEmail: string;
  address: AssignmentAddressValue;
  crossStreetLocationDetail: string;
  visibleDocumentTypes: string[];
  notes: string;
}

const fileNameFromUrl = (url: string) => {
  try {
    return decodeURIComponent(url.split('/').pop() || url);
  } catch {
    return url.split('/').pop() || url;
  }
};

const ShiftOverviewTab: React.FC<{
  value: ShiftOverviewValue;
  availableDocuments?: string[];
  formsSelection?: React.ReactNode;
  disabled?: boolean;
  includeCancelled?: boolean;
  onChange: (value: ShiftOverviewValue) => void;
}> = ({
  value,
  availableDocuments = [],
  formsSelection,
  disabled = false,
  includeCancelled = true,
  onChange,
}) => {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const { manual: manualStatuses, loading: statusLoading } =
    useShiftStatusCatalog();

  useEffect(() => {
    fetchSystemUsers()
      .then((rows) => setUsers(rows.filter((u) => u.status === 'active')))
      .catch(() => setUsers([]));
  }, []);

  const manualOptions =
    manualStatuses.length > 0
      ? manualStatuses
      : [
          {
            value: 'customer_pending',
            name: 'Customer Pending',
            color: '',
            sortOrder: 0,
            automatic: false,
            blocksEditing: false,
            triggersNotification: false,
            requiresApproval: false,
          },
          {
            value: 'dispatch_pending',
            name: 'Dispatch Pending',
            color: '',
            sortOrder: 0,
            automatic: false,
            blocksEditing: false,
            triggersNotification: false,
            requiresApproval: false,
          },
          {
            value: 'ready_to_notify',
            name: 'Ready to Notify',
            color: '',
            sortOrder: 0,
            automatic: false,
            blocksEditing: false,
            triggersNotification: false,
            requiresApproval: false,
          },
          {
            value: 'shift_cancelled',
            name: 'Shift Cancelled',
            color: '',
            sortOrder: 0,
            automatic: true,
            blocksEditing: false,
            triggersNotification: true,
            requiresApproval: false,
          },
        ];

  return (
    <div className="space-y-4 p-5">
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-semibold">
            Shift Status
          </label>
          <select
            value={value.status}
            onChange={(e) => onChange({ ...value, status: e.target.value })}
            className="w-full rounded-lg border px-3 py-2 text-sm"
            disabled={statusLoading || disabled}
          >
            <option value="">Select shift status...</option>
            {manualOptions
              .filter(
                (opt) => includeCancelled || opt.value !== 'shift_cancelled',
              )
              .map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.name}
                </option>
              ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold">
            Work Order Created By
          </label>
          <select
            value={value.createdByUserId}
            disabled={disabled}
            onChange={(e) =>
              onChange({ ...value, createdByUserId: e.target.value })
            }
            className="w-full rounded-lg border px-3 py-2 text-sm disabled:bg-gray-100"
          >
            <option value="">Select a system user...</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.firstName} {u.lastName} ({u.email})
              </option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <AssignmentAddressField
          id="shift-overview-address"
          label="Shift Address"
          value={value.address}
          onChange={(address) => onChange({ ...value, address })}
          disabled={disabled}
          afterAddressField={
            <div>
              <label className="mb-1 block text-xs font-semibold">
                Cross Street / Location Details
              </label>
              <input
                value={value.crossStreetLocationDetail}
                disabled={disabled}
                onChange={(event) =>
                  onChange({
                    ...value,
                    crossStreetLocationDetail: event.target.value,
                  })
                }
                placeholder="e.g. Mission St & 5th St, Northwest Corner"
                className="w-full rounded-lg border px-3 py-2 text-sm"
              />
            </div>
          }
        />
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <div>
          <label className="mb-1 block text-xs font-semibold">
            Requester Name
          </label>
          <input
            type="text"
            value={value.requesterName}
            disabled={disabled}
            onChange={(e) =>
              onChange({ ...value, requesterName: e.target.value })
            }
            placeholder="Enter requester name"
            className="w-full rounded-lg border px-3 py-2 text-sm disabled:bg-gray-100"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold">
            Requester Phone
          </label>
          <input
            type="tel"
            value={value.requesterPhone}
            disabled={disabled}
            onChange={(e) =>
              onChange({ ...value, requesterPhone: e.target.value })
            }
            placeholder="Enter phone number"
            autoComplete="tel"
            className="w-full rounded-lg border px-3 py-2 text-sm disabled:bg-gray-100"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold">
            Requester Email
          </label>
          <input
            type="email"
            value={value.requesterEmail}
            disabled={disabled}
            onChange={(e) =>
              onChange({ ...value, requesterEmail: e.target.value })
            }
            placeholder="name@example.com"
            autoComplete="email"
            className="w-full rounded-lg border px-3 py-2 text-sm disabled:bg-gray-100"
          />
        </div>
      </div>
      <div className="rounded-lg border p-3">
        <label className="text-xs font-semibold">
          Documents Visible to Workers
        </label>
        <p className="mt-1 text-[11px] text-gray-500">
          Select the assignment files workers can view in the mobile app.
        </p>
        <div className="mt-3 space-y-2">
          {availableDocuments.length === 0 ? (
            <p className="rounded-md bg-gray-50 px-3 py-2 text-xs text-gray-500">
              No assignment files have been uploaded.
            </p>
          ) : (
            availableDocuments.map((url) => (
              <label
                key={url}
                className="flex items-center gap-2 rounded-md border border-gray-200 px-3 py-2 text-xs"
              >
                <input
                  type="checkbox"
                  checked={value.visibleDocumentTypes.includes(url)}
                  disabled={disabled}
                  onChange={(e) =>
                    onChange({
                      ...value,
                      visibleDocumentTypes: e.target.checked
                        ? [...value.visibleDocumentTypes, url]
                        : value.visibleDocumentTypes.filter((v) => v !== url),
                    })
                  }
                />
                <span className="min-w-0 truncate" title={fileNameFromUrl(url)}>
                  {fileNameFromUrl(url)}
                </span>
              </label>
            ))
          )}
        </div>
      </div>
      {formsSelection}
      <div>
        <label className="mb-1 block text-xs font-semibold">
          Notes (for this shift)
        </label>
        <textarea
          value={value.notes}
          disabled={disabled}
          onChange={(e) => onChange({ ...value, notes: e.target.value })}
          rows={4}
          className="w-full rounded-lg border px-3 py-2 text-sm disabled:bg-gray-100"
        />
      </div>
    </div>
  );
};

export const emptyShiftAddress = (address = ''): AssignmentAddressValue => ({
  assignmentAddress: address,
  latitude: null,
  longitude: null,
  assignmentCity: '',
  assignmentState: '',
  assignmentZipCode: '',
  assignmentCountry: DEFAULT_ASSIGNMENT_COUNTRY,
});
export default ShiftOverviewTab;
