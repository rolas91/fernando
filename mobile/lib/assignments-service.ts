import { requireApiBaseUrl } from './api-config';
import { apiResponseError, fetchWithFriendlyNetworkError } from './auth-errors';

export type AssignmentStatusFilter =
  | 'all'
  | 'active'
  | 'pending'
  | 'at_risk'
  | 'critical'
  | 'completed';

export type AssignmentShift = {
  id: string;
  shiftName: string;
  date: string;
  shiftTypeName?: string;
  startTime: string;
  endTime: string;
  roleId: string;
  roleName: string;
  address?: string;
  crossStreetLocationDetail?: string;
  latitude?: number;
  longitude?: number;
  confirmationStatus: 'pending' | 'confirmed' | 'declined';
  confirmationRequested?: boolean;
  effectiveStatus?:
    | 'customer_pending'
    | 'dispatch_pending'
    | 'ready_to_notify'
    | 'awaiting_response'
    | 'workers_confirmed'
    | 'shift_cancelled'
    | 'shift_completed'
    | 'pm_approved';
  completed?: boolean;
  completedAt?: string;
  completedFormTemplateIds?: string[];
  formTemplateIds?: string[];
  cancellationAcknowledgedAt?: string;
  cancellationNotificationId?: string;
  canManageWorkOrder?: boolean;
};

export type AssignmentListItem = {
  id: string;
  orderNumber: string;
  title: string;
  status: string;
  startDate: string;
  endDate: string;
  projectId: string;
  projectNumber: string;
  projectName: string;
  location: string;
  quickAccess?: {
    crewCount?: number;
    equipmentCount?: number;
    hasClient?: boolean;
    hasNotes?: boolean;
    documentCount?: number;
    crew?: {
      id: string;
      name: string;
      initials: string;
      roleLine: string;
      badge: string;
      phone?: string;
      shiftIds?: string[];
      shiftRoles?: Record<string, string[]>;
    }[];
    equipment?: {
      id: string;
      name: string;
      description: string;
      status: string;
      type: string;
      identifier: string;
      sku?: string;
      kind: string;
      shiftIds?: string[];
    }[];
    client?: {
      id: string;
      name: string;
      contactName?: string;
      email?: string;
      phone?: string;
      website?: string;
      address?: string;
      projectNumber?: string;
      projectManager?: string;
      projectManagerEmail?: string;
    } | null;
    notes?: {
      id: string;
      title: string;
      body: string;
    }[];
    documents?: {
      id: string;
      title: string;
      url: string;
      tag: string;
    }[];
  };
  shifts: AssignmentShift[];
};

export type PaginatedShiftsResponse = {
  items: AssignmentListItem[];
  page: number;
  limit: number;
  total: number;
  hasMore: boolean;
};

async function request<T>(
  path: string,
  token: string,
  options?: RequestInit,
): Promise<T> {
  const apiBaseUrl = requireApiBaseUrl();
  const response = await fetchWithFriendlyNetworkError(`${apiBaseUrl}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options?.headers ?? {}),
    },
  });

  if (!response.ok) throw await apiResponseError(response, path);

  return (await response.json()) as T;
}

export async function fetchAssignments(params: {
  token: string;
  status: AssignmentStatusFilter;
  search?: string;
}) {
  const query = new URLSearchParams();
  query.set('status', params.status);
  const search = params.search?.trim();
  if (search) query.set('search', search);

  return request<AssignmentListItem[]>(
    `/work-orders/mobile/assignments?${query.toString()}`,
    params.token,
  );
}

export function fetchAssignmentById(params: {
  token: string;
  assignmentId: string;
}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  return request<AssignmentListItem>(
    `/work-orders/mobile/assignments/${encodeURIComponent(params.assignmentId)}`,
    params.token,
    { signal: controller.signal },
  )
    .catch((error) => {
      if (controller.signal.aborted)
        throw new Error('The shift request timed out. Please try again.');
      throw error;
    })
    .finally(() => clearTimeout(timeout));
}

export async function fetchPaginatedShifts(params: {
  token: string;
  filter: 'all' | 'upcoming' | 'this_week' | 'completed';
  page: number;
  limit?: number;
  search?: string;
}) {
  const query = new URLSearchParams();
  const today = new Date();
  query.set(
    'today',
    `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`,
  );
  query.set(
    'now',
    `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}T${String(today.getHours()).padStart(2, '0')}:${String(today.getMinutes()).padStart(2, '0')}`,
  );
  query.set('filter', params.filter);
  query.set('page', String(params.page));
  query.set('limit', String(params.limit ?? 20));
  const search = params.search?.trim();
  if (search) query.set('search', search);

  const response = await request<
    PaginatedShiftsResponse | AssignmentListItem[]
  >(`/work-orders/mobile/assignments?${query.toString()}`, params.token);

  if (Array.isArray(response)) {
    const limit = params.limit ?? 20;
    const start = (params.page - 1) * limit;
    const validItems = response.filter((item): item is AssignmentListItem =>
      Boolean(item && Array.isArray(item.shifts)),
    );
    return {
      items: validItems.slice(start, start + limit),
      page: params.page,
      limit,
      total: validItems.length,
      hasMore: start + limit < validItems.length,
    };
  }

  return {
    ...response,
    items: Array.isArray(response.items)
      ? response.items.filter((item): item is AssignmentListItem =>
          Boolean(item && Array.isArray(item.shifts)),
        )
      : [],
  };
}

export async function updateAssignmentShiftConfirmation(params: {
  token: string;
  assignmentId: string;
  shiftId: string;
  status: 'confirmed' | 'declined';
}) {
  console.log('[mobile assignments] PATCH shift confirmation', {
    assignmentId: params.assignmentId,
    shiftId: params.shiftId,
    status: params.status,
  });
  const result = await request<AssignmentListItem>(
    `/work-orders/mobile/assignments/${params.assignmentId}/shifts/${params.shiftId}/confirmation`,
    params.token,
    {
      method: 'PATCH',
      body: JSON.stringify({ status: params.status }),
    },
  );
  console.log('[mobile assignments] PATCH shift confirmation result', {
    assignmentId: result.id,
    shifts: result.shifts.map((shift) => ({
      id: shift.id,
      date: shift.date,
      status: shift.confirmationStatus,
    })),
  });
  return result;
}

export async function updateAssignmentConfirmation(params: {
  token: string;
  assignmentId: string;
  status: 'confirmed' | 'declined';
}) {
  console.log('[mobile assignments] PATCH assignment confirmation', {
    assignmentId: params.assignmentId,
    status: params.status,
  });
  const result = await request<AssignmentListItem>(
    `/work-orders/mobile/assignments/${params.assignmentId}/confirmation`,
    params.token,
    {
      method: 'PATCH',
      body: JSON.stringify({ status: params.status }),
    },
  );
  console.log('[mobile assignments] PATCH assignment confirmation result', {
    assignmentId: result.id,
    shifts: result.shifts.map((shift) => ({
      id: shift.id,
      date: shift.date,
      status: shift.confirmationStatus,
    })),
  });
  return result;
}
