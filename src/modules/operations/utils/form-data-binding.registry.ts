/**
 * Catálogo de rutas enlazables para formularios dinámicos (mobile / web).
 * Prefijos:
 * - `workOrder` — fila work_orders (assignment / orden de trabajo)
 * - `assignment` — alias de `workOrder` (misma resolución)
 * - `project`, `client`, `workOrderType`, `projectType` — catálogos relacionados
 * - `shift` — requiere `shiftId` en el contexto; datos del turno embebido en la assignment
 * - `assignmentAll` — agregados sobre todos los turnos de la assignment (sin shiftId)
 */

export type FormBindingPathDefinition = {
  path: string;
  description: string;
  /** Requiere query `shiftId` al pedir context-preview */
  requiresShift: boolean;
  /** Ejemplo orientativo para el editor */
  example?: string;
};

export const FORM_DATA_BINDING_PATHS: FormBindingPathDefinition[] = [
  {
    path: 'workOrder.id',
    description: 'ID de la assignment (work order)',
    requiresShift: false,
  },
  {
    path: 'workOrder.title',
    description: 'Título / nombre de trabajo de la assignment',
    requiresShift: false,
    example: 'Lane closure — Main St',
  },
  {
    path: 'workOrder.orderNumber',
    description: 'Número de orden de la assignment',
    requiresShift: false,
  },
  {
    path: 'workOrder.status',
    description: 'Estado de la assignment',
    requiresShift: false,
  },
  {
    path: 'workOrder.startDate',
    description: 'Fecha inicio (assignment)',
    requiresShift: false,
  },
  {
    path: 'workOrder.endDate',
    description: 'Fecha fin (assignment)',
    requiresShift: false,
  },
  {
    path: 'workOrder.requesterName',
    description: 'Persona que solicitó el trabajo',
    requiresShift: false,
  },
  {
    path: 'workOrder.contactEmail',
    description: 'Email de contacto en sitio',
    requiresShift: false,
  },
  {
    path: 'workOrder.contactPhoneNumber',
    description: 'Teléfono de contacto en sitio',
    requiresShift: false,
  },
  {
    path: 'workOrder.assignmentAddress',
    description: 'Dirección completa del sitio (assignment)',
    requiresShift: false,
  },
  {
    path: 'workOrder.assignmentCity',
    description: 'Ciudad del sitio',
    requiresShift: false,
  },
  {
    path: 'workOrder.assignmentState',
    description: 'Estado/provincia',
    requiresShift: false,
  },
  {
    path: 'workOrder.assignmentZipCode',
    description: 'Código postal',
    requiresShift: false,
  },
  {
    path: 'workOrder.assignmentCountry',
    description: 'País',
    requiresShift: false,
  },
  {
    path: 'workOrder.notes',
    description: 'Notas generales de la assignment',
    requiresShift: false,
  },
  {
    path: 'workOrder.dispatchNote',
    description: 'Nota de despacho',
    requiresShift: false,
  },
  {
    path: 'project.number',
    description: 'Número de proyecto (DR job #)',
    requiresShift: false,
    example: '1467',
  },
  {
    path: 'project.name',
    description: 'Nombre del proyecto',
    requiresShift: false,
  },
  {
    path: 'project.description',
    description: 'Descripción del proyecto',
    requiresShift: false,
  },
  {
    path: 'project.location',
    description: 'Ubicación / dirección del proyecto',
    requiresShift: false,
  },
  {
    path: 'project.workOrderNumber',
    description: 'Número de work order a nivel proyecto',
    requiresShift: false,
  },
  {
    path: 'project.purchaseOrder',
    description: 'Orden de compra (PO)',
    requiresShift: false,
  },
  {
    path: 'project.projectManager',
    description: 'Nombre del project manager',
    requiresShift: false,
  },
  {
    path: 'project.projectManagerEmail',
    description: 'Email del project manager',
    requiresShift: false,
  },
  {
    path: 'client.name',
    description: 'Nombre del cliente',
    requiresShift: false,
  },
  {
    path: 'client.contactName',
    description: 'Contacto principal del cliente',
    requiresShift: false,
  },
  {
    path: 'client.email',
    description: 'Email del cliente',
    requiresShift: false,
  },
  {
    path: 'client.phone',
    description: 'Teléfono del cliente',
    requiresShift: false,
  },
  {
    path: 'workOrderType.name',
    description: 'Nombre del tipo de work order',
    requiresShift: false,
  },
  {
    path: 'projectType.name',
    description: 'Nombre del tipo de proyecto',
    requiresShift: false,
  },
  {
    path: 'shift.id',
    description: 'ID del turno (shift embebido en la assignment)',
    requiresShift: true,
  },
  {
    path: 'shift.date',
    description: 'Fecha del turno',
    requiresShift: true,
  },
  {
    path: 'shift.startTime',
    description: 'Hora inicio del turno (HH:mm)',
    requiresShift: true,
  },
  {
    path: 'shift.endTime',
    description: 'Hora fin del turno',
    requiresShift: true,
  },
  {
    path: 'shift.workerNames',
    description: 'Nombres de workers asignados al turno (todos los roles), separados por coma',
    requiresShift: true,
  },
  {
    path: 'shift.equipmentSummary',
    description: 'Listado breve de equipo asignado al turno (identificador — nombre)',
    requiresShift: true,
  },
  {
    path: 'shift.materialsSummary',
    description: 'Listado de materiales asignados al turno',
    requiresShift: true,
  },
  {
    path: 'shift.rolesSummary',
    description: 'Resumen de roles requeridos en el turno (rol x cantidad)',
    requiresShift: true,
  },
  {
    path: 'workOrder.allWorkerNames',
    description: 'Todos los workers en cualquier turno de la assignment (únicos), separados por coma',
    requiresShift: false,
  },
  {
    path: 'workOrder.allEquipmentSummary',
    description: 'Equipo único usado en todos los turnos (identificador — nombre)',
    requiresShift: false,
  },
  {
    path: 'workOrder.allMaterialsSummary',
    description: 'Materiales únicos en todos los turnos',
    requiresShift: false,
  },
];

/** Enlace a datos de dominio (assignment, proyecto, shift, etc.); portable JSON para React Native */
export type FormFieldDataBinding = {
  path: string;
  /** Si true, ausencia de valor en servidor no implica error (relleno manual). Por defecto true. */
  optional?: boolean;
};

export function canonicalDataBindingPath(raw: string): string {
  const t = raw.trim();
  if (t.startsWith('assignment.')) {
    return `workOrder.${t.slice('assignment.'.length)}`;
  }
  return t;
}
