import { AlertTriangle, CalendarDays, Users } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import type { findBulkShiftWorkerConflicts } from '@/lib/bulkShiftWorkerConflicts';

export type BulkShiftConflict = ReturnType<
  typeof findBulkShiftWorkerConflicts
>[number] & { workerName: string };

function dateLabel(date: string) {
  return new Date(`${date}T12:00:00`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function BulkShiftConflictDialog({
  conflicts,
  shiftCount,
  onConfirm,
  onCancel,
}: {
  conflicts: BulkShiftConflict[];
  shiftCount: number;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const groups = new Map<string, BulkShiftConflict[]>();
  for (const conflict of conflicts)
    groups.set(conflict.workerId, [
      ...(groups.get(conflict.workerId) ?? []),
      conflict,
    ]);
  return (
    <AlertDialog open>
      <AlertDialogContent className="z-[100] flex max-w-2xl flex-col gap-0 overflow-hidden rounded-2xl p-0 sm:p-0">
        <AlertDialogHeader className="border-b border-border p-5 sm:p-6 text-left">
          <div className="mb-2 flex h-11 w-11 items-center justify-center rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400">
            <AlertTriangle size={23} />
          </div>
          <AlertDialogTitle className="text-foreground">
            Review worker schedule conflicts
          </AlertDialogTitle>
          <AlertDialogDescription>
            Some workers have overlapping shifts in this assignment. Review the
            schedules below before continuing.
          </AlertDialogDescription>
          <div className="flex flex-wrap gap-2 pt-2 text-xs font-medium">
            <span className="flex items-center gap-1.5 rounded-full bg-muted px-3 py-1.5 text-foreground">
              <Users size={14} />
              {groups.size} affected {groups.size === 1 ? 'worker' : 'workers'}
            </span>
            <span className="flex items-center gap-1.5 rounded-full bg-muted px-3 py-1.5 text-foreground">
              <CalendarDays size={14} />
              {shiftCount} shifts to create
            </span>
          </div>
        </AlertDialogHeader>
        <div className="min-h-0 space-y-4 overflow-y-auto p-5 sm:px-6">
          {[...groups.entries()].map(([workerId, rows]) => (
            <section
              key={workerId}
              className="overflow-hidden rounded-xl border border-border"
            >
              <div className="flex items-center justify-between gap-3 bg-muted/50 px-4 py-3">
                <h3 className="font-semibold text-foreground">
                  {rows[0].workerName}
                </h3>
                <span className="text-xs text-muted-foreground">
                  {rows.length} {rows.length === 1 ? 'overlap' : 'overlaps'}
                </span>
              </div>
              <div className="divide-y divide-border">
                {rows.map((row, index) => (
                  <div
                    key={index}
                    className="grid grid-cols-1 gap-3 px-4 py-3 text-sm sm:grid-cols-2"
                  >
                    <div>
                      <p className="mb-1 text-xs font-medium text-muted-foreground">
                        New shift
                      </p>
                      <p className="text-foreground">{dateLabel(row.date)}</p>
                      <p className="font-semibold tabular-nums text-foreground">
                        {row.startTime} – {row.endTime}
                      </p>
                    </div>
                    <div>
                      <p className="mb-1 text-xs font-medium text-amber-600 dark:text-amber-400">
                        Overlapping shift
                      </p>
                      <p className="text-foreground">
                        {dateLabel(row.otherDate)}
                      </p>
                      <p className="font-semibold tabular-nums text-foreground">
                        {row.otherStartTime} – {row.otherEndTime}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
        <div className="border-t border-border p-5 sm:px-6">
          <p className="text-sm text-muted-foreground">
            You can still create all {shiftCount} shifts. Existing shifts will
            remain unchanged.
          </p>
          <AlertDialogFooter className="gap-2 sm:space-x-0">
            <AlertDialogCancel onClick={onCancel}>
              Review shifts
            </AlertDialogCancel>
            <AlertDialogAction onClick={onConfirm}>
              Create all {shiftCount} shifts
            </AlertDialogAction>
          </AlertDialogFooter>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}
