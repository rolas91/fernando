import React from 'react';
import type { Shift } from '@/lib/types';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  getShiftConfirmationSummary,
  getShiftHoverStatus,
  getEffectiveShiftStatus,
  getShiftStatusPresentation,
  getShiftRoleStartTime,
  type EffectiveShiftStatus,
} from './shiftConfirmation';

interface ShiftHoverTooltipProps {
  shift: Shift;
  children: React.ReactElement;

  onOpenDetails?: () => void;
  effectiveStatus?: EffectiveShiftStatus;
}

const formatTimeAmPm = (time: string) => {
  const [hStr, mStr] = time.split(':');
  const h = parseInt(hStr, 10);
  const m = parseInt(mStr, 10) || 0;
  if (Number.isNaN(h)) return time;
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
};

export const ShiftHoverTooltip: React.FC<ShiftHoverTooltipProps> = ({
  shift,
  children,
  onOpenDetails,
  effectiveStatus,
}) => {
  const h = getShiftHoverStatus(shift);
  const summary = getShiftConfirmationSummary(shift);
  const presentation = getShiftStatusPresentation(
    effectiveStatus === undefined
      ? getEffectiveShiftStatus(shift)
      : effectiveStatus,
  );

  const timeLine = `${formatTimeAmPm(getShiftRoleStartTime(shift))} – ${formatTimeAmPm(shift.endTime)}`;

  const confirmedDisplay =
    h.assignedSlots > 0
      ? `${h.confirmedReplies} / ${h.assignedSlots}`
      : String(h.confirmedReplies);

  return (
    <Tooltip delayDuration={200}>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent
        side="top"
        align="start"
        sideOffset={8}
        className="pointer-events-auto z-[10060] max-w-[15.5rem] border border-zinc-700 bg-zinc-900 px-0 py-0 text-xs text-white shadow-xl"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="px-3.5 pb-3 pt-3">
          <p className="mb-1 truncate text-[13px] font-bold leading-tight text-white">
            {shift.shiftName}
          </p>
          <p className="text-[13px] font-semibold leading-tight tracking-tight text-white">
            {timeLine}
          </p>
          <span
            className={`mt-2 inline-flex rounded-full px-2 py-1 text-[10px] font-bold leading-none ${presentation.badge}`}
          >
            {presentation.label}
          </span>

          <div className="my-3 h-px bg-zinc-600/90" />

          <div className="space-y-2.5 text-[11px]">
            <div className="flex items-center justify-between gap-8">
              <span className="flex items-center gap-2 font-medium text-white">
                <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-400" />
                Confirmed
              </span>
              <span className="tabular-nums font-semibold text-white">
                {confirmedDisplay}
              </span>
            </div>
            <div className="flex items-center justify-between gap-8">
              <span className="flex items-center gap-2 font-medium text-amber-400">
                <span className="h-2 w-2 shrink-0 rounded-full bg-amber-400" />
                Pending
              </span>
              <span className="tabular-nums font-semibold text-white">
                {h.pendingReplies}
              </span>
            </div>
            <div className="flex items-center justify-between gap-8">
              <span className="flex items-center gap-2 font-medium text-red-400">
                <span className="h-2 w-2 shrink-0 rounded-full bg-red-400" />
                Missing
              </span>
              <span className="tabular-nums font-semibold text-white">
                {h.missingWorkerSlots}
              </span>
            </div>
          </div>
        </div>

        {onOpenDetails ? (
          <>
            <div className="h-px bg-zinc-700" />
            <button
              type="button"
              className="w-full px-3.5 pb-3.5 pt-2.5 text-left text-[11px] font-medium text-zinc-400 transition-colors hover:bg-zinc-800/90 hover:text-zinc-200"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onOpenDetails();
              }}
            >
              Click for details
            </button>
          </>
        ) : null}
      </TooltipContent>
    </Tooltip>
  );
};
