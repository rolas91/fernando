export function maskCoordDecimalInput(raw: string): string {
  let t = raw.replace(/,/g, '.').replace(/[^\d.-]/g, '');
  if (t === '' || t === '-') return t === '-' ? '-' : '';
  const sign = t.startsWith('-');
  t = t.replace(/-/g, '');
  const split = t.split('.');
  const intPart = split[0] ?? '';
  let frac = split.length > 1 ? split.slice(1).join('').replace(/\D/g, '') : '';
  frac = frac.slice(0, 10);
  if (split.length > 1) {
    const i =
      intPart.replace(/\D/g, '') === '' ? '0' : intPart.replace(/\D/g, '');
    return (sign ? '-' : '') + i + '.' + frac;
  }
  return (sign ? '-' : '') + intPart.replace(/\D/g, '');
}

export function parseCoordNumber(s: string): number | null {
  const trimmed = s.trim();
  if (!trimmed || trimmed === '-' || trimmed === '.' || trimmed === '-.')
    return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

export function latitudeInRange(n: number): boolean {
  return n >= -90 && n <= 90;
}

export function longitudeInRange(n: number): boolean {
  return n >= -180 && n <= 180;
}

export function coordToInputString(n: number): string {
  return String(n);
}
