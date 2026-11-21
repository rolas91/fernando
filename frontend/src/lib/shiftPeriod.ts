const NIGHT_START_MINUTES = 17 * 60;
const NIGHT_END_MINUTES = 5 * 60;

function clockMinutes(value: string | null | undefined): number | null {
  const normalized = (value || '').trim();
  const twelveHour = normalized.match(/^(\d{1,2}):(\d{2})\s*([AP])\.?M\.?$/i);
  if (twelveHour) {
    let hours = Number(twelveHour[1]);
    const minutes = Number(twelveHour[2]);
    if (hours < 1 || hours > 12 || minutes > 59) return null;
    if (twelveHour[3].toUpperCase() === 'A' && hours === 12) hours = 0;
    if (twelveHour[3].toUpperCase() === 'P' && hours !== 12) hours += 12;
    return hours * 60 + minutes;
  }
  const twentyFourHour = normalized.match(/^(\d{1,2}):(\d{2})$/);
  if (!twentyFourHour) return null;
  const hours = Number(twentyFourHour[1]);
  const minutes = Number(twentyFourHour[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

/**
 * Day/night wording for a dispatch message. The shift template name wins when
 * it already says day or night (for example "Night Shift"), otherwise the
 * start time decides, using the same 17:00-05:00 cutoff as the rest of the app.
 */
export function getShiftPeriodLabel(
  startTime: string | null | undefined,
  templateName?: string | null,
): 'day shift' | 'night shift' {
  const name = (templateName || '').trim().toLowerCase();
  if (/\bnight\b/.test(name)) return 'night shift';
  if (/\bday\b/.test(name)) return 'day shift';
  const start = clockMinutes(startTime);
  if (start === null) return 'day shift';
  return start >= NIGHT_START_MINUTES || start < NIGHT_END_MINUTES
    ? 'night shift'
    : 'day shift';
}
