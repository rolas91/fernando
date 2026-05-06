import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

function parseUtcDateOnly(ymd: string): Date | null {
  if (typeof ymd !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null;
  const [ys, ms, ds] = ymd.split('-');
  const y = Number(ys);
  const m = Number(ms);
  const d = Number(ds);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (
    dt.getUTCFullYear() !== y ||
    dt.getUTCMonth() !== m - 1 ||
    dt.getUTCDate() !== d
  ) {
    return null;
  }
  return dt;
}

function utcStartOfToday(): number {
  const now = new Date();
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
}

@ValidatorConstraint({ name: 'isDateOnlyPastOrPresent', async: false })
export class IsDateOnlyPastOrPresentConstraint
  implements ValidatorConstraintInterface
{
  validate(value: unknown) {
    if (value === undefined || value === null || value === '') return true;
    if (typeof value !== 'string') return false;
    const d = parseUtcDateOnly(value);
    if (!d) return false;
    return d.getTime() <= utcStartOfToday();
  }

  defaultMessage(_args?: ValidationArguments) {
    return 'La fecha de contratación debe ser hoy o una fecha pasada.';
  }
}

export function IsDateOnlyPastOrPresent(validationOptions?: ValidationOptions) {
  return (object: object, propertyName: string) => {
    registerDecorator({
      name: 'isDateOnlyPastOrPresent',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: IsDateOnlyPastOrPresentConstraint,
    });
  };
}

@ValidatorConstraint({ name: 'isDateOnlyTodayOrFuture', async: false })
export class IsDateOnlyTodayOrFutureConstraint
  implements ValidatorConstraintInterface
{
  validate(value: unknown) {
    if (value === undefined || value === null || value === '') return true;
    if (typeof value !== 'string') return false;
    const d = parseUtcDateOnly(value);
    if (!d) return false;
    return d.getTime() >= utcStartOfToday();
  }

  defaultMessage(_args?: ValidationArguments) {
    return 'La fecha de vencimiento del permiso debe ser hoy o una fecha futura.';
  }
}

export function IsDateOnlyTodayOrFuture(validationOptions?: ValidationOptions) {
  return (object: object, propertyName: string) => {
    registerDecorator({
      name: 'isDateOnlyTodayOrFuture',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: IsDateOnlyTodayOrFutureConstraint,
    });
  };
}

/** NANP USA: opcional país 1 + 10 dígitos con área 2–9 inicial. */
@ValidatorConstraint({ name: 'isUsNanpPhone', async: false })
export class IsUsNanpPhoneConstraint implements ValidatorConstraintInterface {
  validate(value: unknown) {
    if (typeof value !== 'string') return false;
    const digits = value.replace(/\D/g, '');
    let d10 = digits;
    if (d10.length === 11 && d10.startsWith('1')) d10 = d10.slice(1);
    if (d10.length !== 10) return false;
    const n = d10[0];
    if (n === '0' || n === '1') return false;
    const ex = d10[3];
    if (ex === '0' || ex === '1') return false;
    return true;
  }

  defaultMessage(_args?: ValidationArguments) {
    return 'El teléfono debe tener 10 dígitos válidos (EE. UU.).';
  }
}

export function IsUsNanpPhone(validationOptions?: ValidationOptions) {
  return (object: object, propertyName: string) => {
    registerDecorator({
      name: 'isUsNanpPhone',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: IsUsNanpPhoneConstraint,
    });
  };
}

export function normalizeUsPhoneDisplay(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  let d10 = digits;
  if (d10.length === 11 && d10.startsWith('1')) d10 = d10.slice(1);
  if (d10.length !== 10) return raw.trim();
  const a = d10.slice(0, 3);
  const b = d10.slice(3, 6);
  const c = d10.slice(6);
  return `(${a}) ${b}-${c}`;
}
