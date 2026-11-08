import type { ShiftsFilters,ShiftsPage,ShiftsMetrics,ShiftReadDetail } from './shiftsReads';
import type { DashboardReadData, OperationsReadData, OperationsExportData } from './summaryReads';
import type { ProjectCalendarData, ProjectDetailData } from './projectViews';
import type { PayrollReport, PayrollRow } from './payrollReport';
import {
  Certification,
  Skill,
  WorkerRole,
  ProjectType,
  ShiftTemplate,
  StatusCatalogItem,
  WorkOrderType,
  Worker,
  Equipment,
  Material,
  Client,
  Project,
  Shift,
  WorkOrder,
  CommercialCatalogItem,
  CommercialInvoice,
  CommercialWorkOrder,
  Timesheet,
  FormTemplate,
  FormSubmission,
  Incident,
  Notification,
  ActivityFeedItem,
  CompanySettings,
  AvailabilityRequest,
  TimesheetStatus,
  UserProfile,
} from './types';
import { DEFAULT_ASSIGNMENT_COUNTRY } from './googlePlaceAddress';
import { io, Socket } from 'socket.io-client';
import { AUTH_MESSAGES, announceSessionExpired } from './authErrors';

const API_BASE = import.meta.env.VITE_API_URL || '';
const REALTIME_URL = import.meta.env.VITE_REALTIME_URL || API_BASE;
const API_PREFIX = '/api';
let realtimeSocket: Socket | null = null;

export class ApiRequestError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const token =
    localStorage.getItem('auth_token') || localStorage.getItem('dr_auth_token');
  const incomingHeaders =
    (options?.headers as Record<string, string> | undefined) || {};
  const isFormDataBody =
    typeof FormData !== 'undefined' && options?.body instanceof FormData;
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${API_PREFIX}${path}`, {
      cache: 'no-store',
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(isFormDataBody ? {} : { 'Content-Type': 'application/json' }),
        ...incomingHeaders,
      },
      ...options,
    });
  } catch (error) {
    if (options?.signal?.aborted) throw error;
    console.error('[API] Network request failed', { path, error });
    throw new ApiRequestError(AUTH_MESSAGES.network, 0);
  }
  options?.signal?.throwIfAborted();
  if (!res.ok) {
    let detail = '';
    try {
      const errBody = (await res.json()) as { message?: string | string[] };
      const m = errBody?.message;
      if (m) detail = Array.isArray(m) ? m.join(', ') : String(m);
    } catch {}
    options?.signal?.throwIfAborted();
    console.error('[API] Request rejected', {
      path,
      status: res.status,
      detail,
    });
    if (res.status === 401 && token) {
      announceSessionExpired();
      throw new ApiRequestError(AUTH_MESSAGES.sessionExpired, res.status);
    }
    if (res.status === 429) throw new ApiRequestError(AUTH_MESSAGES.tooManyAttempts, res.status);
    if (res.status >= 500) throw new ApiRequestError(AUTH_MESSAGES.server, res.status);
    throw new ApiRequestError(detail || AUTH_MESSAGES.server, res.status);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export function fetchShiftsPage(filters:ShiftsFilters,page:number,signal?:AbortSignal,mode='list',pages:Record<string,number>={},pageSize=25){const params=new URLSearchParams({page:String(page),limit:String(pageSize),mode,...(mode==='board'?{pages:JSON.stringify(pages)}:{})});Object.entries(filters).forEach(([key,value])=>{if(value)params.set(key,value);});return request<ShiftsPage>('/work-orders/views/shifts?'+params,{signal});}
export function fetchShiftsMetrics(signal?:AbortSignal,range:{from?:string;to?:string}={}){const params=new URLSearchParams();if(range.from)params.set('from',range.from);if(range.to)params.set('to',range.to);return request<ShiftsMetrics>('/work-orders/views/shifts/metrics?'+params,{signal});}
export function fetchShiftReadDetail(workOrderId:string,shiftId:string,signal?:AbortSignal){return request<ShiftReadDetail>('/work-orders/views/shifts/'+encodeURIComponent(workOrderId)+'/'+encodeURIComponent(shiftId)+'/detail',{signal});}
export function fetchShiftOverview() {
  return request<WorkOrder[]>('/work-orders/shifts/overview');
}

export async function exportWorkOrderPdfs(params: {
  status: 'all' | 'completed' | 'pm_approved';
  from?: string;
  to?: string;
  projectId?: string;
}) {
  const token =
    localStorage.getItem('auth_token') || localStorage.getItem('dr_auth_token');
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined) query.set(key, value);
  });
  const res = await fetch(
    `${API_BASE}${API_PREFIX}/work-orders/export/pdf?${query}`,
    {
      cache: 'no-store',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    },
  );
  if (!res.ok) {
    let message = `Could not export Work Order PDFs (HTTP ${res.status}).`;
    try {
      const body = (await res.json()) as { message?: string | string[] };
      if (body.message) {
        message = Array.isArray(body.message)
          ? body.message.join(', ')
          : body.message;
      }
    } catch {}
    throw new Error(message);
  }
  return {
    blob: await res.blob(),
    fileName:
      res.headers
        .get('Content-Disposition')
        ?.match(/filename="?([^";]+)"?/i)?.[1] ||
      (params.projectId
        ? 'work-orders-project.pdf'
        : `work-orders-${params.from}-to-${params.to}.pdf`),
    count: Number(res.headers.get('X-Work-Order-Count') || 0),
  };
}

export interface ShiftStatusCatalogItem {
  value: string;
  name: string;
  color: string;
  sortOrder: number;
  automatic: boolean;
  blocksEditing: boolean;
  triggersNotification: boolean;
  requiresApproval: boolean;
}

export interface ShiftAggregateCounters {
  totalShifts: number;
  customerPending: number;
  dispatchPending: number;
  readyToNotify: number;
  awaitingResponse: number;
  workersConfirmed: number;
  shiftCancelled: number;
  shiftCompleted: number;
  pmApproved: number;
  pending: number;
  workersMissing: number;
}

export interface ShiftStatsResponse {
  from: string | null;
  to: string | null;
  counters: ShiftAggregateCounters;
  shifts: Array<{
    workOrderId: string;
    shiftId: string;
    status: string | null;
    automatic: boolean;
  }>;
}

export function fetchShiftStatusCatalog() {
  return request<ShiftStatusCatalogItem[]>(
    '/work-orders/shifts/status-catalog',
  );
}

export function fetchShiftStats(params: { from?: string; to?: string } = {}) {
  const query = new URLSearchParams();
  if (params.from) query.set('from', params.from);
  if (params.to) query.set('to', params.to);
  const qs = query.toString();
  return request<ShiftStatsResponse>(
    `/work-orders/shifts/stats${qs ? `?${qs}` : ''}`,
  );
}

export function setShiftManualStatus(input: {
  workOrderId: string;
  shiftId: string;
  status: string;
}) {
  return request<unknown>(
    `/work-orders/shifts/${encodeURIComponent(input.workOrderId)}/${encodeURIComponent(input.shiftId)}/status`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: input.status }),
    },
  );
}

export function cancelShift(input: { workOrderId: string; shiftId: string }) {
  return request<unknown>(
    `/work-orders/shifts/${encodeURIComponent(input.workOrderId)}/${encodeURIComponent(input.shiftId)}/cancel`,
    { method: 'POST' },
  );
}

export function restoreShift(input: { workOrderId: string; shiftId: string }) {
  return request<unknown>(
    `/work-orders/shifts/${encodeURIComponent(input.workOrderId)}/${encodeURIComponent(input.shiftId)}/restore`,
    { method: 'POST' },
  );
}

export function fetchSystemUsers() {
  return request<UserProfile[]>('/users');
}

export interface PagedResult<T> {
  data: T[];
  meta: { page: number; limit: number; total: number; totalPages: number; totalItems?: number; statusCounts?: Record<string, number> };
  lookups?: { projects: Array<Pick<Project, "id" | "name">>; workOrders: Array<Pick<WorkOrder, "id" | "title" | "projectId">>; workers: Array<Pick<Worker, "id" | "firstName" | "lastName" | "email">>; submitters: Record<string, string> };
  projectCounts?: Record<string, number>;
  relatedClients?: Array<Pick<Client, 'id' | 'name'> & Partial<Client>>;
  projectMetrics?: Record<string, { workOrders: number; workers: number }>;
}
export interface CatalogFilters { search?: string; status?: string; type?: string; sort?: string; direction?: string; }
export function fetchPaged<T>(resource: string, page = 1, limit = 25, filters: CatalogFilters = {}, signal?: AbortSignal) {
  const params = new URLSearchParams({ page: String(page), limit: String(limit) });
  Object.entries(filters).forEach(([key, value]) => { if (value) params.set(key, value); });
  return request<PagedResult<T>>(`/paged/${resource === "formSubmissions" ? "form-submissions" : resource}?${params}`, { signal });
}
export function fetchDashboardRead(filters: Record<string,string>,signal?:AbortSignal) { return request<DashboardReadData>('/work-orders/views/dashboard?'+new URLSearchParams(filters),{signal}); }
export function fetchOperationsRead(filters:Record<string,string>,signal?:AbortSignal) { return request<OperationsReadData>('/timesheets/reports/operations?'+new URLSearchParams(filters),{signal}); }
export function fetchOperationsExport(filters:Record<string,string>,signal?:AbortSignal) { return request<OperationsExportData>('/timesheets/reports/operations/export?'+new URLSearchParams(filters),{signal}); }
export function fetchProjectCalendar(from: string, to: string, filters: CatalogFilters, signal?: AbortSignal) { const params = new URLSearchParams({ from, to }); Object.entries(filters).forEach(([key,value]) => { if(value) params.set(key,value); }); return request<ProjectCalendarData>('/projects/views/calendar?' + params, { signal }); }
export function fetchProjectDetail(id: string, page: number, signal?: AbortSignal, pageSize = 25) { return request<ProjectDetailData>('/projects/' + encodeURIComponent(id) + '/views/detail?page=' + page + '&limit=' + pageSize, { signal }); }
export function fetchProjectRecord(id: string, signal?: AbortSignal) { return request<Project>('/projects/' + encodeURIComponent(id), { signal }); }
export function fetchSubmissionCount(signal?: AbortSignal) { return request<{ total: number }>('/form-submissions/reports/count', { signal }); }
export function fetchSubmissionDetail(id: string, signal?: AbortSignal) { return request<FormSubmission>('/form-submissions/' + encodeURIComponent(id), { signal }); }
export function fetchPayrollReport(filters: Record<string, string>, signal?: AbortSignal) { return request<PayrollReport>('/timesheets/reports/payroll?' + new URLSearchParams(filters), { signal }); }
export function fetchPayrollExport(filters: Record<string, string>, signal?: AbortSignal) { return request<PayrollRow[]>('/timesheets/reports/payroll/export?' + new URLSearchParams(filters), { signal }); }
export function fetchTimesheetSummary(signal?: AbortSignal) {
  return request<{ pending: number }>('/paged/timesheets/summary', { signal });
}
export function fetchCatalogExport<T>(resource: string, filters: CatalogFilters, signal?: AbortSignal) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => { if (value) params.set(key, value); });
  return request<T[]>(`/paged/${resource}/export?${params}`, { signal });
}

const DEFAULT_OVERTIME_RULES = {
  id: '1',
  name: 'California Overtime',
  regularHoursLimit: 8,
  overtimeMultiplier: 1.5,
  doubleTimeThreshold: 12,
  doubleTimeMultiplier: 2.0,
  nightShiftPremium: 3,
  overtimeNightPremium: 4.5,
  doubleTimeNightPremium: 6,
  saturdayAllOvertime: true,
  saturdayDoubleTimeThreshold: 12,
  sundayAllDoubleTime: true,
  noLunchCreditEnabled: true,
  noLunchCreditMinimumHours: 7,
  noLunchCreditHours: 1,
  noLunchCreditTarget: 'ot' as const,
  noLunchCreditEffectiveDate: '2026-07-08',
};

function mapSettings(row: any): CompanySettings {
  return {
    name: row?.name || 'DR Traffic Control, LLC',
    address: row?.address || '',
    phone: row?.phone || '',
    email: row?.email || '',
    logo: row?.logo || '',
    logoIcon: row?.logoIcon || '',
    overtimeRules: {
      ...DEFAULT_OVERTIME_RULES,
      ...(row?.overtimeRules || {}),
    },
    workerTypes: row?.workerTypes || [],
    equipmentTypes: row?.equipmentTypes || [],
    materialTypes: row?.materialTypes || [],
    workOrderTypeOptions: row?.workOrderTypeOptions || [],
    jobStatuses: row?.jobStatuses || [],
    workOrderPdfBuilder:
      row?.workOrderPdfBuilder && typeof row.workOrderPdfBuilder === 'object'
        ? row.workOrderPdfBuilder
        : {
            version: 2,
            templateId: '',
            fields: {},
            layout: {
              accentColor: '#ed7376',
              workerRows: 7,
              materialRows: 13,
              filenameTemplate:
                '{projectNumber} - {projectName} - {materialTypes}',
              labels: {},
              sections: {},
            },
          },
    minimumRestHours: Number(row?.minimumRestHours ?? 8),
    workOrderNumberPrefix: row?.workOrderNumberPrefix ?? 'ASN',
    workOrderNumberPadding: Number(row?.workOrderNumberPadding ?? 4),
    workOrderNumberReset: row?.workOrderNumberReset ?? 'yearly',
    workOrderNumberTemplate:
      row?.workOrderNumberTemplate ?? '{PREFIX}-{YYYY}-{NNNN}',
  };
}

export async function fetchAllData() {
  const [
    settingsRows,
    shifts,
    workOrderTypes,
    projectTypes,
    statusCatalog,
    certifications,
    skills,
    workerRoles,
    workers,
    equipment,
    materials,
    clients,
    projects,
    workOrders,
    commercialCatalogItems,
    commercialInvoices,
    commercialWorkOrders,
    timesheets,
    formTemplates,
    formSubmissions,
    incidents,
    notifications,
    activityFeed,
    availabilityRequests,
  ] = await Promise.all([
    request<any[]>('/company-settings'),
    request<ShiftTemplate[]>('/shifts'),
    request<WorkOrderType[]>('/work-order-types'),
    request<ProjectType[]>('/project-types'),
    request<StatusCatalogItem[]>('/status-catalog'),
    request<Certification[]>('/certifications'),
    request<Skill[]>('/skills'),
    request<WorkerRole[]>('/worker-roles'),
    request<Worker[]>('/workers'),
    request<Equipment[]>('/equipment'),
    request<Material[]>('/materials'),
    request<Client[]>('/clients'),
    request<Project[]>('/projects'),
    request<WorkOrder[]>('/work-orders'),
    request<CommercialCatalogItem[]>('/commercial-catalog-items'),
    request<CommercialInvoice[]>('/commercial-work-orders/invoices'),
    request<CommercialWorkOrder[]>('/commercial-work-orders'),
    request<Timesheet[]>('/timesheets'),
    request<FormTemplate[]>('/form-templates'),
    request<FormSubmission[]>('/form-submissions'),
    request<Incident[]>('/incidents'),
    request<Notification[]>('/notifications/web/me'),
    request<ActivityFeedItem[]>('/activity-feed'),
    request<any[]>('/availability-requests'),
  ]);

  return {
    settings: settingsRows?.[0] ? mapSettings(settingsRows[0]) : null,
    shifts: shifts || [],
    workOrderTypes: workOrderTypes || [],
    projectTypes: projectTypes || [],
    statusCatalog: statusCatalog || [],
    certifications: certifications || [],
    skills: skills || [],
    workerRoles: workerRoles || [],
    workers: workers || [],
    equipment: equipment || [],
    materials: materials || [],
    clients: clients || [],
    projects: projects || [],
    workOrders: workOrders || [],
    commercialCatalogItems: commercialCatalogItems || [],
    commercialInvoices: commercialInvoices || [],
    commercialWorkOrders: commercialWorkOrders || [],
    timesheets: timesheets || [],
    formTemplates: formTemplates || [],
    formSubmissions: formSubmissions || [],
    incidents: incidents || [],
    notifications: notifications || [],
    activityFeed: activityFeed || [],
    availabilityRequests: (availabilityRequests || []).map((r: any) => ({
      id: r.id,
      workerId: r.workerId,
      date: r.date,
      endDate: r.endDate || undefined,
      type: r.type,
      status: r.status,
      reason: r.reason || '',
      startTime: r.startTime || '00:00',
      endTime: r.endTime || '23:59',
      reviewedBy: r.reviewedBy || undefined,
      reviewedAt: r.reviewedAt || undefined,
      createdAt: r.createdAt || new Date().toISOString(),
    })),
  };
}

export async function dbUpdateSettings(updates: Partial<CompanySettings>) {
  const saved = await request<any>('/company-settings/default', {
    method: 'PATCH',
    body: JSON.stringify(updates),
  });
  return mapSettings(saved);
}

export async function dbAddWorker(w: Worker) {
  return request<Worker>('/workers', {
    method: 'POST',
    body: JSON.stringify(workerPayload(w)),
  });
}

function workerPayload(worker: Partial<Worker>): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  const certificationAssignments =
    worker.certificationAssignments ||
    worker.certifications?.map((certification) => ({
      certificationId: certification.id,
      expirationDate: certification.expirationDate,
    }));
  const certificationIds =
    worker.certificationIds ||
    certificationAssignments?.map((assignment) => assignment.certificationId);
  const skillIds = worker.skillIds || worker.skills?.map((skill) => skill.id);
  const workerRoleIds =
    worker.workerRoleIds || worker.workerRoles?.map((role) => role.id);

  if (worker.id !== undefined) body.id = worker.id;
  if (worker.firstName !== undefined) body.firstName = worker.firstName;
  if (worker.lastName !== undefined) body.lastName = worker.lastName;
  if (worker.email !== undefined) body.email = worker.email;
  if (worker.phone !== undefined) body.phone = worker.phone;
  if (worker.driverLicense !== undefined) {
    body.driverLicense = worker.driverLicense;
  }
  if (worker.driverLicenseExpiration !== undefined) {
    body.driverLicenseExpiration = worker.driverLicenseExpiration || null;
  }
  if (worker.primaryAddress !== undefined) {
    body.primaryAddress = worker.primaryAddress;
  }
  if (worker.city !== undefined) body.city = worker.city;
  if (worker.zipCode !== undefined) body.zipCode = worker.zipCode;
  if (worker.state !== undefined) body.state = worker.state;
  if (worker.country !== undefined) body.country = worker.country;
  if (worker.latitude !== undefined) body.latitude = worker.latitude;
  if (worker.longitude !== undefined) body.longitude = worker.longitude;
  if (worker.type !== undefined) body.type = worker.type;
  if (worker.role !== undefined) body.role = worker.role;
  if (worker.status !== undefined) body.status = worker.status;
  if (certificationIds !== undefined) body.certificationIds = certificationIds;
  if (certificationAssignments !== undefined) {
    body.certificationAssignments = certificationAssignments;
  }
  if (skillIds !== undefined) body.skillIds = skillIds;
  if (workerRoleIds !== undefined) body.workerRoleIds = workerRoleIds;
  if (worker.fileUploads !== undefined) body.fileUploads = worker.fileUploads;
  if (worker.hireDate !== undefined) body.hireDate = worker.hireDate;
  if (worker.hourlyRate !== undefined) {
    const numericRate = Number(worker.hourlyRate);
    if (!Number.isNaN(numericRate)) body.hourlyRate = numericRate;
  }
  if (worker.avatar !== undefined) body.avatar = worker.avatar;
  if (worker.emergencyContact !== undefined) {
    body.emergencyContact = worker.emergencyContact;
  }
  if (worker.notes !== undefined) body.notes = worker.notes;
  if (worker.createAppUser === true) {
    body.createAppUser = true;
    if (worker.appUserPassword !== undefined) {
      body.appUserPassword = worker.appUserPassword;
    }
    if (worker.appUserRole !== undefined) {
      body.appUserRole = worker.appUserRole;
    }
  }
  return body;
}

function certificationPayload(
  certification: Partial<Certification>,
): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  if (certification.id !== undefined) body.id = certification.id;
  if (certification.name !== undefined) body.name = certification.name;
  if (certification.description !== undefined) {
    body.description = certification.description;
  }
  if (certification.status !== undefined) body.status = certification.status;
  if (certification.documentUrl !== undefined) {
    body.documentUrl = certification.documentUrl;
  }
  return body;
}

function skillPayload(skill: Partial<Skill>): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  if (skill.id !== undefined) body.id = skill.id;
  if (skill.name !== undefined) body.name = skill.name;
  if (skill.description !== undefined) body.description = skill.description;
  if (skill.status !== undefined) body.status = skill.status;
  return body;
}

function workerRolePayload(role: Partial<WorkerRole>): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  if (role.id !== undefined) body.id = role.id;
  if (role.name !== undefined) body.name = role.name;
  if (role.description !== undefined) body.description = role.description;
  if (role.status !== undefined) body.status = role.status;
  return body;
}

export async function dbAddShift(shift: ShiftTemplate) {
  return request('/shifts', { method: 'POST', body: JSON.stringify(shift) });
}

export async function dbUpdateShift(
  id: string,
  updates: Partial<ShiftTemplate>,
) {
  return request(`/shifts/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(updates),
  });
}

export async function dbDeleteShift(id: string) {
  return request(`/shifts/${id}`, { method: 'DELETE' });
}

export async function dbAddWorkOrderType(item: WorkOrderType) {
  return request('/work-order-types', {
    method: 'POST',
    body: JSON.stringify(item),
  });
}

export async function dbUpdateWorkOrderType(
  id: string,
  updates: Partial<WorkOrderType>,
) {
  return request(`/work-order-types/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(updates),
  });
}

export async function dbDeleteWorkOrderType(id: string) {
  return request(`/work-order-types/${id}`, { method: 'DELETE' });
}

export async function dbAddProjectType(item: ProjectType) {
  return request('/project-types', {
    method: 'POST',
    body: JSON.stringify(item),
  });
}

export async function dbUpdateProjectType(
  id: string,
  updates: Partial<ProjectType>,
) {
  return request(`/project-types/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(updates),
  });
}

export async function dbDeleteProjectType(id: string) {
  return request(`/project-types/${id}`, { method: 'DELETE' });
}

export async function dbAddStatusCatalogItem(item: StatusCatalogItem) {
  return request('/status-catalog', {
    method: 'POST',
    body: JSON.stringify(item),
  });
}

export async function dbUpdateStatusCatalogItem(
  id: string,
  updates: Partial<StatusCatalogItem>,
) {
  return request(`/status-catalog/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(updates),
  });
}

export async function dbDeleteStatusCatalogItem(id: string) {
  return request(`/status-catalog/${id}`, { method: 'DELETE' });
}

export function dbFetchWorker(id: string, signal?: AbortSignal) {
  return request<Worker>(`/workers/${encodeURIComponent(id)}`, { signal });
}

export async function dbUpdateWorker(id: string, updates: Partial<Worker>) {
  return request<Worker>(`/workers/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(workerPayload(updates)),
  });
}
export async function dbDeleteWorker(id: string) {
  return request(`/workers/${id}`, { method: 'DELETE' });
}

export type UploadedWorkerFile = {
  url: string;
  key: string;
  name: string;
  size: number;
  contentType: string;
};

export async function dbUploadWorkerFiles(files: File[], workerId?: string) {
  const formData = new FormData();
  files.forEach((file) => formData.append('files', file));
  if (workerId) formData.append('workerId', workerId);
  return request<UploadedWorkerFile[]>('/workers/uploads', {
    method: 'POST',
    body: formData,
  });
}

export async function dbDeleteWorkerFile(url: string) {
  return request<{ success: boolean }>('/workers/uploads', {
    method: 'DELETE',
    body: JSON.stringify({ url }),
  });
}

export async function dbAddCertification(item: Certification) {
  return request('/certifications', {
    method: 'POST',
    body: JSON.stringify(certificationPayload(item)),
  });
}

export async function dbUpdateCertification(
  id: string,
  updates: Partial<Certification>,
) {
  return request(`/certifications/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(certificationPayload(updates)),
  });
}

export async function dbDeleteCertification(id: string) {
  return request(`/certifications/${id}`, { method: 'DELETE' });
}

export async function dbAddSkill(item: Skill) {
  return request('/skills', {
    method: 'POST',
    body: JSON.stringify(skillPayload(item)),
  });
}

export async function dbUpdateSkill(id: string, updates: Partial<Skill>) {
  return request(`/skills/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(skillPayload(updates)),
  });
}

export async function dbDeleteSkill(id: string) {
  return request(`/skills/${id}`, { method: 'DELETE' });
}

export async function dbAddWorkerRole(item: WorkerRole) {
  return request('/worker-roles', {
    method: 'POST',
    body: JSON.stringify(workerRolePayload(item)),
  });
}

export async function dbUpdateWorkerRole(
  id: string,
  updates: Partial<WorkerRole>,
) {
  return request(`/worker-roles/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(workerRolePayload(updates)),
  });
}

export async function dbDeleteWorkerRole(id: string) {
  return request(`/worker-roles/${id}`, { method: 'DELETE' });
}

export type UploadedCertificationFile = {
  url: string;
  key: string;
  name: string;
  size: number;
  contentType: string;
};

export async function dbUploadCertificationDocument(
  file: File,
  certificationId?: string,
) {
  const formData = new FormData();
  formData.append('files', file);
  if (certificationId) formData.append('certificationId', certificationId);
  return request<UploadedCertificationFile[]>('/certifications/uploads', {
    method: 'POST',
    body: formData,
  });
}

export async function dbDeleteCertificationDocument(url: string) {
  return request<{ success: boolean }>('/certifications/uploads', {
    method: 'DELETE',
    body: JSON.stringify({ url }),
  });
}

export async function dbAddEquipment(e: Equipment) {
  return request('/equipment', { method: 'POST', body: JSON.stringify(e) });
}
export async function dbUpdateEquipment(
  id: string,
  updates: Partial<Equipment>,
) {
  return request(`/equipment/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(updates),
  });
}
export async function dbDeleteEquipment(id: string) {
  return request<{ success: boolean }>(`/equipment/${id}`, {
    method: 'DELETE',
  });
}

export async function dbAddMaterial(material: Material) {
  return request('/materials', {
    method: 'POST',
    body: JSON.stringify(material),
  });
}

export async function dbFetchMaterial(id: string) {
  return request<Material>(`/materials/${encodeURIComponent(id)}`);
}

export async function dbUpdateMaterial(id: string, updates: Partial<Material>) {
  return request(`/materials/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(updates),
  });
}

export async function dbDeleteMaterial(id: string) {
  return request<{ success: boolean }>(`/materials/${id}`, {
    method: 'DELETE',
  });
}

export async function dbDeleteMaterials(ids: string[]) {
  return request<{ success: boolean; deletedCount: number }>('/materials/bulk-delete', {
    method: 'POST',
    body: JSON.stringify({ ids }),
  });
}

export async function dbAddClient(c: Client) {
  return request('/clients', { method: 'POST', body: JSON.stringify(c) });
}
export async function dbUpdateClient(id: string, updates: Partial<Client>) {
  return request(`/clients/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(updates),
  });
}

export async function dbAddProject(p: Project) {
  return request('/projects', { method: 'POST', body: JSON.stringify(p) });
}
export async function dbUpdateProject(
  id: string,
  updates: Partial<Project>,
): Promise<Project> {
  return request<Project>(`/projects/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(updates),
  });
}

function workOrderCreatePayload(wo: WorkOrder): Record<string, unknown> {
  const body: Record<string, unknown> = {
    id: wo.id,
    title: wo.title,
    shifts: wo.shifts as unknown[],
  };
  if (wo.projectId !== undefined && wo.projectId !== '')
    body.projectId = wo.projectId;
  if (wo.workOrderTypeId) body.workOrderTypeId = wo.workOrderTypeId;
  if (wo.orderNumber !== undefined && wo.orderNumber !== '')
    body.orderNumber = wo.orderNumber;
  if (wo.startDate) body.startDate = wo.startDate;
  if (wo.endDate) body.endDate = wo.endDate;
  if (wo.requesterName !== undefined)
    body.requesterName = wo.requesterName ?? '';
  if (wo.contactEmail !== undefined) body.contactEmail = wo.contactEmail ?? '';
  if (wo.contactPhoneNumber !== undefined)
    body.contactPhoneNumber = wo.contactPhoneNumber ?? '';
  if (wo.assignmentAddress !== undefined)
    body.assignmentAddress = (wo.assignmentAddress ?? '').trim();
  if (wo.latitude !== undefined && wo.latitude !== null)
    body.latitude = wo.latitude;
  if (wo.longitude !== undefined && wo.longitude !== null)
    body.longitude = wo.longitude;
  if (wo.assignmentCity !== undefined)
    body.assignmentCity = (wo.assignmentCity ?? '').trim();
  if (wo.assignmentState !== undefined)
    body.assignmentState = (wo.assignmentState ?? '').trim();
  if (wo.assignmentZipCode !== undefined)
    body.assignmentZipCode = (wo.assignmentZipCode ?? '').trim();
  if (wo.assignmentCountry !== undefined) {
    body.assignmentCountry =
      (wo.assignmentCountry ?? '').trim() || DEFAULT_ASSIGNMENT_COUNTRY;
  }
  if (wo.notes !== undefined) body.notes = wo.notes ?? '';
  if (wo.dispatchNote !== undefined) body.dispatchNote = wo.dispatchNote ?? '';
  if (wo.fileUploads && wo.fileUploads.length > 0)
    body.fileUploads = wo.fileUploads;
  if (wo.attachments && wo.attachments.length > 0)
    body.attachments = wo.attachments;
  return body;
}

const WORK_ORDER_PATCH_KEYS = [
  'projectId',
  'workOrderTypeId',
  'title',
  'orderNumber',
  'status',
  'startDate',
  'endDate',
  'shifts',
  'requesterName',
  'contactEmail',
  'contactPhoneNumber',
  'assignmentAddress',
  'latitude',
  'longitude',
  'assignmentCity',
  'assignmentState',
  'assignmentZipCode',
  'assignmentCountry',
  'notes',
  'dispatchNote',
  'fileUploads',
  'attachments',
] as const;

function workOrderPatchPayload(
  updates: Partial<WorkOrder>,
): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  for (const key of WORK_ORDER_PATCH_KEYS) {
    const v = updates[key];
    if (v !== undefined) body[key] = v;
  }
  return body;
}

export async function dbAddWorkOrder(wo: WorkOrder) {
  return request<WorkOrder>('/work-orders', {
    method: 'POST',
    body: JSON.stringify(workOrderCreatePayload(wo)),
  });
}

export async function dbUpdateWorkOrder(
  id: string,
  updates: Partial<WorkOrder> & { changedShiftIds?: string[] },
): Promise<WorkOrder | undefined> {
  const patch = workOrderPatchPayload(updates);
  if (updates.changedShiftIds !== undefined) patch.changedShiftIds = updates.changedShiftIds;
  if (Object.keys(patch).length === 0) return undefined;
  return request<WorkOrder>(`/work-orders/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
}

export async function dbUpdateWorkOrderShiftDetail(
  workOrderId: string,
  shiftId: string,
  shift: Shift,
): Promise<WorkOrder> {
  return request<WorkOrder>(
    `/work-orders/${encodeURIComponent(workOrderId)}/shifts/${encodeURIComponent(shiftId)}/detail`,
    {
      method: 'PATCH',
      body: JSON.stringify({ shift }),
    },
  );
}

export async function approveWorkOrderShift(
  workOrderId: string,
  shiftId: string,
) {
  return request<Shift>(
    `/work-orders/shifts/${encodeURIComponent(workOrderId)}/${encodeURIComponent(shiftId)}/pm-approve`,
    { method: 'POST' },
  );
}

export async function reopenWorkOrderShift(
  workOrderId: string,
  shiftId: string,
) {
  return request<Shift>(
    `/work-orders/shifts/${encodeURIComponent(workOrderId)}/${encodeURIComponent(shiftId)}/reopen`,
    { method: 'POST' },
  );
}

export type BulkShiftRolePayload = {
  roleName: string;
  requiredCount: number;
  startTime?: string;
  requiredCertificationIds?: string[];
  requiredSkillIds?: string[];
  assignedWorkers?: string[];
};

export type BulkCreateShiftsPayload = {
  shiftName: string;
  baseDate: string;
  dates: string[];
  startTime: string;
  endTime: string;
  status?: string;
  createdByUserId?: string;
  requesterUserId?: string;
  address?: string;
  crossStreetLocationDetail?: string;
  addressLatitude?: number | null;
  addressLongitude?: number | null;
  addressCity?: string;
  addressState?: string;
  addressZipCode?: string;
  addressCountry?: string;
  requesterName?: string;
  requesterPhone?: string;
  requesterEmail?: string;
  visibleDocumentTypes?: string[];
  formTemplateIds?: string[];
  notes?: string;
  plannedEquipment?: Array<{ type: string; estimatedQuantity: number }>;
  plannedMaterials?: Array<{
    type: string;
    estimatedQuantity: number;
    materialIds?: string[];
    materialQuantities?: Record<string, number>;
  }>;
  workOrderTypes?: string[];
  workOrderAuthorizedWorkerIds?: string[];
  shiftTemplateId?: string;
  defaultRoleStartTime?: string;
  roles: BulkShiftRolePayload[];
  skipDuplicates?: boolean;
};

export async function dbBulkCreateShifts(
  workOrderId: string,
  payload: BulkCreateShiftsPayload,
): Promise<{
  workOrder: WorkOrder;
  created: WorkOrder['shifts'];
  skipped: string[];
}> {
  return request(`/work-orders/${workOrderId}/shifts/bulk-create`, {
    method: 'POST',
    body: JSON.stringify({
      ...payload,

      roles: payload.roles.map((role) => ({
        roleName: role.roleName,
        requiredCount: role.requiredCount,
        startTime: role.startTime,
        requiredCertificationIds: role.requiredCertificationIds,
        requiredSkillIds: role.requiredSkillIds,
        assignedWorkers: role.assignedWorkers,
      })),
    }),
  });
}
export async function dbDeleteWorkOrder(id: string) {
  return request<{ success: boolean; trashed: boolean }>(`/work-orders/${id}`, {
    method: 'DELETE',
  });
}

export async function dbFetchTrashedWorkOrders() {
  return request<WorkOrder[]>('/work-orders/trash');
}

export async function dbRestoreWorkOrder(id: string) {
  return request<WorkOrder>(`/work-orders/trash/${id}/restore`, {
    method: 'PATCH',
  });
}

export type UploadedWorkOrderFile = {
  url: string;
  key: string;
  name: string;
  size: number;
  contentType: string;
};

export async function dbUploadLogo(file: File) {
  const formData = new FormData();
  formData.append('file', file);
  return request<{ url: string }>('/company-settings/logo-upload', {
    method: 'POST',
    body: formData,
  });
}

export async function dbUploadLogoIcon(file: File) {
  const formData = new FormData();
  formData.append('file', file);
  return request<{ url: string }>('/company-settings/logo-icon-upload', {
    method: 'POST',
    body: formData,
  });
}

export async function dbUploadWorkOrderFiles(
  files: File[],
  workOrderId?: string,
) {
  const formData = new FormData();
  files.forEach((file) => formData.append('files', file));
  if (workOrderId) formData.append('workOrderId', workOrderId);
  return request<UploadedWorkOrderFile[]>('/work-orders/uploads', {
    method: 'POST',
    body: formData,
  });
}

export async function dbDeleteWorkOrderFile(url: string) {
  return request<{ success: boolean }>('/work-orders/uploads', {
    method: 'DELETE',
    body: JSON.stringify({ url }),
  });
}

export type CommercialWorkOrderPayload = Omit<
  Partial<CommercialWorkOrder>,
  'createdAt' | 'updatedAt' | 'pdfHtml' | 'pdfGeneratedAt'
> & {
  type: 'sale' | 'on_rent';
  jobName: string;
  customerName: string;
  items: CommercialWorkOrder['items'];
};

export async function dbAddCommercialWorkOrder(
  payload: CommercialWorkOrderPayload,
) {
  return request<CommercialWorkOrder>('/commercial-work-orders', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function dbUpdateCommercialWorkOrder(
  id: string,
  payload: Partial<CommercialWorkOrderPayload>,
) {
  return request<CommercialWorkOrder>(`/commercial-work-orders/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export async function dbFetchCommercialWorkOrderPdf(id: string) {
  const token =
    localStorage.getItem('auth_token') || localStorage.getItem('dr_auth_token');
  const res = await fetch(
    `${API_BASE}${API_PREFIX}/commercial-work-orders/${id}/pdf`,
    {
      cache: 'no-store',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    },
  );
  if (!res.ok)
    throw new Error(`API error ${res.status} on commercial work order PDF`);
  return res.blob();
}

export async function dbPreviewWorkOrderPdfBuilder(
  config: NonNullable<CompanySettings['workOrderPdfBuilder']>,
) {
  const token =
    localStorage.getItem('auth_token') || localStorage.getItem('dr_auth_token');
  const res = await fetch(
    `${API_BASE}${API_PREFIX}/form-submissions/pdf-builder/preview`,
    {
      method: 'POST',
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ config }),
    },
  );
  if (!res.ok)
    throw new Error(`API error ${res.status} on PDF Builder preview`);
  return res.blob();
}

export async function dbRegenerateFormSubmissionPdf(id: string) {
  return request<FormSubmission>(
    `/form-submissions/${encodeURIComponent(id)}/regenerate-pdf`,
    { method: 'POST' },
  );
}

export async function dbEmailWorkOrderPdf(
  workOrderId: string,
  submissionId: string,
  expectedEmail: string,
) {
  return request<{ success: boolean; recipient: string }>(
    `/work-orders/${encodeURIComponent(workOrderId)}/submissions/${encodeURIComponent(submissionId)}/email`,
    { method: 'POST', body: JSON.stringify({ expectedEmail }) },
  );
}

export async function dbUpdateFormSubmission(
  id: string,
  updates: Partial<FormSubmission>,
): Promise<FormSubmission> {
  return request<FormSubmission>(
    `/form-submissions/${encodeURIComponent(id)}`,
    {
      method: 'PATCH',
      body: JSON.stringify(updates),
    },
  );
}

export async function dbProcessCommercialWorkOrderOffRent(
  id: string,
  payload: {
    offRentDate: string;
    notes?: string;
    items: Array<{ itemId: string; offRentQty: number; lossQty?: number }>;
  },
) {
  return request<{
    original: CommercialWorkOrder;
    rollover: CommercialWorkOrder | null;
    summary: {
      totalOriginal: number;
      totalReturned: number;
      totalRemaining: number;
      totalLoss: number;
    };
  }>(`/commercial-work-orders/${id}/off-rent`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export type CommercialCatalogItemPayload = Omit<
  Partial<CommercialCatalogItem>,
  'createdAt' | 'updatedAt'
> & {
  sku: string;
  description: string;
  dailyRate: number;
  unit: string;
  status: string;
};

export async function dbAddCommercialCatalogItem(
  payload: CommercialCatalogItemPayload,
) {
  return request<CommercialCatalogItem>('/commercial-catalog-items', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function dbUpdateCommercialCatalogItem(
  id: string,
  payload: Partial<CommercialCatalogItemPayload>,
) {
  return request<CommercialCatalogItem>(`/commercial-catalog-items/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export async function dbDeleteCommercialCatalogItem(id: string) {
  return request(`/commercial-catalog-items/${id}`, { method: 'DELETE' });
}

export async function dbGenerateCommercialInvoice(
  workOrderId: string,
  payload: { billingDate: string; createdBy?: string; itemIds?: string[] },
) {
  return request<CommercialInvoice>(
    `/commercial-work-orders/${workOrderId}/invoices`,
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
  );
}

export async function dbFetchCommercialInvoicePdf(id: string) {
  const token =
    localStorage.getItem('auth_token') || localStorage.getItem('dr_auth_token');
  const res = await fetch(
    `${API_BASE}${API_PREFIX}/commercial-work-orders/invoices/${id}/pdf`,
    {
      cache: 'no-store',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    },
  );
  if (!res.ok)
    throw new Error(`API error ${res.status} on commercial invoice PDF`);
  return res.blob();
}

export async function dbAddTimesheet(t: Timesheet) {
  return request('/timesheets', { method: 'POST', body: JSON.stringify(t) });
}

export async function fetchShiftTimesheets(
  workOrderId: string,
  shiftId: string,
) {
  return request<Timesheet[]>(
    `/timesheets/shift/${encodeURIComponent(workOrderId)}/${encodeURIComponent(shiftId)}`,
  );
}

export async function dbUpdateTimesheet(
  id: string,
  updates: Partial<Timesheet>,
) {
  return request<Timesheet>(`/timesheets/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(updates),
  });
}

export async function dbUpdateTimesheetStatus(
  id: string,
  status: TimesheetStatus,
  reason?: string,
) {
  return request(`/timesheets/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ status, rejectedReason: reason }),
  });
}

export async function dbAddFormTemplate(ft: FormTemplate) {
  const { createdAt, updatedAt, ...payload } = ft;
  return request('/form-templates', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}
export async function dbUpdateFormTemplate(
  id: string,
  updates: Partial<FormTemplate>,
) {
  const { createdAt, updatedAt, ...payload } = updates;
  return request(`/form-templates/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export async function dbDeleteFormTemplate(id: string) {
  return request(`/form-templates/${id}`, {
    method: 'DELETE',
  });
}

export async function dbDeleteFormSubmission(id: string) {
  return request(`/form-submissions/${id}`, {
    method: 'DELETE',
  });
}

export type FormDataBindingPathItem = {
  path: string;
  description: string;
  requiresShift: boolean;
  example?: string;
};

export async function dbFetchFormDataBindings() {
  return request<{
    contractVersion: string;
    notes?: string[];
    paths: FormDataBindingPathItem[];
  }>('/form-contract/data-bindings');
}

export type FormContextFieldPreview = {
  fieldId: string;
  bindingPath?: string | null;
  resolved: boolean;
  value: unknown;
  hint?: string;
};

export async function dbFetchFormContextPreview(
  templateId: string,
  workOrderId: string,
  shiftId?: string,
) {
  const q = new URLSearchParams({ workOrderId });
  if (shiftId) q.set('shiftId', shiftId);
  return request<{
    templateId: string;
    templateName: string;
    contractVersion: string;
    workOrderId: string;
    shiftId: string | null;
    fieldPreviews: FormContextFieldPreview[];
    suggestedData: Record<string, unknown>;
  }>(
    `/form-templates/${encodeURIComponent(templateId)}/context-preview?${q.toString()}`,
  );
}

export async function dbMarkNotificationRead(id: string) {
  return request(`/notifications/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ read: true }),
  });
}
export async function dbMarkAllNotificationsRead() {
  const notifications = await request<Notification[]>('/notifications/web/me');
  await Promise.all(
    notifications
      .filter((n) => !n.read)
      .map((n) =>
        request(`/notifications/${n.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ read: true }),
        }),
      ),
  );
  return { success: true };
}

export async function dbAddActivityFeedItem(item: ActivityFeedItem) {
  return request('/activity-feed', {
    method: 'POST',
    body: JSON.stringify(item),
  });
}

export async function dbAddFormSubmission(fs: FormSubmission) {
  return request<FormSubmission>('/form-submissions', {
    method: 'POST',
    body: JSON.stringify(fs),
  });
}

export async function dbAddIncident(incident: Incident) {
  return request('/incidents', {
    method: 'POST',
    body: JSON.stringify(incident),
  });
}

export async function dbUpdateIncident(id: string, updates: Partial<Incident>) {
  return request(`/incidents/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(updates),
  });
}

export async function dbAddAvailabilityRequest(requestData: any) {
  return request('/availability-requests', {
    method: 'POST',
    body: JSON.stringify(requestData),
  });
}

export async function dbUpdateAvailabilityRequest(
  id: string,
  updates: Record<string, unknown>,
) {
  return request(`/availability-requests/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(updates),
  });
}

export async function fetchTable<T>(resource: string, signal?: AbortSignal): Promise<T[]> {
  return request<T[]>(`/${resource}`, { signal });
}

export async function fetchCompanySettings(signal?: AbortSignal) {
  const rows = await fetchTable<unknown>('company-settings', signal);
  return rows[0] ? mapSettings(rows[0]) : null;
}

export async function fetchAvailabilityRequests(signal?: AbortSignal): Promise<AvailabilityRequest[]> {
  const rows = await fetchTable<AvailabilityRequest>('availability-requests', signal);
  return rows.map((r) => ({
    ...r,
    endDate: r.endDate || undefined,
    reason: r.reason || '',
    startTime: r.startTime || '00:00',
    endTime: r.endTime || '23:59',
    reviewedBy: r.reviewedBy || undefined,
    reviewedAt: r.reviewedAt || undefined,
    createdAt: r.createdAt || new Date().toISOString(),
  }));
}

export function subscribeToChanges(callbacks: {
  onConnect?: () => void;
  onDisconnect?: () => void;
  onSettings?: () => void;
  onShifts?: () => void;
  onWorkOrderTypes?: () => void;
  onProjectTypes?: () => void;
  onStatusCatalog?: () => void;
  onCertifications?: () => void;
  onSkills?: () => void;
  onWorkerRoles?: () => void;
  onWorkers?: () => void;
  onEquipment?: () => void;
  onMaterials?: () => void;
  onWorkOrders?: () => void;
  onCommercialCatalogItems?: () => void;
  onCommercialInvoices?: () => void;
  onCommercialWorkOrders?: () => void;
  onTimesheets?: () => void;
  onNotifications?: () => void;
  onProjects?: () => void;
  onClients?: () => void;
  onFormTemplates?: () => void;
  onFormSubmissions?: () => void;
  onIncidents?: () => void;
  onActivityFeed?: () => void;
  onAvailabilityRequests?: () => void;
}) {
  if (!realtimeSocket) {
    realtimeSocket = io(`${REALTIME_URL}/realtime`, {
      transports: ['websocket', 'polling'],
    });
  }

  const handler = (payload: { table?: string }) => {
    switch (payload?.table) {
      case 'company_settings':
        callbacks.onSettings?.();
        break;
      case 'shifts':
        callbacks.onShifts?.();
        break;
      case 'work_order_types':
        callbacks.onWorkOrderTypes?.();
        break;
      case 'project_types':
        callbacks.onProjectTypes?.();
        break;
      case 'status_catalog':
        callbacks.onStatusCatalog?.();
        break;
      case 'certifications':
        callbacks.onCertifications?.();
        break;
      case 'skills':
        callbacks.onSkills?.();
        break;
      case 'worker_roles':
        callbacks.onWorkerRoles?.();
        break;
      case 'workers':
        callbacks.onWorkers?.();
        break;
      case 'equipment':
        callbacks.onEquipment?.();
        break;
      case 'materials':
        callbacks.onMaterials?.();
        break;
      case 'work_orders':
        callbacks.onWorkOrders?.();
        break;
      case 'commercial_catalog_items':
        callbacks.onCommercialCatalogItems?.();
        break;
      case 'commercial_invoices':
        callbacks.onCommercialInvoices?.();
        break;
      case 'commercial_work_orders':
        callbacks.onCommercialWorkOrders?.();
        break;
      case 'timesheets':
        callbacks.onTimesheets?.();
        break;
      case 'notifications':
        callbacks.onNotifications?.();
        break;
      case 'projects':
        callbacks.onProjects?.();
        break;
      case 'clients':
        callbacks.onClients?.();
        break;
      case 'form_templates':
        callbacks.onFormTemplates?.();
        break;
      case 'form_submissions':
        callbacks.onFormSubmissions?.();
        break;
      case 'incidents':
        callbacks.onIncidents?.();
        break;
      case 'activity_feed':
        callbacks.onActivityFeed?.();
        break;
      case 'availability_requests':
        callbacks.onAvailabilityRequests?.();
        break;
      default:
        callbacks.onShifts?.();
        callbacks.onWorkOrderTypes?.();
        callbacks.onProjectTypes?.();
        callbacks.onStatusCatalog?.();
        callbacks.onCertifications?.();
        callbacks.onSkills?.();
        callbacks.onWorkerRoles?.();
        callbacks.onWorkers?.();
        callbacks.onEquipment?.();
        callbacks.onMaterials?.();
        callbacks.onWorkOrders?.();
        callbacks.onCommercialCatalogItems?.();
        callbacks.onCommercialInvoices?.();
        callbacks.onCommercialWorkOrders?.();
        callbacks.onTimesheets?.();
        callbacks.onNotifications?.();
        callbacks.onProjects?.();
        callbacks.onClients?.();
        callbacks.onFormTemplates?.();
        callbacks.onFormSubmissions?.();
        callbacks.onIncidents?.();
        callbacks.onActivityFeed?.();
        callbacks.onAvailabilityRequests?.();
    }
  };

  const connected = () => callbacks.onConnect?.();
  const disconnected = () => callbacks.onDisconnect?.();
  realtimeSocket.on('connect', connected);
  realtimeSocket.on('disconnect', disconnected);
  if (realtimeSocket.connected) connected();
  realtimeSocket.on('table-updated', handler);
  return () => {
    realtimeSocket?.off('table-updated', handler);
    realtimeSocket?.off('connect', connected);
    realtimeSocket?.off('disconnect', disconnected);
    if (realtimeSocket && !realtimeSocket.hasListeners('table-updated')) {
      realtimeSocket.disconnect();
      realtimeSocket = null;
    }
  };
}

export type CatalogScope =
  | 'certifications'
  | 'clients'
  | 'commercial-catalog-items'
  | 'equipment'
  | 'materials'
  | 'project-types'
  | 'projects'
  | 'skills'
  | 'status-catalog'
  | 'work-order-types'
  | 'worker-roles'
  | 'workers';

export type CatalogImportRowError = {
  row: number;
  field?: string;
  code: string;
  message: string;
};

export type CatalogImportParsedRow = {
  row: number;
  raw: Record<string, unknown>;
  data: Record<string, unknown> | null;
  errors: CatalogImportRowError[];
  action?: 'create' | 'update' | 'skip';
  match?: { id?: string; field?: string };
};

export type CatalogImportPreview = {
  scope: CatalogScope;
  headers: string[];
  total: number;
  valid: number;
  invalid: number;
  rows: CatalogImportParsedRow[];
  sample: CatalogImportParsedRow[];
};

export type CatalogImportApply = {
  scope: CatalogScope;
  mode: 'create' | 'upsert';
  total: number;
  created: number;
  updated: number;
  skipped: number;
  errors: CatalogImportRowError[];
  durationMs: number;
  jobId?: string;
};

export type CatalogImportJob = {
  id: string;
  scope: CatalogScope;
  mode: 'create' | 'upsert';
  filename: string;
  status: 'queued' | 'running' | 'done' | 'error';
  startedAt: string;
  finishedAt?: string;
  progress: { processed: number; total: number };
  result?: CatalogImportApply;
  error?: string;
};

export async function dbImportCatalogPreview(
  scope: CatalogScope,
  file: File,
): Promise<CatalogImportPreview> {
  const formData = new FormData();
  formData.append('file', file);
  return request<CatalogImportPreview>(`/catalog-import/${scope}/preview`, {
    method: 'POST',
    body: formData,
  });
}

export async function dbImportCatalogApply(
  scope: CatalogScope,
  file: File,
  options: { mode?: 'create' | 'upsert'; dryRun?: boolean } = {},
): Promise<CatalogImportApply> {
  const formData = new FormData();
  formData.append('file', file);
  if (options.mode) formData.append('mode', options.mode);
  if (options.dryRun) formData.append('dryRun', 'true');
  return request<CatalogImportApply>(`/catalog-import/${scope}/apply`, {
    method: 'POST',
    body: formData,
  });
}

export async function dbImportCatalogApplyAsync(
  scope: CatalogScope,
  file: File,
  options: { mode?: 'create' | 'upsert' } = {},
): Promise<CatalogImportJob> {
  const formData = new FormData();
  formData.append('file', file);
  if (options.mode) formData.append('mode', options.mode);
  return request<CatalogImportJob>(`/catalog-import/${scope}/apply-async`, {
    method: 'POST',
    body: formData,
  });
}

export async function dbGetCatalogImportJob(
  jobId: string,
): Promise<CatalogImportJob> {
  return request<CatalogImportJob>(`/catalog-import/jobs/${jobId}`);
}

export async function dbDownloadCatalogTemplate(
  scope: CatalogScope,
): Promise<Blob> {
  const token =
    localStorage.getItem('auth_token') || localStorage.getItem('dr_auth_token');
  const res = await fetch(
    `${API_BASE}${API_PREFIX}/catalog-import/${scope}/template`,
    {
      cache: 'no-store',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    },
  );
  if (!res.ok) {
    throw new Error(`API error ${res.status} fetching template for ${scope}`);
  }
  return res.blob();
}

export async function dbPreviewNextWorkOrderNumber() {
  return request<{
    number: string;
    config: {
      prefix: string;
      padding: number;
      reset: string;
      template: string;
    };
  }>('/numbering/work-orders/preview');
}

export function fetchScheduleSubmissionIndex(signal?: AbortSignal) {
  return request<Pick<FormSubmission, 'id' | 'workOrderId' | 'shiftId' | 'templateId' | 'status'>[]>('/form-submissions/views/schedule-index', { signal });
}
export function fetchAssignmentDocuments(workOrderId: string, signal?: AbortSignal) {
  return request<Omit<FormSubmission, 'data'>[]>('/form-submissions/views/assignment/' + encodeURIComponent(workOrderId), { signal });
}

export function fetchScheduleAssignmentScope(from: string, to: string, signal?: AbortSignal) { return request<{readOnly:true;data:(WorkOrder & {latestShiftTimestamp?:string})[]}>('/work-orders/views/assignments/schedule-scope?'+new URLSearchParams({from,to}),{signal}); }
export async function fetchCompleteAssignmentRecords(ids:string[],signal?:AbortSignal) {
  const batches: string[][] = [];
  for (let index = 0; index < ids.length; index += 32) batches.push(ids.slice(index, index + 32));
  const records = await Promise.all(batches.map(batch => request<WorkOrder[]>('/work-orders/views/assignments/records?' + new URLSearchParams({ids:JSON.stringify(batch)}), {signal})));
  return records.flat();
}
export function fetchAssignmentPage(filters:Record<string,string>,page:number,signal?:AbortSignal,pageSize=25) { return request<PagedResult<WorkOrder>>('/work-orders/views/assignments/page?'+new URLSearchParams({...filters,page:String(page),limit:String(pageSize)}),{signal}); }
export function fetchAssignmentRecord(id:string,signal?:AbortSignal) {return request<WorkOrder>('/work-orders/views/assignments/record/'+encodeURIComponent(id),{signal});}
export function fetchAssignmentConflictIndex(signal?:AbortSignal){return request<{readOnly:true;data:WorkOrder[]}>('/work-orders/views/assignments/conflict-index',{signal});}

export function fetchAssignmentForShift(shiftId:string,signal?:AbortSignal){return request<WorkOrder>('/work-orders/views/assignments/shift-record/'+encodeURIComponent(shiftId),{signal});}
