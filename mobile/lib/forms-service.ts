import { requireApiBaseUrl } from './api-config';
import { apiResponseError, fetchWithFriendlyNetworkError } from './auth-errors';

export type FormFieldType =
  | 'text'
  | 'number'
  | 'dropdown'
  | 'checkbox'
  | 'signature'
  | 'photo'
  | 'attachment'
  | 'date'
  | 'textarea'
  | 'time'
  | 'timesheet'
  | 'resource_usage'
  | 'work_order_types';

export type TimesheetWorkerEntry = {
  workerId: string;
  workerName: string;
  employeeLabel?: string;
  roleNames?: string[];
  workOrderId?: string;
  projectId?: string;
  workOrderNumber?: string;
  workOrderTitle?: string;
  shiftId?: string;
  shiftDate?: string;
  singleShiftDay?: boolean;
  scheduledStartTime?: string;
  scheduledEndTime?: string;
  startTime?: string;
  endTime?: string;
  st?: number;
  ot?: number;
  dt?: number;
  total?: number;
  lunchTaken?: boolean;
  hasExistingTimesheet?: boolean;
  employeeNote?: string;
  signature?: unknown;
  status?: 'pending' | 'completed';
};

export type FormField = {
  id: string;
  key?: string;
  label: string;
  type: FormFieldType;
  required?: boolean;
  placeholder?: string;
  options?: string[];
  dataBinding?: {
    path: string;
    optional?: boolean;
    editable?: boolean;
  };
  rules?: {
    allowMultiple?: boolean;
    integer?: boolean;
    hiddenForMobileRoles?: string[];
    requiresShiftWorkOrderAccessOnMobile?: boolean;
  };
  ui?: {
    defaultValue?: string | number | boolean;
    lunchTakenDefault?: boolean;
    helperText?: string;
    quickTags?: string[];
    tagTone?: 'blue' | 'amber' | 'slate';
    section?: string;
    sectionDescription?: string;
  };
};

export type FormTemplate = {
  id: string;
  name: string;
  description?: string;
  category?: string;
  isRequired?: boolean;
  fields: FormField[];
};

export type FormContextPreview = {
  templateId: string;
  templateName: string;
  workOrderId: string;
  shiftId?: string | null;
  suggestedData: Record<string, unknown>;
  canManageWorkOrder?: boolean;
  canEditSubmittedWorkOrder?: boolean;
  resourcePlans?: {
    archivedMaterials?: { id: string; type: string; label: string; archived: boolean }[];
    equipment: {
      type: string;
      estimatedQuantity: number;
      items: { id: string; type: string; label: string }[];
    }[];
    materials: {
      type: string;
      estimatedQuantity: number;
      items: {
        id: string;
        type: string;
        label: string;
        estimatedQuantity?: number;
        archived?: boolean;
      }[];
      materialIds?: string[];
    }[];
    additionalEquipment: { id: string; type: string; label: string }[];
    additionalMaterials: { id: string; type: string; label: string; archived?: boolean }[];
    additionalMaterialTypes: string[];
  };
  workOrderTypes?: string[];
};

export type FormSubmission = {
  workOrderNumber?: string | null;
  id: string;
  templateId: string;
  projectId?: string;
  workOrderId: string;
  shiftId?: string;
  workerId?: string;
  submittedAt?: string;
  data: Record<string, unknown>;
  status: string;
  pdfUrl?: string;
};

export type MobileCompanySettings = {
  workOrderTypeOptions?: string[];
  overtimeRules?: {
    allowEarlyStart?: boolean;
    regularHoursLimit?: number;
    doubleTimeThreshold?: number;
    nightShiftPremium?: number;
    overtimeNightPremium?: number;
    doubleTimeNightPremium?: number;
    saturdayAllOvertime?: boolean;
    saturdayDoubleTimeThreshold?: number;
    sundayAllDoubleTime?: boolean;
    noLunchCreditEnabled?: boolean;
    noLunchCreditMinimumHours?: number;
    noLunchCreditHours?: number;
    noLunchCreditTarget?: 'st' | 'ot';
    noLunchCreditEffectiveDate?: string;
    yesLunchDeductionEnabled?: boolean;
    yesLunchDeductionMinimumHours?: number;
    yesLunchDeductionHours?: number;
  };
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

export async function fetchFormTemplates(params: {
  token: string;
  workOrderId: string;
  shiftId?: string;
}) {
  const query = new URLSearchParams({ workOrderId: params.workOrderId });
  if (params.shiftId) query.set('shiftId', params.shiftId);
  return request<FormTemplate[]>(
    `/form-templates?${query.toString()}`,
    params.token,
  );
}

export async function fetchCompanySettings(token: string) {
  return request<MobileCompanySettings>('/company-settings/default', token);
}

export async function fetchFormContextPreview(params: {
  token: string;
  templateId: string;
  workOrderId: string;
  shiftId?: string;
  timesheetScope?: 'own' | 'all';
}) {
  const query = new URLSearchParams({ workOrderId: params.workOrderId });
  if (params.shiftId) query.set('shiftId', params.shiftId);
  if (params.timesheetScope) query.set('timesheetScope', params.timesheetScope);
  return request<FormContextPreview>(
    `/form-templates/${encodeURIComponent(params.templateId)}/context-preview?${query.toString()}`,
    params.token,
  );
}

export async function fetchFormSubmissions(params: {
  token: string;
  workOrderId?: string;
  templateId?: string;
  shiftId?: string;
  timesheetScope?: 'own' | 'all';
}) {
  const query = new URLSearchParams();
  if (params.workOrderId) query.set('workOrderId', params.workOrderId);
  if (params.templateId) query.set('templateId', params.templateId);
  if (params.shiftId) query.set('shiftId', params.shiftId);
  if (params.timesheetScope) query.set('timesheetScope', params.timesheetScope);
  return request<FormSubmission[]>(
    `/form-submissions${query.toString() ? `?${query.toString()}` : ''}`,
    params.token,
  );
}

export async function createFormSubmission(params: {
  token: string;
  templateId: string;
  projectId?: string;
  workOrderId: string;
  shiftId?: string;
  workerId?: string;
  data: Record<string, unknown>;
  status: 'draft' | 'submitted';
}) {
  const id = `fs_mobile_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  return request<FormSubmission>('/form-submissions', params.token, {
    method: 'POST',
    body: JSON.stringify({
      id,
      templateId: params.templateId,
      projectId: params.projectId ?? '',
      workOrderId: params.workOrderId,
      shiftId: params.shiftId ?? '',
      workerId: params.workerId ?? '',
      submittedAt: new Date().toISOString(),
      data: params.data,
      status: params.status,
    }),
  });
}

export async function updateFormSubmission(params: {
  token: string;
  id: string;
  templateId: string;
  projectId?: string;
  workOrderId: string;
  shiftId?: string;
  workerId?: string;
  data: Record<string, unknown>;
  status: 'draft' | 'submitted';
}) {
  return request<FormSubmission>(
    `/form-submissions/${encodeURIComponent(params.id)}`,
    params.token,
    {
      method: 'PATCH',
      body: JSON.stringify({
        templateId: params.templateId,
        projectId: params.projectId ?? '',
        workOrderId: params.workOrderId,
        shiftId: params.shiftId ?? '',
        workerId: params.workerId ?? '',
        submittedAt: new Date().toISOString(),
        data: params.data,
        status: params.status,
      }),
    },
  );
}

/**
 * Validates server-side that the current user may reopen a submitted Work
 * Order. The edit itself is saved with `updateFormSubmission` against the same
 * submission id, so no duplicate record is created.
 */
export async function reopenFormSubmissionForEdit(params: {
  token: string;
  id: string;
  templateId: string;
  workOrderId: string;
  shiftId?: string;
}) {
  return request<{ id: string; status: string; canEdit: boolean }>(
    `/form-submissions/${encodeURIComponent(params.id)}/reopen`,
    params.token,
    {
      method: 'POST',
      body: JSON.stringify({
        templateId: params.templateId,
        workOrderId: params.workOrderId,
        shiftId: params.shiftId ?? '',
      }),
    },
  );
}
