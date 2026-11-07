export function getLocalDateString(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function getWeekDates(
  referenceDate: string,
): { date: string; dayOfWeek: number }[] {
  const ref = new Date(`${referenceDate}T12:00:00`);
  const dayOfWeek = ref.getDay();
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const monday = new Date(ref);
  monday.setDate(monday.getDate() + mondayOffset);
  const out: { date: string; dayOfWeek: number }[] = [];
  for (let i = 0; i < 7; i += 1) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    out.push({
      date: d.toISOString().slice(0, 10),
      dayOfWeek: d.getDay(),
    });
  }
  return out;
}

export function daysBetween(fromDate: string, toDate: string): number {
  const a = new Date(`${fromDate}T12:00:00`).getTime();
  const b = new Date(`${toDate}T12:00:00`).getTime();
  return Math.round((b - a) / (1000 * 60 * 60 * 24));
}
