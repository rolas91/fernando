import type { RowError } from './parser.types';

const ALLOWED_DATE_FORMATS = [
  /^(\d{4})-(\d{2})-(\d{2})$/,
  /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/,
  /^(\d{1,2})-(\d{1,2})-(\d{4})$/,
];

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function normalizeHeader(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();
}

export function pickField(
  raw: Record<string, unknown>,
  canonicalKey: string,
  aliases: string[] = [],
): unknown {
  const candidates = [canonicalKey, ...aliases].map((a) => normalizeHeader(a));
  for (const key of Object.keys(raw)) {
    if (candidates.includes(normalizeHeader(key))) return raw[key];
  }
  return undefined;
}

export function readString(
  raw: Record<string, unknown>,
  key: string,
  aliases: string[] = [],
  opts: { required?: boolean; trim?: boolean; allowEmpty?: boolean } = {},
): { value: string | null; error?: RowError; row: number } {
  const { required = false, trim = true, allowEmpty = true } = opts;
  const fieldValue = pickField(raw, key, aliases);
  if (fieldValue === undefined || fieldValue === null || fieldValue === '') {
    if (required) {
      return {
        value: null,
        error: { row: 0, field: key, code: 'REQUIRED', message: `Campo requerido: ${key}` },
        row: 0,
      };
    }
    return { value: allowEmpty ? '' : null, row: 0 };
  }
  if (fieldValue instanceof Date) {
    const yyyy = fieldValue.getUTCFullYear();
    const mm = String(fieldValue.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(fieldValue.getUTCDate()).padStart(2, '0');
    return { value: `${yyyy}-${mm}-${dd}`, row: 0 };
  }
  if (typeof fieldValue === 'number') {
    return { value: String(fieldValue), row: 0 };
  }
  let text = String(fieldValue);
  if (trim) text = text.trim();
  return { value: text, row: 0 };
}

export function readNumber(
  raw: Record<string, unknown>,
  key: string,
  aliases: string[] = [],
  opts: { required?: boolean; allowEmpty?: boolean; min?: number; max?: number } = {},
): { value: number | null; error?: RowError; row: number } {
  const { required = false, allowEmpty = true, min, max } = opts;
  const v = pickField(raw, key, aliases);
  if (v === undefined || v === null || v === '') {
    if (required) {
      return {
        value: null,
        error: { row: 0, field: key, code: 'REQUIRED', message: `Campo requerido: ${key}` },
        row: 0,
      };
    }
    return { value: allowEmpty ? null : null, row: 0 };
  }
  if (typeof v === 'number') {
    if (min !== undefined && v < min) {
      return {
        value: null,
        error: { row: 0, field: key, code: 'OUT_OF_RANGE', message: `${key} debe ser >= ${min}` },
        row: 0,
      };
    }
    if (max !== undefined && v > max) {
      return {
        value: null,
        error: { row: 0, field: key, code: 'OUT_OF_RANGE', message: `${key} debe ser <= ${max}` },
        row: 0,
      };
    }
    return { value: v, row: 0 };
  }
  const cleaned = String(v).replace(/[$,\s]/g, '').trim();
  if (cleaned === '') {
    if (required) {
      return {
        value: null,
        error: { row: 0, field: key, code: 'REQUIRED', message: `Campo requerido: ${key}` },
        row: 0,
      };
    }
    return { value: null, row: 0 };
  }
  const n = Number(cleaned);
  if (!Number.isFinite(n)) {
    return {
      value: null,
      error: { row: 0, field: key, code: 'NOT_A_NUMBER', message: `${key} no es numérico: "${v}"` },
      row: 0,
    };
  }
  if (min !== undefined && n < min) {
    return {
      value: null,
      error: { row: 0, field: key, code: 'OUT_OF_RANGE', message: `${key} debe ser >= ${min}` },
      row: 0,
    };
  }
  if (max !== undefined && n > max) {
    return {
      value: null,
      error: { row: 0, field: key, code: 'OUT_OF_RANGE', message: `${key} debe ser <= ${max}` },
      row: 0,
    };
  }
  return { value: n, row: 0 };
}

export function readDate(
  raw: Record<string, unknown>,
  key: string,
  aliases: string[] = [],
  opts: { required?: boolean; allowEmpty?: boolean } = {},
): { value: string | null; error?: RowError; row: number } {
  const { required = false, allowEmpty = true } = opts;
  const v = pickField(raw, key, aliases);
  if (v === undefined || v === null || v === '') {
    if (required) {
      return {
        value: null,
        error: { row: 0, field: key, code: 'REQUIRED', message: `Campo requerido: ${key}` },
        row: 0,
      };
    }
    return { value: allowEmpty ? null : null, row: 0 };
  }
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) {
      return {
        value: null,
        error: { row: 0, field: key, code: 'INVALID_DATE', message: `${key} no es una fecha válida` },
        row: 0,
      };
    }
    const yyyy = v.getUTCFullYear();
    const mm = String(v.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(v.getUTCDate()).padStart(2, '0');
    return { value: `${yyyy}-${mm}-${dd}`, row: 0 };
  }
  const text = String(v).trim();
  if (text === '') {
    if (required) {
      return {
        value: null,
        error: { row: 0, field: key, code: 'REQUIRED', message: `Campo requerido: ${key}` },
        row: 0,
      };
    }
    return { value: null, row: 0 };
  }
  if (ISO_DATE.test(text)) return { value: text, row: 0 };
  for (const re of ALLOWED_DATE_FORMATS) {
    const m = text.match(re);
    if (m) {
      let y: number;
      let mo: number;
      let d: number;
      if (re === ALLOWED_DATE_FORMATS[0]) {
        y = Number(m[1]);
        mo = Number(m[2]);
        d = Number(m[3]);
      } else {
        d = Number(m[1]);
        mo = Number(m[2]);
        y = Number(m[3]);
      }
      if (mo < 1 || mo > 12 || d < 1 || d > 31) break;
      const date = new Date(Date.UTC(y, mo - 1, d));
      if (
        date.getUTCFullYear() !== y ||
        date.getUTCMonth() !== mo - 1 ||
        date.getUTCDate() !== d
      ) {
        break;
      }
      return {
        value: `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
        row: 0,
      };
    }
  }
  return {
    value: null,
    error: { row: 0, field: key, code: 'INVALID_DATE', message: `${key} no es una fecha válida (${text})` },
    row: 0,
  };
}

export function readBoolean(
  raw: Record<string, unknown>,
  key: string,
  aliases: string[] = [],
  opts: { default?: boolean; required?: boolean } = {},
): { value: boolean; error?: RowError; row: number } {
  const { default: def = false, required = false } = opts;
  const v = pickField(raw, key, aliases);
  if (v === undefined || v === null || v === '') {
    if (required) {
      return {
        value: def,
        error: { row: 0, field: key, code: 'REQUIRED', message: `Campo requerido: ${key}` },
        row: 0,
      };
    }
    return { value: def, row: 0 };
  }
  if (typeof v === 'boolean') return { value: v, row: 0 };
  const text = String(v).trim().toLowerCase();
  if (['true', '1', 'yes', 'y', 'si', 'sí', 's'].includes(text)) return { value: true, row: 0 };
  if (['false', '0', 'no', 'n'].includes(text)) return { value: false, row: 0 };
  return {
    value: def,
    error: { row: 0, field: key, code: 'INVALID_BOOLEAN', message: `${key} no es booleano: "${v}"` },
    row: 0,
  };
}

export function readEnum(
  raw: Record<string, unknown>,
  key: string,
  values: readonly string[],
  aliases: string[] = [],
  opts: { required?: boolean; defaultValue?: string; allowEmpty?: boolean } = {},
): { value: string | null; error?: RowError; row: number } {
  const { required = false, defaultValue, allowEmpty = true } = opts;
  const v = pickField(raw, key, aliases);
  if (v === undefined || v === null || v === '') {
    if (required) {
      return {
        value: null,
        error: { row: 0, field: key, code: 'REQUIRED', message: `Campo requerido: ${key}` },
        row: 0,
      };
    }
    if (defaultValue !== undefined) return { value: defaultValue, row: 0 };
    return { value: allowEmpty ? null : null, row: 0 };
  }
  const text = String(v).trim();
  if (text === '') {
    if (defaultValue !== undefined) return { value: defaultValue, row: 0 };
    return { value: null, row: 0 };
  }
  const found = values.find((vv) => vv.toLowerCase() === text.toLowerCase());
  if (!found) {
    return {
      value: null,
      error: {
        row: 0,
        field: key,
        code: 'INVALID_ENUM',
        message: `${key} debe ser uno de: ${values.join(', ')} (recibido: "${text}")`,
      },
      row: 0,
    };
  }
  return { value: found, row: 0 };
}

export function readCsv(
  raw: Record<string, unknown>,
  key: string,
  aliases: string[] = [],
  opts: { required?: boolean; unique?: boolean; lower?: boolean; trim?: boolean } = {},
): { value: string[]; error?: RowError; row: number } {
  const { required = false, unique = true, lower = true, trim = true } = opts;
  const v = pickField(raw, key, aliases);
  if (v === undefined || v === null || v === '') {
    if (required) {
      return {
        value: [],
        error: { row: 0, field: key, code: 'REQUIRED', message: `Campo requerido: ${key}` },
        row: 0,
      };
    }
    return { value: [], row: 0 };
  }
  const parts = String(v)
    .split(/[,;|]/)
    .map((p) => {
      let s = p;
      if (trim) s = s.trim();
      if (lower) s = s.toLowerCase();
      return s;
    })
    .filter((p) => p.length > 0);
  if (unique) {
    const seen = new Set<string>();
    const dedup: string[] = [];
    for (const p of parts) {
      if (!seen.has(p)) {
        seen.add(p);
        dedup.push(p);
      }
    }
    return { value: dedup, row: 0 };
  }
  return { value: parts, row: 0 };
}

export function idFromName(name: string, prefix: string): string {
  const base = name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase()
    .slice(0, 48);
  const safe = base || 'item';
  return `${prefix}_${safe}`.slice(0, 64);
}

export function attachRowIndex(error: RowError, row: number): RowError {
  return { ...error, row };
}

export function pushError(
  target: RowError[],
  error: RowError | undefined,
  row: number,
): void {
  if (!error) return;
  target.push(attachRowIndex(error, row));
}

export function normalizePhone(phone: string): string {
  return phone.replace(/[^\d+]/g, '');
}
