let formatter: Intl.DateTimeFormat | undefined;
let formatterZone: string | undefined;

/** Shift dates are business calendar dates, independent of the server's timezone. */
export function businessDate(now = new Date()): string {
  const zone = process.env.BUSINESS_TIME_ZONE || 'America/Los_Angeles';
  if (!formatter || formatterZone !== zone) {
    formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: zone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    formatterZone = zone;
  }
  return formatter.format(now);
}

export function isFutureShift(date: unknown, now = new Date()): boolean {
  return typeof date === 'string' && date.slice(0, 10) > businessDate(now);
}
