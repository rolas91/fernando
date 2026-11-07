import { Ban, Check, Clock, X } from 'lucide-react';
import type { ReactNode } from 'react';
import type { ShiftWorkerConfirmation } from '@/lib/types';

export function WorkerConfirmationIcons({
  confirmation,
  cancelled,
  detail = false,
  showPending = false,
}: {
  confirmation?: ShiftWorkerConfirmation;
  cancelled: boolean;
  detail?: boolean;
  showPending?: boolean;
}) {
  const size = detail ? 20 : 13;
  const cancellationConfirmed =
    cancelled && Boolean(confirmation?.cancellationAcknowledgedAt);
  const assignmentConfirmed = confirmation?.status === 'confirmed';
  const assignmentDeclined = confirmation?.status === 'declined';
  const icon = (label: string, node: ReactNode) => (
    <span
      title={label}
      aria-label={label}
      role="img"
      className="inline-flex shrink-0 items-center justify-center"
    >
      {node}
    </span>
  );
  return (
    <span className="inline-flex shrink-0 items-center gap-2">
      {assignmentConfirmed &&
        (!cancelled || detail) &&
        icon(
          'Worker accepted shift',
          <Check size={size} strokeWidth={3} className="text-emerald-600" />,
        )}
      {assignmentDeclined &&
        !cancelled &&
        icon(
          'Worker declined shift',
          <X size={size} className="text-red-500" />,
        )}
      {cancellationConfirmed &&
        icon(
          'Worker acknowledged shift cancellation',
          <Ban size={size} strokeWidth={3} className="text-red-600" />,
        )}
      {cancelled && !cancellationConfirmed
        ? icon(
            'Awaiting cancellation confirmation',
            <Clock size={size} className="text-amber-500" />,
          )
        : !cancelled &&
            !assignmentConfirmed &&
            !assignmentDeclined &&
            showPending
          ? icon(
              'Awaiting worker response',
              <Clock size={size} className="text-amber-500" />,
            )
          : null}
    </span>
  );
}
