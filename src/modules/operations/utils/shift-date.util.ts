/** Shift dates are business calendar dates, independent of the server's timezone. */
export function businessDate(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: process.env.BUSINESS_TIME_ZONE || 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

export function isFutureShift(date: unknown, now = new Date()): boolean {
  return typeof date === 'string' && date.slice(0, 10) > businessDate(now);
}
