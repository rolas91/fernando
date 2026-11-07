import type { FormSubmission, FormTemplate, WorkOrder } from '@/lib/types';
import { isFutureShiftDate } from './shiftDate';

export function buildCompletedWorkOrderShiftKeys(
  submissions: Pick<FormSubmission, 'workOrderId' | 'shiftId' | 'templateId' | 'status'>[],
  templates: FormTemplate[],
  workOrders: WorkOrder[],
): Set<string> {
  const result = new Set<string>();
  const submitted = submissions.filter((item) => item.status === 'submitted');

  for (const workOrder of workOrders) {
    for (const shift of workOrder.shifts || []) {
      if (isFutureShiftDate(shift.date)) continue;
      const selectedIds = new Set(shift.formTemplateIds || []);
      const required = templates.filter(
        (template) =>
          template.isRequired !== false && selectedIds.has(template.id),
      );
      if (required.length === 0) continue;
      const complete = required.every((template) =>
        submitted.some(
          (submission) =>
            submission.workOrderId === workOrder.id &&
            submission.shiftId === shift.id &&
            submission.templateId === template.id,
        ),
      );
      if (complete) result.add(`${workOrder.id}:${shift.id}`);
    }
  }
  return result;
}
