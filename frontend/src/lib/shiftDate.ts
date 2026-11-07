export function isFutureShiftDate(
  date: string | undefined,
  now = new Date(),
): boolean {
  if (!date) return false;
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: import.meta.env.VITE_BUSINESS_TIME_ZONE || 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
  return date.slice(0, 10) > today;
}
