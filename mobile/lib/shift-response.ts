import type { AssignmentShift } from './assignments-service';
import { useEffect, useState } from 'react';

export function useShiftResponseClock() {
  const [, setTick] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => setTick((value) => value + 1), 30_000);
    return () => clearInterval(interval);
  }, []);
}

function clockMinutes(value?: string) {
  const match =
    value?.trim().match(/^(\d{1,2}):(\d{2})\s*([AP])\.?M\.?$/i) ??
    value?.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;

  let hour = Number(match[1]);
  const minute = Number(match[2]);
  const period = match[3]?.toUpperCase();
  if (minute < 0 || minute > 59) return null;

  if (period) {
    if (hour < 1 || hour > 12) return null;
    if (period === 'A' && hour === 12) hour = 0;
    if (period === 'P' && hour !== 12) hour += 12;
  } else if (hour < 0 || hour > 23) {
    return null;
  }

  return hour * 60 + minute;
}

export function hasShiftEnded(
  shift: Pick<AssignmentShift, 'date' | 'startTime' | 'endTime'>,
  now = new Date(),
) {
  const dateMatch = shift.date?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!dateMatch) return false;

  const year = Number(dateMatch[1]);
  const month = Number(dateMatch[2]) - 1;
  const day = Number(dateMatch[3]);
  const endMinutes = clockMinutes(shift.endTime);

  if (endMinutes === null) {
    return now >= new Date(year, month, day + 1, 0, 0, 0, 0);
  }

  const startMinutes = clockMinutes(shift.startTime);
  const crossesMidnight = startMinutes !== null && endMinutes <= startMinutes;
  const end = new Date(
    year,
    month,
    day + (crossesMidnight ? 1 : 0),
    Math.floor(endMinutes / 60),
    endMinutes % 60,
    0,
    0,
  );
  return now >= end;
}

export function isShiftNoResponse(shift: AssignmentShift, now = new Date()) {
  return (
    shift.confirmationStatus === 'pending' &&
    shift.confirmationRequested === true &&
    shift.effectiveStatus !== 'shift_cancelled' &&
    hasShiftEnded(shift, now)
  );
}

export function canRespondToShift(shift: AssignmentShift, now = new Date()) {
  return (
    shift.confirmationStatus === 'pending' &&
    shift.confirmationRequested === true &&
    !hasShiftEnded(shift, now) &&
    shift.effectiveStatus !== 'shift_cancelled' &&
    shift.effectiveStatus !== 'shift_completed' &&
    shift.effectiveStatus !== 'pm_approved' &&
    !shift.completed
  );
}
