export type UserRole = 'admin' | 'manager' | 'scheduler' | 'viewer';

export interface UserProfile {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  roles?: string[];
  permissions?: string[];
  phone: string;
  avatarUrl: string;
  status: 'active' | 'inactive' | 'archived';
  lastLogin?: string;
  createdAt?: string;
  updatedAt?: string;
}

export type PageView =
  | 'dashboard'
  | 'scheduler'
  | 'shifts'
  | 'workorders'
  | 'workOrdersModule'
  | 'readyToBill'
  | 'itemsCatalog'
  | 'workers'
  | 'equipment'
  | 'materials'
  | 'timesheets'
  | 'forms'
  | 'clients'
  | 'incidents'
  | 'reports'
  | 'settings'
  | 'systemErrors'
  | 'profile'
  | 'availability'
  | 'projects';

export type AvailabilityType =
  'available' | 'unavailable' | 'time_off' | 'preferred';
export type AvailabilityStatus = string;

export interface AvailabilityRequest {
  id: string;
  workerId: string;
  date: string;
  endDate?: string;
  type: AvailabilityType;
  status: AvailabilityStatus;
  reason: string;
  startTime: string;
  endTime: string;
  reviewedBy?: string;
  reviewedAt?: string;
  createdAt: string;
}

export type JobStatus = string;
export type TimesheetStatus = string;
export type WorkerStatus = 'active' | 'inactive' | 'archived';
export type EquipmentStatus =
  'available' | 'assigned' | 'maintenance' | 'retired';
export type IncidentSeverity = 'low' | 'medium' | 'high' | 'critical';
export type IncidentStatus = string;

export interface WorkerCertificationAssignment {
  certificationId: string;
  expirationDate?: string;
}

export interface Skill {
  id: string;
  name: string;
  description?: string;
  status: 'active' | 'inactive';
}

export interface WorkerRole {
  id: string;
  name: string;
  description?: string;
  status: 'active' | 'inactive';
}

export interface Worker {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  driverLicense: string;
  driverLicenseExpiration?: string | null;
  primaryAddress: string;
  city: string;
  zipCode: string;
  state: string;
  country: string;
  latitude?: number | null;
  longitude?: number | null;
  type: string;
  role: string;
  workerRoles?: WorkerRole[];
  workerRoleIds?: string[];
  status: WorkerStatus;
  certifications: Certification[];
  certificationIds?: string[];
  certificationAssignments?: WorkerCertificationAssignment[];
  skills: Skill[];
  skillIds?: string[];
  fileUploads: string[];
  hireDate: string;
  hourlyRate: number;
  avatar?: string;
  emergencyContact?: string;
  notes?: string;

  createAppUser?: boolean;
  appUserPassword?: string;
  appUserRole?: UserRole;
}

export interface Certification {
  id: string;
  name: string;
  description?: string;
  status: 'active' | 'inactive';
  documentUrl?: string;
  expirationDate?: string;
  issueDate?: string;
  expiryDate?: string;
}

export interface ProjectType {
  id: string;
  name: string;
  description?: string;
  status: 'active' | 'inactive';
}

export interface Equipment {
  id: string;
  name: string;
  type: string;
  identifier: string;
  brand?: string;
  status: EquipmentStatus;
  lastMaintenance?: string;
  nextMaintenance?: string;
  notes?: string;
}

export interface Material {
  id: string;
  name: string;
  type: string;
  identifier: string;
  sku?: string;
  deletedAt?: string | null;
  brand?: string;
  price?: string | number;
  status: EquipmentStatus;
  lastMaintenance?: string;
  nextMaintenance?: string;
  notes?: string;
}

export interface Client {
  id: string;
  name: string;
  contactName: string;
  email: string;
  phone: string;
  website?: string;
  address: string;
  city: string;
  state: string;
  zipCode: string;
  country: string;
  latitude?: number | null;
  longitude?: number | null;
  status: 'active' | 'archived';
  projects?: string[];
  notes?: string;
}

export interface Project {
  id: string;
  number: string;
  name: string;
  clientId: string;
  projectTypeId: string;
  projectManager: string;
  projectManagerEmail: string;
  location: string;
  city: string;
  state: string;
  zipCode: string;
  country: string;
  latitude?: number | null;
  longitude?: number | null;

  status?: JobStatus;
  startDate: string;
  endDate: string;
  workOrderNumber?: string;
  purchaseOrder?: string;
  description?: string;
  notes?: string;
}

export interface WorkOrder {
  id: string;
  projectId: string;
  workOrderTypeId?: string;
  title: string;
  orderNumber?: string;
  status?: JobStatus;
  startDate: string;
  endDate: string;
  shifts: Shift[];
  requesterName?: string;
  contactEmail?: string;
  contactPhoneNumber?: string;

  assignmentAddress?: string;
  latitude?: number | null;
  longitude?: number | null;
  assignmentCity?: string;
  assignmentState?: string;
  assignmentZipCode?: string;

  assignmentCountry?: string;
  notes?: string;
  dispatchNote?: string;
  fileUploads?: string[];
  attachments?: string[];
  deletedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export type CommercialWorkOrderType = 'sale' | 'on_rent';
export type CommercialWorkOrderStatus =
  'draft' | 'sale_completed' | 'on_rent' | 'closed';

export interface CommercialCatalogItem {
  id: string;
  sku: string;
  description: string;
  type: string;
  dailyRate: number;
  itemPrice: number;
  unit: string;
  status: 'active' | 'inactive' | string;
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface CommercialWorkOrderItem {
  id: string;
  catalogItemId?: string;
  catalogSource?: 'commercial' | 'material' | 'equipment' | '';
  sku: string;
  description: string;
  qty?: number;
  price?: number;
  amount?: number;
  dailyRate?: number;
  unit?: string;
  notes?: string;
  onRentQty?: number;
  onRentDate?: string;
  offRentDate?: string;
  offRentQty?: number;
  remainingQty?: number;
  lossQty?: number;
  rentalDurationDays?: number;
}

export interface CommercialWorkOrder {
  id: string;
  workOrderNumber: string;
  type: CommercialWorkOrderType;
  status: CommercialWorkOrderStatus;
  parentWorkOrderId?: string | null;
  rolloverIndex?: number;
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
  workDate?: string | null;
  onRentDate?: string | null;
  originalOnRentDate?: string | null;
  previousBillingDate?: string | null;
  nextInvoiceDate?: string | null;
  offRentDate?: string | null;
  items: CommercialWorkOrderItem[];
  notes: string;
  createdBy: string;
  pdfHtml?: string;
  pdfGeneratedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface CommercialInvoiceItem {
  itemId: string;
  sku: string;
  description: string;
  onRentQty: number;
  rentalDurationDays: number;
  invoiceQty: number;
  unit: string;
  unitPrice: number;
  amount: number;
}

export interface CommercialInvoice {
  id: string;
  invoiceNumber: string;
  commercialWorkOrderId: string;
  workOrderNumber: string;
  customerName: string;
  jobName: string;
  contact?: string;
  email?: string;
  billingDate: string;
  nextInvoiceDate: string;
  amount: number;
  status: string;
  items: CommercialInvoiceItem[];
  createdBy?: string;
  pdfHtml?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface Shift {
  id: string;
  workOrderId: string;
  shiftName: string;
  shiftTemplateId?: string;
  defaultRoleStartTime?: string;
  date: string;
  displayOrder?: number;
  startTime: string;
  endTime: string;
  status?: string;
  confirmationResetReason?: 'date_changed';
  cancelled?: boolean;
  pmApprovedAt?: string;
  pmApprovedByUserId?: string;
  pmApprovedByName?: string;
  createdByUserId?: string;
  createdByName?: string;
  requesterUserId?: string | null;
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
  clientTimesheetNotes?: string;
  internalTimesheetNotes?: string;
  plannedEquipment?: PlannedShiftResource[];
  plannedMaterials?: PlannedShiftResource[];
  workOrderTypes?: string[];
  workOrderAuthorizedWorkerIds?: string[];
  roles: ShiftRole[];
}

export interface PlannedShiftResource {
  type: string;
  estimatedQuantity: number;

  materialIds?: string[];

  materialQuantities?: Record<string, number>;
}

export type ShiftWorkerConfirmationStatus =
  'pending' | 'confirmed' | 'declined';

export interface ShiftWorkerConfirmation {
  cancellationAcknowledgedAt?: string;
  workerId: string;
  status: ShiftWorkerConfirmationStatus;
  requestedAt?: string;
  respondedAt?: string;
  notificationChannel?: string;
}

export interface ShiftRole {
  id: string;
  roleName: string;
  requiredCount: number;
  startTime?: string;

  requiredCertificationIds?: string[];

  requiredSkillIds?: string[];
  assignedWorkers: string[];
  workerConfirmations?: ShiftWorkerConfirmation[];
}

export interface ShiftTemplate {
  id: string;
  name: string;
  type: 'standard' | 'on_call' | 'temporary';
  startTime?: string | null;
  endTime?: string | null;
  durationHours?: number | null;
  status: 'active' | 'inactive';
}

export interface WorkOrderType {
  id: string;
  name: string;
  description?: string;
  status: 'active' | 'inactive';
}

export type StatusCatalogScope =
  | 'work_order'
  | 'work_status'
  | 'shift'
  | 'timesheet'
  | 'project'
  | 'equipment'
  | 'material'
  | 'availability_request'
  | 'incident'
  | 'form_submission';

export interface StatusCatalogItem {
  id: string;
  scope: StatusCatalogScope;
  value: string;
  name: string;
  color: string;
  sortOrder: number;
  blocksEditing: boolean;
  triggersNotification: boolean;
  requiresApproval: boolean;
  status: 'active' | 'inactive';
}

export interface Timesheet {
  id: string;
  workerId: string;
  projectId: string;
  workOrderId: string;
  shiftId?: string;
  variant?: 'client' | 'internal';
  sourceSubmissionId?: string | null;
  manuallyEdited?: boolean;
  date: string;
  clockIn: string;
  clockOut: string;
  breakMinutes: number;
  regularHours: number;
  overtimeHours: number;
  doubleTimeHours: number;
  status: TimesheetStatus;
  approvedBy?: string;
  rejectedReason?: string;
  lunchTaken?: boolean;
  employeeNote?: string;
  signature?: string;
  notes?: string;
}

export interface FormTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  isRequired?: boolean;
  contractVersion?: string;
  fields: FormField[];
  assignedProjects: string[];
  assignedRoles: string[];
  createdAt: string;
  updatedAt: string;
}

export type FormFieldRuleSet = {
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  min?: number;
  max?: number;
  step?: number;
  integer?: boolean;
  allowMultiple?: boolean;
  maxSelections?: number;
  minDate?: string;
  maxDate?: string;
  maxPhotos?: number;
  maxFiles?: number;
  maxFileSizeMb?: number;
  acceptedMimeTypes?: string[];
  hiddenForMobileRoles?: string[];
  requiresShiftWorkOrderAccessOnMobile?: boolean;
};

export type FormFieldUiHints = {
  keyboardType?: 'default' | 'numeric' | 'email-address' | 'phone-pad';
  inputMode?: 'text' | 'decimal' | 'numeric' | 'email' | 'tel';
  section?: string;
  sectionDescription?: string;
  helperText?: string;
  layout?: 'full' | 'half';
  defaultValue?: string | number | boolean;

  lunchTakenDefault?: boolean;
  quickTags?: string[];
  tagTone?: 'blue' | 'amber' | 'slate';
  containerClassName?: string;
  labelClassName?: string;
  inputClassName?: string;
};

export type FormFieldDataBinding = {
  path: string;
  optional?: boolean;
  editable?: boolean;
};

export interface FormField {
  id: string;
  key?: string;
  label: string;
  type:
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
  required: boolean;
  options?: string[];
  placeholder?: string;
  rules?: FormFieldRuleSet;
  ui?: FormFieldUiHints;
  version?: string;

  dataBinding?: FormFieldDataBinding;
}

export interface FormSubmission {
  workOrderNumber?: string | null;
  id: string;
  templateId: string;
  projectId: string;
  workOrderId?: string;
  shiftId?: string;
  workerId: string;
  submittedAt: string;
  data: Record<string, any>;
  status: string;
  pdfUrl?: string;
}

export interface Incident {
  id: string;
  projectId: string;
  reportedBy: string;
  date: string;
  severity: IncidentSeverity;
  status: IncidentStatus;
  title: string;
  description: string;
  location: string;
  photos?: string[];
  actions?: string;
}

export interface Notification {
  id: string;
  type:
    | 'assignment'
    | 'alert'
    | 'overtime'
    | 'form'
    | 'incident'
    | 'status'
    | 'shift_chat_message';
  title: string;
  message: string;
  timestamp: string;
  read: boolean;
  link?: PageView | string;
  workerId?: string | null;
  workOrderId?: string | null;
  shiftId?: string | null;
  channel?: string | null;
  providerMessageId?: string | null;
}

export interface ActivityFeedItem {
  id: string;
  type:
    | 'work_order_status'
    | 'timesheet'
    | 'form_result'
    | 'incident'
    | 'assignment';
  title: string;
  subtitle: string;
  user: string;
  timestamp: string;
  tags?: { label: string; color: string }[];
}

export interface OvertimeRule {
  id: string;
  name: string;
  regularHoursLimit: number;
  overtimeMultiplier: number;
  doubleTimeThreshold: number;
  doubleTimeMultiplier: number;
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
  allowEarlyStart?: boolean;
  yesLunchDeductionMinimumHours?: number;
  yesLunchDeductionHours?: number;
}

export interface CompanySettings {
  name: string;
  address: string;
  phone: string;
  email: string;
  logo?: string;
  logoIcon?: string;
  overtimeRules: OvertimeRule;
  workerTypes: string[];
  equipmentTypes: string[];
  materialTypes: string[];
  workOrderTypeOptions: string[];
  jobStatuses: string[];
  workOrderPdfBuilder?: {
    version?: number;
    templateId?: string;
    fields?: Record<string, string>;
    layout?: {
      accentColor?: string;
      workerRows?: number;
      materialRows?: number;
      filenameTemplate?: string;
      labels?: Record<string, string>;
      sections?: Record<string, boolean>;
    };
    updatedAt?: string;
  };

  minimumRestHours: number;
  workOrderNumberPrefix?: string;
  workOrderNumberPadding?: number;
  workOrderNumberReset?: 'never' | 'yearly' | 'monthly';
  workOrderNumberTemplate?: string;
}

export interface FullAppData {
  settings: CompanySettings | null;
  shifts: ShiftTemplate[];
  workOrderTypes: WorkOrderType[];
  projectTypes: ProjectType[];
  statusCatalog: StatusCatalogItem[];
  certifications: Certification[];
  skills: Skill[];
  workerRoles: WorkerRole[];
  workers: Worker[];
  equipment: Equipment[];
  materials: Material[];
  clients: Client[];
  projects: Project[];
  workOrders: WorkOrder[];
  commercialCatalogItems: CommercialCatalogItem[];
  commercialInvoices: CommercialInvoice[];
  commercialWorkOrders: CommercialWorkOrder[];
  timesheets: Timesheet[];
  formTemplates: FormTemplate[];
  formSubmissions: FormSubmission[];
  incidents: Incident[];
  notifications: Notification[];
  activityFeed: ActivityFeedItem[];
  availabilityRequests: AvailabilityRequest[];
}
