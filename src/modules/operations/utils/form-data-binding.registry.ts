/**
 * Bindable paths catalog for dynamic forms (mobile / web).
 * Prefixes:
 * - `workOrder` - work_orders row (assignment / work order)
 * - `assignment` - alias for `workOrder` (same resolution)
 * - `project`, `client`, `workOrderType`, `projectType` - related catalogs
 * - `shift` - requires `shiftId` in context; embedded shift data on the assignment
 * - `assignmentAll` - aggregates across all assignment shifts (no shiftId)
 */

export type FormBindingPathDefinition = {
  path: string;
  description: string;
  /** Requires `shiftId` query when requesting context-preview */
  requiresShift: boolean;
  /** Editor guidance example */
  example?: string;
};

export const FORM_DATA_BINDING_PATHS: FormBindingPathDefinition[] = [
  {
    path: 'workOrder.id',
    description: 'Assignment ID (work order)',
    requiresShift: false,
  },
  {
    path: 'workOrder.title',
    description: 'Assignment title / job name',
    requiresShift: false,
    example: 'Lane closure - Main St',
  },
  {
    path: 'workOrder.orderNumber',
    description: 'Assignment order number',
    requiresShift: false,
  },
  {
    path: 'workOrder.startDate',
    description: 'Assignment start date',
    requiresShift: false,
  },
  {
    path: 'workOrder.endDate',
    description: 'Assignment end date',
    requiresShift: false,
  },
  {
    path: 'workOrder.requesterName',
    description: 'Person who requested the work',
    requiresShift: false,
  },
  {
    path: 'workOrder.contactEmail',
    description: 'On-site contact email',
    requiresShift: false,
  },
  {
    path: 'workOrder.contactPhoneNumber',
    description: 'On-site contact phone number',
    requiresShift: false,
  },
  {
    path: 'workOrder.assignmentAddress',
    description: 'Full jobsite address for the assignment',
    requiresShift: false,
  },
  {
    path: 'workOrder.assignmentCity',
    description: 'Jobsite city',
    requiresShift: false,
  },
  {
    path: 'workOrder.assignmentState',
    description: 'Jobsite state / province',
    requiresShift: false,
  },
  {
    path: 'workOrder.assignmentZipCode',
    description: 'Jobsite ZIP / postal code',
    requiresShift: false,
  },
  {
    path: 'workOrder.assignmentCountry',
    description: 'Jobsite country',
    requiresShift: false,
  },
  {
    path: 'workOrder.notes',
    description: 'General assignment notes',
    requiresShift: false,
  },
  {
    path: 'workOrder.dispatchNote',
    description: 'Dispatch note',
    requiresShift: false,
  },
  {
    path: 'project.number',
    description: 'Project number (DR job #)',
    requiresShift: false,
    example: '1467',
  },
  {
    path: 'project.name',
    description: 'Project name',
    requiresShift: false,
  },
  {
    path: 'project.description',
    description: 'Project description',
    requiresShift: false,
  },
  {
    path: 'project.location',
    description: 'Project location / address',
    requiresShift: false,
  },
  {
    path: 'project.workOrderNumber',
    description: 'Project-level work order number',
    requiresShift: false,
  },
  {
    path: 'project.purchaseOrder',
    description: 'Purchase order (PO)',
    requiresShift: false,
  },
  {
    path: 'project.projectManager',
    description: 'Project manager name',
    requiresShift: false,
  },
  {
    path: 'project.projectManagerEmail',
    description: 'Project manager email',
    requiresShift: false,
  },
  {
    path: 'client.name',
    description: 'Client name',
    requiresShift: false,
  },
  {
    path: 'client.contactName',
    description: 'Primary client contact',
    requiresShift: false,
  },
  {
    path: 'client.email',
    description: 'Client email',
    requiresShift: false,
  },
  {
    path: 'client.phone',
    description: 'Client phone number',
    requiresShift: false,
  },
  {
    path: 'workOrderType.name',
    description: 'Work order type name',
    requiresShift: false,
  },
  {
    path: 'projectType.name',
    description: 'Project type name',
    requiresShift: false,
  },
  {
    path: 'shift.id',
    description: 'Shift ID embedded in the assignment',
    requiresShift: true,
  },
  {
    path: 'shift.date',
    description: 'Shift date',
    requiresShift: true,
  },
  {
    path: 'shift.startTime',
    description: 'Shift start time (HH:mm)',
    requiresShift: true,
  },
  {
    path: 'shift.endTime',
    description: 'Shift end time',
    requiresShift: true,
  },
  {
    path: 'shift.workerNames',
    description: 'Worker names assigned to the shift across all roles, comma-separated',
    requiresShift: true,
  },
  {
    path: 'shift.timesheetWorkers',
    description: 'Structured worker list for the mobile timesheet component',
    requiresShift: true,
  },
  {
    path: 'shift.equipmentSummary',
    description: 'Brief list of equipment assigned to the shift (identifier - name)',
    requiresShift: true,
  },
  {
    path: 'shift.materialsSummary',
    description: 'Materials assigned to the shift',
    requiresShift: true,
  },
  {
    path: 'shift.rolesSummary',
    description: 'Required roles summary for the shift (role x quantity)',
    requiresShift: true,
  },
  {
    path: 'workOrder.allWorkerNames',
    description: 'All unique workers across assignment shifts, comma-separated',
    requiresShift: false,
  },
  {
    path: 'workOrder.allEquipmentSummary',
    description: 'Unique equipment used across all shifts (identifier - name)',
    requiresShift: false,
  },
  {
    path: 'workOrder.allMaterialsSummary',
    description: 'Unique materials across all shifts',
    requiresShift: false,
  },
];

/** Domain data binding (assignment, project, shift, etc.); portable JSON for React Native */
export type FormFieldDataBinding = {
  path: string;
  /** When true, missing server data is not an error (manual fill). Defaults to true. */
  optional?: boolean;
};

export function canonicalDataBindingPath(raw: string): string {
  const t = raw.trim();
  if (t.startsWith('assignment.')) {
    return `workOrder.${t.slice('assignment.'.length)}`;
  }
  return t;
}
