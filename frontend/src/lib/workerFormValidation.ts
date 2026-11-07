export function localTodayISO(): string {
  const n = new Date();
  const y = n.getFullYear();
  const m = String(n.getMonth() + 1).padStart(2, '0');
  const d = String(n.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function compareIsoDateOnly(a: string, b: string): number {
  return a.localeCompare(b);
}

const TEN_DIGITS = /^[2-9]\d{2}[2-9]\d{6}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function digitsOnly(raw: string): string {
  return raw.replace(/\D/g, '');
}

export function formatUsPhoneInput(raw: string): string {
  const d = digitsOnly(raw);
  let d10 = d;
  if (d10.length >= 11 && d10.startsWith('1')) d10 = d10.slice(1, 11);
  d10 = d10.slice(0, 10);
  const a = d10.slice(0, 3);
  const b = d10.slice(3, 6);
  const c = d10.slice(6, 10);
  if (d10.length <= 3) return a ? `(${a}` : '';
  if (d10.length <= 6) return `(${a}) ${b}`;
  return `(${a}) ${b}-${c}`;
}

export function isValidUsPhone10(raw: string): boolean {
  const d10 = normalizeTo10Nanp(raw);
  return d10 !== null && TEN_DIGITS.test(d10);
}

export function normalizeTo10Nanp(raw: string): string | null {
  let d10 = digitsOnly(raw);
  if (d10.length === 11 && d10.startsWith('1')) d10 = d10.slice(1);
  if (d10.length !== 10) return null;
  if (!TEN_DIGITS.test(d10)) return null;
  return d10;
}

export function sanitizeDriverLicense(raw: string): string {
  return raw
    .toUpperCase()
    .normalize('NFKD')
    .replace(/[^A-Z0-9*\-]/g, '')
    .slice(0, 24);
}

export function driverLicensePassesBasicFormat(raw: string): boolean {
  const t = raw.trim();
  if (t === '') return true;
  return /^[A-Z0-9*\-]+$/.test(t) && t.length >= 3 && t.length <= 24;
}

export const HOURLY_RATE_MIN = 0;
export const HOURLY_RATE_MAX = 750;

export function coerceHourlyRate(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const n = parseFloat(String(value));
  return Number.isFinite(n) ? n : NaN;
}

export const WORKER_UPLOAD_ACCEPT_MIME = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
]);

export const WORKER_UPLOAD_ACCEPT_ATTR =
  '.pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png';

export function isWorkerAllowedUploadFile(file: File): boolean {
  const mime = (file.type || '').trim().toLowerCase();
  if (WORKER_UPLOAD_ACCEPT_MIME.has(mime)) return true;
  const name = file.name?.toLowerCase() || '';
  return /\.pdf$/i.test(name) || /\.jpe?g$/i.test(name) || /\.png$/i.test(name);
}

export function licenseExpiresSoonWarning(
  ymd: string,
  thresholdDays = 30,
): string | null {
  const t = ymd.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return null;
  const [y, m, d] = t.split('-').map(Number);
  const expiry = new Date(y, m - 1, d);
  expiry.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffMs = expiry.getTime() - today.getTime();
  const days = Math.ceil(diffMs / (24 * 60 * 60 * 1000));
  if (days < 0) return null;
  if (days <= thresholdDays) {
    const dayWord = days === 1 ? 'day' : 'days';
    return `License expires in ${days} ${dayWord} (within ${thresholdDays}).`;
  }
  return null;
}

export interface WorkerModalFormSlice {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  type: string;
  hourlyRate: number;
  driverLicense: string;
  driverLicenseExpiration: string;
  hireDate: string;
}

export function validateWorkerModalForm(
  f: WorkerModalFormSlice,
): string | null {
  if (!f.firstName.trim()) return 'First name is required.';
  if (!f.lastName.trim()) return 'Last name is required.';
  const em = f.email.trim();
  if (!em || !EMAIL_RE.test(em)) return 'Enter a valid email address.';
  if (!isValidUsPhone10(f.phone))
    return 'Phone must be a valid US number (10-digit NANP).';
  if (!f.type?.trim()) return 'Type is required.';
  const rate = coerceHourlyRate(f.hourlyRate);
  if (!Number.isFinite(rate) || rate < HOURLY_RATE_MIN) {
    return 'Hourly rate cannot be negative.';
  }
  if (rate > HOURLY_RATE_MAX) {
    return `Hourly rate must not exceed $${HOURLY_RATE_MAX}/hr.`;
  }
  const dl = f.driverLicense.trim();
  if (dl && !driverLicensePassesBasicFormat(dl)) {
    return 'License may only contain letters, numbers, * and - (3–24 characters if provided).';
  }
  const today = localTodayISO();
  if (f.hireDate && compareIsoDateOnly(f.hireDate, today) > 0) {
    return 'Hire date cannot be in the future.';
  }
  if (f.driverLicenseExpiration) {
    if (compareIsoDateOnly(f.driverLicenseExpiration, today) < 0) {
      return 'License expiration cannot be in the past.';
    }
  }
  return null;
}
