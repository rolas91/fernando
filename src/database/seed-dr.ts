import * as bcrypt from 'bcrypt';
import { NestFactory } from '@nestjs/core';
import { DataSource } from 'typeorm';
import { AppModule } from '../app.module';
import { ensureRuntimeEnv } from '../config/ensure-env';
import { CompanySettings } from '../entities/company-settings.entity';
import { FormTemplate } from '../entities/form-template.entity';
import { Shift } from '../entities/shift.entity';
import { StatusCatalog } from '../entities/status-catalog.entity';
import { User } from '../entities/user.entity';
import { WorkerRole } from '../entities/worker-role.entity';
import { WorkOrderType } from '../entities/work-order-type.entity';
import { AccessService } from '../modules/access/services/access.service';
import { normalizeFormFields } from '../modules/operations/utils/form-contract.util';

const SALT_ROUNDS = 10;

type Role = 'admin' | 'manager' | 'scheduler' | 'viewer';

type SeedUser = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  role: Role;
  password: string;
};

const DEFAULT_SETTINGS: Pick<
  CompanySettings,
  | 'id'
  | 'name'
  | 'address'
  | 'phone'
  | 'email'
  | 'logo'
  | 'overtimeRules'
  | 'workerTypes'
  | 'equipmentTypes'
  | 'materialTypes'
  | 'jobStatuses'
> = {
  id: 'default',
  name: 'DR Traffic Control, LLC',
  address: '1366 Palou Ave, Unit A, San Francisco, CA 94124',
  phone: '415-641-4416',
  email: 'info@drtrafficcontrol.com',
  logo: null,
  overtimeRules: {
    id: '1',
    name: 'California Overtime',
    regularHoursLimit: 8,
    overtimeMultiplier: 1.5,
    doubleTimeThreshold: 12,
    doubleTimeMultiplier: 2.0,
    noLunchCreditEnabled: true,
    noLunchCreditMinimumHours: 7,
    noLunchCreditHours: 1,
  },
  workerTypes: [
    'Full-Time Employee',
    'Part-Time Employee',
    'Temporary / Seasonal',
    'Subcontractor',
  ],
  equipmentTypes: [
    'Arrow Board',
    'Message Board',
    'Truck',
    'Cone Set',
    'Barricade Set',
    'Light Tower',
    'Generator',
    'CMS Mini',
  ],
  materialTypes: [
    'Sign',
    'Cone',
    'Barricade',
    'Drum',
    'Sandbag',
    'Delineator',
  ],
  jobStatuses: [
    'Pending',
    'Confirmed',
    'In Progress',
    'Completed',
    'Cancelled',
  ],
};

const DEFAULT_SHIFTS: Array<
  Pick<
    Shift,
    'id' | 'name' | 'type' | 'startTime' | 'endTime' | 'durationHours' | 'status'
  >
> = [
  {
    id: 'shift_day',
    name: 'Day Shift',
    type: 'standard',
    startTime: '07:00',
    endTime: '16:00',
    durationHours: 9,
    status: 'active',
  },
  {
    id: 'shift_night',
    name: 'Night Shift',
    type: 'standard',
    startTime: '19:00',
    endTime: '04:00',
    durationHours: 9,
    status: 'active',
  },
  {
    id: 'shift_swing',
    name: 'Swing Shift',
    type: 'standard',
    startTime: '15:00',
    endTime: '00:00',
    durationHours: 9,
    status: 'active',
  },
  {
    id: 'shift_on_call',
    name: 'On Call',
    type: 'on_call',
    startTime: null,
    endTime: null,
    durationHours: null,
    status: 'active',
  },
  {
    id: 'shift_weekend',
    name: 'Weekend Shift',
    type: 'temporary',
    startTime: '06:00',
    endTime: '14:00',
    durationHours: 8,
    status: 'inactive',
  },
];

const DEFAULT_WORK_ORDER_TYPES: Array<
  Pick<WorkOrderType, 'id' | 'name' | 'description' | 'status'>
> = [
  {
    id: 'wot_traffic_control',
    name: 'Traffic Control',
    description: 'General traffic control scope',
    status: 'active',
  },
  {
    id: 'wot_lane_closure',
    name: 'Lane Closure',
    description: 'Single or multi-lane closure operations',
    status: 'active',
  },
  {
    id: 'wot_emergency_response',
    name: 'Emergency Response',
    description: 'Rapid-response traffic support for incidents',
    status: 'active',
  },
  {
    id: 'wot_flagging_operation',
    name: 'Flagging Operation',
    description: 'Flagger-led traffic management operation',
    status: 'active',
  },
  {
    id: 'wot_night_shift_support',
    name: 'Night Shift Support',
    description: 'Night operations and overnight coverage',
    status: 'active',
  },
];

const DEFAULT_STATUS_CATALOG: Array<
  Pick<
    StatusCatalog,
    | 'id'
    | 'scope'
    | 'value'
    | 'name'
    | 'color'
    | 'sortOrder'
    | 'blocksEditing'
    | 'triggersNotification'
    | 'requiresApproval'
    | 'status'
  >
> = [
  {
    id: 'wo_draft',
    scope: 'work_order',
    value: 'draft',
    name: 'Draft',
    color: '#94A3B8',
    sortOrder: 10,
    blocksEditing: false,
    triggersNotification: false,
    requiresApproval: false,
    status: 'active',
  },
  {
    id: 'wo_scheduled',
    scope: 'work_order',
    value: 'scheduled',
    name: 'Scheduled',
    color: '#3B82F6',
    sortOrder: 20,
    blocksEditing: false,
    triggersNotification: true,
    requiresApproval: false,
    status: 'active',
  },
  {
    id: 'wo_assigned',
    scope: 'work_order',
    value: 'assigned',
    name: 'Assigned',
    color: '#6366F1',
    sortOrder: 30,
    blocksEditing: false,
    triggersNotification: true,
    requiresApproval: false,
    status: 'active',
  },
  {
    id: 'wo_in_progress',
    scope: 'work_order',
    value: 'in_progress',
    name: 'In Progress',
    color: '#0EA5E9',
    sortOrder: 40,
    blocksEditing: false,
    triggersNotification: false,
    requiresApproval: false,
    status: 'active',
  },
  {
    id: 'wo_completed',
    scope: 'work_order',
    value: 'completed',
    name: 'Completed',
    color: '#22C55E',
    sortOrder: 50,
    blocksEditing: false,
    triggersNotification: true,
    requiresApproval: true,
    status: 'active',
  },
  {
    id: 'wo_approved',
    scope: 'work_order',
    value: 'approved',
    name: 'Approved',
    color: '#16A34A',
    sortOrder: 60,
    blocksEditing: false,
    triggersNotification: false,
    requiresApproval: false,
    status: 'active',
  },
  {
    id: 'wo_closed',
    scope: 'work_order',
    value: 'closed',
    name: 'Closed',
    color: '#334155',
    sortOrder: 70,
    blocksEditing: true,
    triggersNotification: false,
    requiresApproval: false,
    status: 'active',
  },
  {
    id: 'wo_cancelled',
    scope: 'work_order',
    value: 'cancelled',
    name: 'Cancelled',
    color: '#EF4444',
    sortOrder: 80,
    blocksEditing: true,
    triggersNotification: true,
    requiresApproval: false,
    status: 'active',
  },
  {
    id: 'ws_pending',
    scope: 'work_status',
    value: 'pending',
    name: 'Pending',
    color: '#F59E0B',
    sortOrder: 10,
    blocksEditing: false,
    triggersNotification: false,
    requiresApproval: false,
    status: 'active',
  },
  {
    id: 'ws_confirmed',
    scope: 'work_status',
    value: 'confirmed',
    name: 'Confirmed',
    color: '#22C55E',
    sortOrder: 20,
    blocksEditing: false,
    triggersNotification: false,
    requiresApproval: false,
    status: 'active',
  },
  {
    id: 'ws_declined',
    scope: 'work_status',
    value: 'declined',
    name: 'Declined',
    color: '#EF4444',
    sortOrder: 30,
    blocksEditing: false,
    triggersNotification: true,
    requiresApproval: false,
    status: 'active',
  },
  {
    id: 'ws_not_available',
    scope: 'work_status',
    value: 'not_available',
    name: 'Not Available',
    color: '#6B7280',
    sortOrder: 40,
    blocksEditing: false,
    triggersNotification: false,
    requiresApproval: false,
    status: 'active',
  },
  {
    id: 'shift_pending',
    scope: 'shift',
    value: 'pending',
    name: 'Pending',
    color: '#F59E0B',
    sortOrder: 10,
    blocksEditing: false,
    triggersNotification: false,
    requiresApproval: false,
    status: 'active',
  },
  {
    id: 'shift_partially_confirmed',
    scope: 'shift',
    value: 'partially_confirmed',
    name: 'Partially Confirmed',
    color: '#3B82F6',
    sortOrder: 20,
    blocksEditing: false,
    triggersNotification: true,
    requiresApproval: false,
    status: 'active',
  },
  {
    id: 'shift_confirmed',
    scope: 'shift',
    value: 'confirmed',
    name: 'Confirmed',
    color: '#22C55E',
    sortOrder: 30,
    blocksEditing: false,
    triggersNotification: true,
    requiresApproval: false,
    status: 'active',
  },
  {
    id: 'shift_in_progress',
    scope: 'shift',
    value: 'in_progress',
    name: 'In Progress',
    color: '#0EA5E9',
    sortOrder: 40,
    blocksEditing: false,
    triggersNotification: false,
    requiresApproval: false,
    status: 'active',
  },
  {
    id: 'shift_completed',
    scope: 'shift',
    value: 'completed',
    name: 'Completed',
    color: '#334155',
    sortOrder: 50,
    blocksEditing: false,
    triggersNotification: false,
    requiresApproval: false,
    status: 'active',
  },
  {
    id: 'ts_pending',
    scope: 'timesheet',
    value: 'pending',
    name: 'Pending',
    color: '#F59E0B',
    sortOrder: 10,
    blocksEditing: false,
    triggersNotification: false,
    requiresApproval: true,
    status: 'active',
  },
  {
    id: 'ts_submitted',
    scope: 'timesheet',
    value: 'submitted',
    name: 'Submitted',
    color: '#3B82F6',
    sortOrder: 20,
    blocksEditing: false,
    triggersNotification: true,
    requiresApproval: true,
    status: 'active',
  },
  {
    id: 'ts_reviewed',
    scope: 'timesheet',
    value: 'reviewed',
    name: 'Reviewed',
    color: '#8B5CF6',
    sortOrder: 30,
    blocksEditing: false,
    triggersNotification: false,
    requiresApproval: true,
    status: 'active',
  },
  {
    id: 'ts_approved',
    scope: 'timesheet',
    value: 'approved',
    name: 'Approved',
    color: '#22C55E',
    sortOrder: 40,
    blocksEditing: true,
    triggersNotification: true,
    requiresApproval: false,
    status: 'active',
  },
  {
    id: 'ts_rejected',
    scope: 'timesheet',
    value: 'rejected',
    name: 'Rejected',
    color: '#EF4444',
    sortOrder: 50,
    blocksEditing: true,
    triggersNotification: true,
    requiresApproval: false,
    status: 'active',
  },
  {
    id: 'pj_pending',
    scope: 'project',
    value: 'pending',
    name: 'Pending',
    color: '#F59E0B',
    sortOrder: 10,
    blocksEditing: false,
    triggersNotification: false,
    requiresApproval: false,
    status: 'active',
  },
  {
    id: 'pj_confirmed',
    scope: 'project',
    value: 'confirmed',
    name: 'Confirmed',
    color: '#22C55E',
    sortOrder: 20,
    blocksEditing: false,
    triggersNotification: false,
    requiresApproval: false,
    status: 'active',
  },
  {
    id: 'pj_in_progress',
    scope: 'project',
    value: 'in_progress',
    name: 'In Progress',
    color: '#3B82F6',
    sortOrder: 30,
    blocksEditing: false,
    triggersNotification: false,
    requiresApproval: false,
    status: 'active',
  },
  {
    id: 'pj_completed',
    scope: 'project',
    value: 'completed',
    name: 'Completed',
    color: '#6B7280',
    sortOrder: 40,
    blocksEditing: false,
    triggersNotification: false,
    requiresApproval: false,
    status: 'active',
  },
  {
    id: 'pj_cancelled',
    scope: 'project',
    value: 'cancelled',
    name: 'Cancelled',
    color: '#EF4444',
    sortOrder: 50,
    blocksEditing: true,
    triggersNotification: true,
    requiresApproval: false,
    status: 'active',
  },
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
  {
    id: 'ar_pending',
    scope: 'availability_request',
    value: 'pending',
    name: 'Pending',
    color: '#F59E0B',
    sortOrder: 10,
    blocksEditing: false,
    triggersNotification: false,
    requiresApproval: true,
    status: 'active',
  },
  {
    id: 'ar_approved',
    scope: 'availability_request',
    value: 'approved',
    name: 'Approved',
    color: '#22C55E',
    sortOrder: 20,
    blocksEditing: true,
    triggersNotification: true,
    requiresApproval: false,
    status: 'active',
  },
  {
    id: 'ar_denied',
    scope: 'availability_request',
    value: 'denied',
    name: 'Denied',
    color: '#EF4444',
    sortOrder: 30,
    blocksEditing: true,
    triggersNotification: true,
    requiresApproval: false,
    status: 'active',
  },
  {
    id: 'ic_open',
    scope: 'incident',
    value: 'open',
    name: 'Open',
    color: '#EF4444',
    sortOrder: 10,
    blocksEditing: false,
    triggersNotification: true,
    requiresApproval: false,
    status: 'active',
  },
  {
    id: 'ic_investigating',
    scope: 'incident',
    value: 'investigating',
    name: 'Investigating',
    color: '#F59E0B',
    sortOrder: 20,
    blocksEditing: false,
    triggersNotification: true,
    requiresApproval: false,
    status: 'active',
  },
  {
    id: 'ic_resolved',
    scope: 'incident',
    value: 'resolved',
    name: 'Resolved',
    color: '#22C55E',
    sortOrder: 30,
    blocksEditing: false,
    triggersNotification: true,
    requiresApproval: false,
    status: 'active',
  },
  {
    id: 'ic_closed',
    scope: 'incident',
    value: 'closed',
    name: 'Closed',
    color: '#6B7280',
    sortOrder: 40,
    blocksEditing: true,
    triggersNotification: false,
    requiresApproval: false,
    status: 'active',
  },
  {
    id: 'fs_submitted',
    scope: 'form_submission',
    value: 'submitted',
    name: 'Submitted',
    color: '#F59E0B',
    sortOrder: 10,
    blocksEditing: false,
    triggersNotification: true,
    requiresApproval: true,
    status: 'active',
  },
  {
    id: 'fs_reviewed',
    scope: 'form_submission',
    value: 'reviewed',
    name: 'Reviewed',
    color: '#22C55E',
    sortOrder: 20,
    blocksEditing: false,
    triggersNotification: false,
    requiresApproval: false,
    status: 'active',
  },
  {
    id: 'fs_flagged',
    scope: 'form_submission',
    value: 'flagged',
    name: 'Flagged',
    color: '#EF4444',
    sortOrder: 30,
    blocksEditing: false,
    triggersNotification: true,
    requiresApproval: true,
    status: 'active',
  },
];

const DEFAULT_WORKER_ROLES: Array<
  Pick<WorkerRole, 'id' | 'name' | 'description' | 'status'>
> = [
  { id: 'worker_role_flagger', name: 'Flagger', description: '', status: 'active' },
  { id: 'worker_role_lead', name: 'Lead', description: '', status: 'active' },
  { id: 'worker_role_striper', name: 'Striper', description: '', status: 'active' },
  { id: 'worker_role_tma_driver', name: 'TMA Driver', description: '', status: 'active' },
  { id: 'worker_role_freeway_cone_setter', name: 'Freeway Cone Setter', description: '', status: 'active' },
  { id: 'worker_role_pole_depole', name: 'Pole/Depole', description: '', status: 'active' },
];

const WORK_ORDER_FORM_FIELDS: Record<string, unknown>[] = [
  {
    id: 'dr_traffic_job_number',
    key: 'drTrafficJobNumber',
    label: 'DR Traffic Job #',
    type: 'text',
    required: true,
    dataBinding: { path: 'project.number', optional: true },
    ui: {
      section: 'Work Order Details',
      sectionDescription: 'Fill out the job form for today',
      layout: 'half',
      defaultValue: '1916',
    },
  },
  {
    id: 'work_date',
    key: 'workDate',
    label: 'Date',
    type: 'date',
    required: true,
    dataBinding: { path: 'shift.date', optional: true },
    ui: { section: 'Work Order Details', layout: 'half', defaultValue: '2026-03-30' },
  },
  {
    id: 'job_name',
    key: 'jobName',
    label: 'Job Name',
    type: 'text',
    required: true,
    dataBinding: { path: 'project.name', optional: true },
    ui: { section: 'Work Order Details', layout: 'half', defaultValue: 'Redwood Blvd' },
  },
  {
    id: 'cost_code',
    key: 'costCode',
    label: 'Cost Code',
    type: 'text',
    required: false,
    placeholder: 'Enter cost code',
    ui: { section: 'Work Order Details', layout: 'half' },
  },
  {
    id: 'description_of_work',
    key: 'descriptionOfWork',
    label: 'Description of Work',
    type: 'textarea',
    required: true,
    placeholder: 'Describe the work completed today...',
    rules: { minLength: 3, maxLength: 2000 },
    ui: {
      section: 'Work Order Details',
      layout: 'full',
      defaultValue: 'Shift lane.',
      helperText: 'Tap tags to quickly add repeated work descriptions.',
      quickTags: [
        'Shift lane',
        'Lane closure setup',
        'Traffic control support',
        'Set cones and signage',
        'Pickup cones and material',
        'Concrete watch',
        'Flagging operations',
      ],
      tagTone: 'blue',
    },
  },
  {
    id: 'client',
    key: 'client',
    label: 'Client',
    type: 'text',
    required: true,
    dataBinding: { path: 'client.name', optional: true },
    ui: { section: 'Work Order Details', layout: 'half', defaultValue: 'Rosendin' },
  },
  {
    id: 'contact',
    key: 'contact',
    label: 'Contact',
    type: 'text',
    required: false,
    placeholder: 'Enter contact name',
    dataBinding: { path: 'client.contactName', optional: true },
    ui: { section: 'Work Order Details', layout: 'half' },
  },
  {
    id: 'work_shift',
    key: 'workShift',
    label: 'Work Shift',
    type: 'dropdown',
    required: true,
    options: ['Day', 'Swing', 'Night'],
    ui: { section: 'Work Order Details', layout: 'full', defaultValue: 'Day' },
  },
  {
    id: 'worker_timesheets',
    key: 'workerTimesheets',
    label: 'Worker Timesheets',
    type: 'timesheet',
    required: true,
    dataBinding: { path: 'shift.timesheetWorkers', optional: false },
    ui: {
      section: 'Labor & Equipment',
      sectionDescription: 'Review hours and collect signatures for each worker on this shift',
      layout: 'full',
      helperText: 'Workers are loaded from the selected shift. Complete each worker timesheet before submitting.',
    },
  },
  {
    id: 'equipment_id',
    key: 'equipmentId',
    label: 'Equip ID',
    type: 'text',
    required: false,
    dataBinding: { path: 'shift.equipmentSummary', optional: true },
    ui: { section: 'Labor & Equipment', layout: 'half', defaultValue: '01-07' },
  },
  {
    id: 'equipment_hours',
    key: 'equipmentHours',
    label: 'Equipment Hours',
    type: 'number',
    required: false,
    rules: { min: 0, max: 24, step: 0.25 },
    ui: { section: 'Labor & Equipment', layout: 'half', defaultValue: 8 },
  },
  {
    id: 'extra_work_details',
    key: 'extraWorkDetails',
    label: 'Extra Work Details',
    type: 'textarea',
    required: false,
    placeholder: 'Add overtime details, no lunch note, or extra work performed...',
    rules: { maxLength: 2000 },
    ui: {
      section: 'Extra Work / Overtime Details',
      sectionDescription: 'Use quick entries for repeated extra work items',
      layout: 'full',
      defaultValue: '+1 no lunch no break',
      quickTags: [
        '+1 no lunch no break',
        '+1 hour demob barricades',
        '+1 hour demob arrowboard',
        '+1 hour pick up cones or material',
      ],
      tagTone: 'amber',
    },
  },
  {
    id: 'notes',
    key: 'notes',
    label: 'Notes',
    type: 'textarea',
    required: false,
    placeholder: 'Add any final notes for this work order...',
    rules: { maxLength: 2000 },
    ui: {
      section: 'Notes & Signature',
      sectionDescription: 'Final notes and confirmation',
      layout: 'full',
    },
  },
  {
    id: 'worker_signature',
    key: 'workerSignature',
    label: 'Employee / Foreman Signature',
    type: 'signature',
    required: true,
    rules: { hiddenForMobileRoles: ['viewer'] },
    ui: { section: 'Notes & Signature', layout: 'full' },
  },
  {
    id: 'customer_approval_signature',
    key: 'customerApprovalSignature',
    label: 'Customer Contract / Approval',
    type: 'signature',
    required: false,
    rules: { hiddenForMobileRoles: ['viewer'] },
    ui: { section: 'Notes & Signature', layout: 'full' },
  },
  {
    id: 'completion_confirmation',
    key: 'completionConfirmation',
    label: 'I confirm this work order information is complete and accurate.',
    type: 'checkbox',
    required: true,
    ui: { section: 'Notes & Signature', layout: 'full', defaultValue: true },
  },
];

const INCIDENT_REPORT_FORM_FIELDS: Record<string, unknown>[] = [
  {
    id: 'report_date',
    key: 'reportDate',
    label: 'Report Date',
    type: 'date',
    required: true,
    dataBinding: { path: 'shift.date', optional: true },
    ui: {
      section: 'Incident Details',
      sectionDescription: 'Capture the incident clearly and quickly',
      layout: 'half',
      defaultValue: '2026-04-01',
      helperText:
        'Use this form only for job-related incidents, unsafe events, injuries, damage, or near misses. Keep the report factual and specific.',
    },
  },
  {
    id: 'report_time',
    key: 'reportTime',
    label: 'Report Time',
    type: 'time',
    required: true,
    dataBinding: { path: 'shift.startTime', optional: true },
    ui: { section: 'Incident Details', layout: 'half', defaultValue: '08:45' },
  },
  {
    id: 'incident_type',
    key: 'incidentType',
    label: 'Incident Type',
    type: 'dropdown',
    required: true,
    options: [
      'Injury',
      'Near Miss',
      'Property Damage',
      'Traffic Event',
      'Equipment Issue',
      'Safety Violation',
    ],
    ui: { section: 'Incident Details', layout: 'full', defaultValue: 'Injury', tagTone: 'amber' },
  },
  {
    id: 'severity',
    key: 'severity',
    label: 'Severity',
    type: 'dropdown',
    required: true,
    options: ['Low', 'Medium', 'High', 'Critical'],
    ui: { section: 'Incident Details', layout: 'full', defaultValue: 'Medium' },
  },
  {
    id: 'incident_date',
    key: 'incidentDate',
    label: 'Incident Date',
    type: 'date',
    required: true,
    dataBinding: { path: 'shift.date', optional: true },
    ui: { section: 'Incident Details', layout: 'half', defaultValue: '2026-04-01' },
  },
  {
    id: 'incident_time',
    key: 'incidentTime',
    label: 'Incident Time',
    type: 'time',
    required: true,
    ui: { section: 'Incident Details', layout: 'half', defaultValue: '08:20' },
  },
  {
    id: 'incident_location',
    key: 'incidentLocation',
    label: 'Location',
    type: 'text',
    required: true,
    dataBinding: { path: 'workOrder.assignmentAddress', optional: true },
    ui: {
      section: 'Incident Details',
      layout: 'full',
      defaultValue: 'West side staging area near Redwood Blvd intersection',
    },
  },
  {
    id: 'person_reporting',
    key: 'personReporting',
    label: 'Person Reporting',
    type: 'text',
    required: true,
    placeholder: 'Enter the reporter name',
    ui: { section: 'Incident Details', layout: 'full', defaultValue: 'Derek Doan' },
  },
  {
    id: 'people_involved',
    key: 'peopleInvolved',
    label: 'People Involved',
    type: 'textarea',
    required: false,
    placeholder: 'List names and roles of people involved...',
    dataBinding: { path: 'shift.workerNames', optional: true },
    rules: { maxLength: 2000 },
    ui: {
      section: 'Incident Details',
      layout: 'full',
      defaultValue: 'Freddy Moran - Flagger\nPena Zamora - Crew\nDerek Doan - Foreman',
    },
  },
  {
    id: 'what_happened',
    key: 'whatHappened',
    label: 'What Happened?',
    type: 'textarea',
    required: true,
    placeholder: 'Describe the incident clearly and factually...',
    rules: { minLength: 3, maxLength: 4000 },
    ui: {
      section: 'Incident Details',
      layout: 'full',
      defaultValue:
        'Worker slipped while moving cones near the shoulder area. No vehicle collision occurred. Minor injury reported to lower arm.',
      helperText: 'Use quick tags to speed up repeated descriptions.',
      quickTags: [
        'Slip / Trip / Fall',
        'Minor injury',
        'No vehicle involved',
        'Traffic control area',
        'Equipment handling',
        'Site hazard',
      ],
      tagTone: 'amber',
    },
  },
  {
    id: 'immediate_actions_taken',
    key: 'immediateActionsTaken',
    label: 'Immediate Actions Taken',
    type: 'textarea',
    required: true,
    placeholder: 'Describe immediate response...',
    rules: { minLength: 3, maxLength: 4000 },
    ui: {
      section: 'Immediate Response',
      sectionDescription: 'Document what was done right away',
      layout: 'full',
      defaultValue:
        'Foreman stopped cone movement in the area, checked the worker, moved crew away from hazard, and documented the scene.',
    },
  },
  {
    id: 'medical_attention_needed',
    key: 'medicalAttentionNeeded',
    label: 'Medical Attention Needed?',
    type: 'dropdown',
    required: true,
    options: ['No', 'Yes'],
    ui: { section: 'Immediate Response', layout: 'full', defaultValue: 'No' },
  },
  {
    id: 'work_stopped',
    key: 'workStopped',
    label: 'Work Stopped?',
    type: 'dropdown',
    required: true,
    options: ['No', 'Yes'],
    ui: { section: 'Immediate Response', layout: 'full', defaultValue: 'Yes' },
  },
  {
    id: 'supervisor_notified',
    key: 'supervisorNotified',
    label: 'Was Supervisor Notified?',
    type: 'dropdown',
    required: true,
    options: ['Yes', 'No'],
    ui: { section: 'Immediate Response', layout: 'full', defaultValue: 'Yes' },
  },
  {
    id: 'witnesses',
    key: 'witnesses',
    label: 'Witnesses',
    type: 'textarea',
    required: false,
    placeholder: 'List witnesses if any...',
    rules: { maxLength: 2000 },
    ui: {
      section: 'Witnesses & Evidence',
      sectionDescription: 'Add supporting information',
      layout: 'full',
      defaultValue: 'Maria Santos - Operator\nAngel Ramirez - Flagger',
    },
  },
  {
    id: 'photos_evidence',
    key: 'photosEvidence',
    label: 'Photos / Evidence',
    type: 'attachment',
    required: false,
    rules: {
      maxFiles: 10,
      maxFileSizeMb: 25,
      acceptedMimeTypes: ['image/jpeg', 'image/png', 'application/pdf'],
    },
    ui: {
      section: 'Witnesses & Evidence',
      layout: 'full',
      helperText: 'Tap to upload photos or supporting evidence. JPG, PNG, PDF supported.',
    },
  },
  {
    id: 'additional_notes',
    key: 'additionalNotes',
    label: 'Additional Notes',
    type: 'textarea',
    required: false,
    placeholder: 'Add anything else relevant...',
    rules: { maxLength: 4000 },
    ui: { section: 'Witnesses & Evidence', layout: 'full' },
  },
  {
    id: 'reporter_signature',
    key: 'reporterSignature',
    label: 'Reporter Signature',
    type: 'signature',
    required: true,
    ui: {
      section: 'Final Review',
      sectionDescription: 'Confirm and sign the report',
      layout: 'full',
    },
  },
  {
    id: 'incident_report_confirmation',
    key: 'incidentReportConfirmation',
    label:
      'I confirm this incident report is accurate to the best of my knowledge and reflects the facts known at the time of submission.',
    type: 'checkbox',
    required: true,
    ui: { section: 'Final Review', layout: 'full', defaultValue: true },
  },
];

const DEFAULT_FORM_TEMPLATES: Array<
  Pick<
    FormTemplate,
    'id' | 'name' | 'description' | 'category' | 'fields' | 'assignedProjects' | 'assignedRoles'
  >
> = [
  {
    id: 'work_order_daily_completion',
    name: 'Work Order Form',
    description: 'Daily work order completion form for field crews.',
    category: 'Work Order',
    fields: WORK_ORDER_FORM_FIELDS,
    assignedProjects: [],
    assignedRoles: ['worker', 'foreman', 'admin', 'manager'],
  },
  {
    id: 'incident_report_field_report',
    name: 'Incident Report',
    description: 'Field incident report for injuries, damage, unsafe events, and near misses.',
    category: 'Incident Report',
    fields: INCIDENT_REPORT_FORM_FIELDS,
    assignedProjects: [],
    assignedRoles: ['worker', 'foreman', 'admin', 'manager'],
  },
];

function asBoolean(input: string | undefined, fallback: boolean) {
  if (!input) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(input.toLowerCase());
}

function mergeUnique(current: string[] = [], incoming: string[] = []) {
  return Array.from(new Set([...current, ...incoming]));
}

function getSeedUsers(): SeedUser[] {
  return [
    {
      firstName: 'Derek',
      lastName: 'Doan',
      email: process.env.SEED_ADMIN_EMAIL || 'derek@drtrafficcontrol.com',
      phone: '(555) 100-0001',
      role: 'admin',
      password: process.env.SEED_ADMIN_PASSWORD || 'admin123',
    },
    {
      firstName: 'Sarah',
      lastName: 'Mitchell',
      email: process.env.SEED_MANAGER_EMAIL || 'sarah@drtrafficcontrol.com',
      phone: '(555) 100-0002',
      role: 'manager',
      password: process.env.SEED_MANAGER_PASSWORD || 'manager123',
    },
    {
      firstName: 'Mike',
      lastName: 'Rodriguez',
      email: process.env.SEED_SCHEDULER_EMAIL || 'mike@drtrafficcontrol.com',
      phone: '(555) 100-0003',
      role: 'scheduler',
      password: process.env.SEED_SCHEDULER_PASSWORD || 'scheduler123',
    },
    {
      firstName: 'Jenny',
      lastName: 'Park',
      email: process.env.SEED_VIEWER_EMAIL || 'jenny@drtrafficcontrol.com',
      phone: '(555) 100-0004',
      role: 'viewer',
      password: process.env.SEED_VIEWER_PASSWORD || 'viewer123',
    },
  ];
}

async function seedCatalogs(dataSource: DataSource) {
  const settingsRepo = dataSource.getRepository(CompanySettings);
  const existing = await settingsRepo.findOne({
    where: { id: DEFAULT_SETTINGS.id },
  });

  if (!existing) {
    await settingsRepo.save(settingsRepo.create(DEFAULT_SETTINGS));
    console.log('Catalog seed OK. Created company_settings default.');
    return;
  }

  existing.workerTypes = DEFAULT_SETTINGS.workerTypes;
  existing.equipmentTypes = mergeUnique(
    existing.equipmentTypes,
    DEFAULT_SETTINGS.equipmentTypes,
  );
  existing.materialTypes = mergeUnique(
    existing.materialTypes,
    DEFAULT_SETTINGS.materialTypes,
  );
  existing.jobStatuses = mergeUnique(
    existing.jobStatuses,
    DEFAULT_SETTINGS.jobStatuses,
  );
  existing.overtimeRules =
    existing.overtimeRules || DEFAULT_SETTINGS.overtimeRules;
  existing.name = existing.name || DEFAULT_SETTINGS.name;
  existing.address = existing.address || DEFAULT_SETTINGS.address;
  existing.phone = existing.phone || DEFAULT_SETTINGS.phone;
  existing.email = existing.email || DEFAULT_SETTINGS.email;
  existing.logo = existing.logo ?? DEFAULT_SETTINGS.logo;

  await settingsRepo.save(existing);
  console.log('Catalog seed OK. Updated company_settings default.');
}

async function seedShiftCatalog(dataSource: DataSource) {
  const shiftRepo = dataSource.getRepository(Shift);
  let created = 0;
  let updated = 0;

  for (const template of DEFAULT_SHIFTS) {
    const existing = await shiftRepo.findOne({ where: { id: template.id } });
    if (!existing) {
      await shiftRepo.save(shiftRepo.create(template));
      created += 1;
      continue;
    }

    existing.name = template.name;
    existing.type = template.type;
    existing.startTime = template.startTime;
    existing.endTime = template.endTime;
    existing.durationHours = template.durationHours;
    existing.status = template.status;
    await shiftRepo.save(existing);
    updated += 1;
  }

  console.log(`Shifts seed OK. created=${created}, updated=${updated}`);
}

async function seedWorkOrderTypeCatalog(dataSource: DataSource) {
  const repo = dataSource.getRepository(WorkOrderType);
  let created = 0;
  let updated = 0;

  for (const template of DEFAULT_WORK_ORDER_TYPES) {
    const existing = await repo.findOne({ where: { id: template.id } });
    if (!existing) {
      await repo.save(repo.create(template));
      created += 1;
      continue;
    }

    existing.name = template.name;
    existing.description = template.description;
    existing.status = template.status;
    await repo.save(existing);
    updated += 1;
  }

  console.log(
    `Assignment types seed OK. created=${created}, updated=${updated}`,
  );
}

async function seedStatusCatalog(dataSource: DataSource) {
  const repo = dataSource.getRepository(StatusCatalog);
  let created = 0;
  let updated = 0;

  for (const template of DEFAULT_STATUS_CATALOG) {
    const existing = await repo.findOne({ where: { id: template.id } });

    if (!existing) {
      await repo.save(repo.create(template));
      created += 1;
      continue;
    }

    existing.scope = template.scope;
    existing.value = template.value;
    existing.name = template.name;
    existing.color = template.color;
    existing.sortOrder = template.sortOrder;
    existing.blocksEditing = template.blocksEditing;
    existing.triggersNotification = template.triggersNotification;
    existing.requiresApproval = template.requiresApproval;
    existing.status = template.status;
    await repo.save(existing);
    updated += 1;
  }

  console.log(`Status catalog seed OK. created=${created}, updated=${updated}`);
}

async function seedWorkerRoleCatalog(dataSource: DataSource) {
  const repo = dataSource.getRepository(WorkerRole);
  let created = 0;
  let updated = 0;

  for (const template of DEFAULT_WORKER_ROLES) {
    const existing = await repo.findOne({ where: { id: template.id } });
    if (!existing) {
      await repo.save(repo.create(template));
      created += 1;
      continue;
    }

    existing.name = template.name;
    existing.description = template.description;
    existing.status = template.status;
    await repo.save(existing);
    updated += 1;
  }

  console.log(`Worker roles seed OK. created=${created}, updated=${updated}`);
}

async function seedFormTemplates(dataSource: DataSource) {
  const repo = dataSource.getRepository(FormTemplate);
  let created = 0;
  let updated = 0;

  for (const template of DEFAULT_FORM_TEMPLATES) {
    const fields = normalizeFormFields(template.fields);
    const existing = await repo.findOne({ where: { id: template.id } });

    if (!existing) {
      await repo.save(repo.create({ ...template, fields }));
      created += 1;
      continue;
    }

    existing.name = template.name;
    existing.description = template.description;
    existing.category = template.category;
    existing.fields = fields;
    existing.assignedProjects = template.assignedProjects;
    existing.assignedRoles = template.assignedRoles;
    await repo.save(existing);
    updated += 1;
  }

  console.log(`Form templates seed OK. created=${created}, updated=${updated}`);
}

async function seedUsers(dataSource: DataSource, accessService: AccessService) {
  const resetPasswords = asBoolean(
    process.env.SEED_USERS_RESET_PASSWORDS,
    false,
  );
  const usersRepo = dataSource.getRepository(User);
  const users = getSeedUsers();

  let created = 0;
  let updated = 0;

  for (const user of users) {
    const email = user.email.trim().toLowerCase();
    const existing = await usersRepo.findOne({ where: { email } });

    if (!existing) {
      const passwordHash = await bcrypt.hash(user.password, SALT_ROUNDS);
      const createdUser = await usersRepo.save(
        usersRepo.create({
          email,
          passwordHash,
          firstName: user.firstName,
          lastName: user.lastName,
          phone: user.phone,
          avatarUrl: null,
          status: 'active',
          lastLogin: null,
        }),
      );
      await accessService.replaceAppRoleForUser(createdUser.id, user.role);
      created += 1;
      continue;
    }

    existing.firstName = user.firstName;
    existing.lastName = user.lastName;
    existing.phone = user.phone;
    existing.status = existing.status || 'active';

    if (resetPasswords) {
      existing.passwordHash = await bcrypt.hash(user.password, SALT_ROUNDS);
    }

    const saved = await usersRepo.save(existing);
    await accessService.replaceAppRoleForUser(saved.id, user.role);
    updated += 1;
  }

  console.log(
    `Users seed OK. created=${created}, updated=${updated}, resetPasswords=${resetPasswords}`,
  );
}

async function seedDr() {
  ensureRuntimeEnv();
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  try {
    const dataSource = app.get(DataSource);
    const accessService = app.get(AccessService);
    await seedCatalogs(dataSource);
    await seedWorkerRoleCatalog(dataSource);
    await seedShiftCatalog(dataSource);
    await seedWorkOrderTypeCatalog(dataSource);
    await seedStatusCatalog(dataSource);
    await seedFormTemplates(dataSource);
    await seedUsers(dataSource, accessService);
    console.log('Seed DR OK.');
  } finally {
    await app.close();
  }
}

seedDr().catch((err) => {
  console.error(err);
  process.exit(1);
});
