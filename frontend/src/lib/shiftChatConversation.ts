import type { Project, Shift, WorkOrder } from '@/lib/types';

export function shiftChatConversationTitle(
  project: Project | null | undefined,
  workOrder: WorkOrder | null | undefined,
  shift: Shift | null | undefined,
) {
  return [
    project?.number?.trim() || 'No Project Number',
    project?.name?.trim() || workOrder?.title?.trim() || 'Unknown Project',
    shift?.shiftName?.trim() || 'Unnamed Shift',
  ].join(' – ');
}
