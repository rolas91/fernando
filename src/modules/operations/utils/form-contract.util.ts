import { BadRequestException } from '@nestjs/common';

export const FORM_CONTRACT_VERSION = '1.0.0';

type FieldType =
  | 'text'
  | 'number'
  | 'dropdown'
  | 'checkbox'
  | 'signature'
  | 'photo'
  | 'date'
  | 'textarea'
  | 'time';

type FieldRules = {
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  min?: number;
  max?: number;
  step?: number;
  integer?: boolean;
  allowMultiple?: boolean;
  maxSelections?: number;
  minDate?: string;
  maxDate?: string;
  maxPhotos?: number;
  maxFileSizeMb?: number;
  acceptedMimeTypes?: string[];
};

type FieldUi = {
  keyboardType?: 'default' | 'numeric' | 'email-address' | 'phone-pad';
  inputMode?: 'text' | 'decimal' | 'numeric' | 'email' | 'tel';
};

export type DynamicFormField = {
  id: string;
  key?: string;
  label: string;
  type: FieldType;
  required: boolean;
  placeholder?: string;
  options?: string[];
  rules?: FieldRules;
  ui?: FieldUi;
  version?: string;
};

const SUPPORTED_TYPES: FieldType[] = [
  'text',
  'number',
  'dropdown',
  'checkbox',
  'signature',
  'photo',
  'date',
  'textarea',
  'time',
];

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === 'object' && input !== null && !Array.isArray(input);
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function asBoolean(value: unknown, fallback = false): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function asStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const values = value
    .map((x) => (typeof x === 'string' ? x.trim() : ''))
    .filter((x) => x.length > 0);
  return values.length > 0 ? Array.from(new Set(values)) : undefined;
}

function normalizeRules(type: FieldType, input: unknown): FieldRules | undefined {
  if (!isRecord(input)) return undefined;

  const rules: FieldRules = {};
  const minLength = asNumber(input.minLength);
  const maxLength = asNumber(input.maxLength);
  const pattern = asString(input.pattern).trim();
  const min = asNumber(input.min);
  const max = asNumber(input.max);
  const step = asNumber(input.step);
  const maxSelections = asNumber(input.maxSelections);
  const minDate = asString(input.minDate).trim();
  const maxDate = asString(input.maxDate).trim();
  const maxPhotos = asNumber(input.maxPhotos);
  const maxFileSizeMb = asNumber(input.maxFileSizeMb);
  const acceptedMimeTypes = asStringArray(input.acceptedMimeTypes);

  if (type === 'text' || type === 'textarea') {
    if (minLength !== undefined) rules.minLength = minLength;
    if (maxLength !== undefined) rules.maxLength = maxLength;
    if (pattern) rules.pattern = pattern;
  }

  if (type === 'number') {
    if (min !== undefined) rules.min = min;
    if (max !== undefined) rules.max = max;
    if (step !== undefined) rules.step = step;
    rules.integer = asBoolean(input.integer, false);
  }

  if (type === 'dropdown') {
    rules.allowMultiple = asBoolean(input.allowMultiple, false);
    if (maxSelections !== undefined) rules.maxSelections = maxSelections;
  }

  if (type === 'date') {
    if (minDate) rules.minDate = minDate;
    if (maxDate) rules.maxDate = maxDate;
  }

  if (type === 'photo') {
    if (maxPhotos !== undefined) rules.maxPhotos = maxPhotos;
    if (maxFileSizeMb !== undefined) rules.maxFileSizeMb = maxFileSizeMb;
    if (acceptedMimeTypes) rules.acceptedMimeTypes = acceptedMimeTypes;
  }

  return Object.keys(rules).length > 0 ? rules : undefined;
}

function normalizeUi(type: FieldType, input: unknown): FieldUi | undefined {
  if (!isRecord(input)) {
    if (type === 'number') {
      return { keyboardType: 'numeric', inputMode: 'decimal' };
    }
    return undefined;
  }

  const ui: FieldUi = {};
  const keyboardType = asString(input.keyboardType).trim() as FieldUi['keyboardType'];
  const inputMode = asString(input.inputMode).trim() as FieldUi['inputMode'];

  if (keyboardType) ui.keyboardType = keyboardType;
  if (inputMode) ui.inputMode = inputMode;

  if (Object.keys(ui).length === 0 && type === 'number') {
    ui.keyboardType = 'numeric';
    ui.inputMode = 'decimal';
  }

  return Object.keys(ui).length > 0 ? ui : undefined;
}

export function normalizeFormFields(rawFields: unknown): DynamicFormField[] {
  if (!Array.isArray(rawFields)) return [];

  return rawFields.map((rawField, index) => {
    const raw = isRecord(rawField) ? rawField : {};
    const rawType = asString(raw.type).trim() as FieldType;
    const type = SUPPORTED_TYPES.includes(rawType) ? rawType : 'text';
    const label = asString(raw.label, `Field ${index + 1}`).trim() || `Field ${index + 1}`;
    const id =
      asString(raw.id).trim() ||
      asString(raw.key).trim() ||
      `field_${index + 1}`;
    const options = type === 'dropdown' ? asStringArray(raw.options) : undefined;

    return {
      id,
      key: asString(raw.key).trim() || id,
      label,
      type,
      required: asBoolean(raw.required, false),
      placeholder: asString(raw.placeholder).trim() || undefined,
      options,
      rules: normalizeRules(type, raw.rules),
      ui: normalizeUi(type, raw.ui),
      version: FORM_CONTRACT_VERSION,
    };
  });
}

function isValueEmpty(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string') return value.trim() === '';
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

function assert(condition: boolean, message: string) {
  if (!condition) throw new BadRequestException(message);
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const HHMM_RE = /^\d{2}:\d{2}$/;

export function validateSubmissionAgainstFields(
  fields: DynamicFormField[],
  data: Record<string, unknown> | undefined,
) {
  const payload = data || {};

  for (const field of fields) {
    const value = payload[field.id] ?? payload[field.label];
    if (field.required && isValueEmpty(value)) {
      throw new BadRequestException(`Field "${field.label}" is required`);
    }

    if (isValueEmpty(value)) continue;

    if (field.type === 'text' || field.type === 'textarea') {
      if (typeof value !== 'string') {
        throw new BadRequestException(`Field "${field.label}" must be a string`);
      }
      const stringValue = value as string;
      if (field.rules?.minLength !== undefined) {
        assert(
          stringValue.length >= field.rules.minLength,
          `Field "${field.label}" must have at least ${field.rules.minLength} characters`,
        );
      }
      if (field.rules?.maxLength !== undefined) {
        assert(
          stringValue.length <= field.rules.maxLength,
          `Field "${field.label}" exceeds ${field.rules.maxLength} characters`,
        );
      }
      if (field.rules?.pattern) {
        const re = new RegExp(field.rules.pattern);
        assert(
          re.test(stringValue),
          `Field "${field.label}" format is invalid`,
        );
      }
    }

    if (field.type === 'number') {
      const parsed = asNumber(value);
      assert(parsed !== undefined, `Field "${field.label}" must be numeric`);
      const numericValue = parsed as number;
      if (field.rules?.integer) {
        assert(
          Number.isInteger(numericValue),
          `Field "${field.label}" must be an integer value`,
        );
      }
      if (field.rules?.min !== undefined) {
        assert(
          numericValue >= field.rules.min,
          `Field "${field.label}" must be >= ${field.rules.min}`,
        );
      }
      if (field.rules?.max !== undefined) {
        assert(
          numericValue <= field.rules.max,
          `Field "${field.label}" must be <= ${field.rules.max}`,
        );
      }
    }

    if (field.type === 'dropdown') {
      const allowMultiple = field.rules?.allowMultiple === true;
      if (allowMultiple) {
        assert(Array.isArray(value), `Field "${field.label}" must be an array`);
        const selectedValues = value as unknown[];
        if (field.rules?.maxSelections !== undefined) {
          assert(
            selectedValues.length <= field.rules.maxSelections,
            `Field "${field.label}" allows max ${field.rules.maxSelections} selections`,
          );
        }
        if (field.options && field.options.length > 0) {
          for (const option of selectedValues) {
            assert(
              typeof option === 'string' && field.options.includes(option),
              `Field "${field.label}" contains invalid option "${String(option)}"`,
            );
          }
        }
      } else {
        if (typeof value !== 'string') {
          throw new BadRequestException(
            `Field "${field.label}" must be a string`,
          );
        }
        const selectedValue = value as string;
        if (field.options && field.options.length > 0) {
          assert(
            field.options.includes(selectedValue),
            `Field "${field.label}" has an unsupported option`,
          );
        }
      }
    }

    if (field.type === 'checkbox') {
      assert(typeof value === 'boolean', `Field "${field.label}" must be boolean`);
    }

    if (field.type === 'date') {
      assert(typeof value === 'string' && ISO_DATE_RE.test(value), `Field "${field.label}" must use YYYY-MM-DD`);
    }

    if (field.type === 'time') {
      assert(typeof value === 'string' && HHMM_RE.test(value), `Field "${field.label}" must use HH:mm`);
    }

    if (field.type === 'signature') {
      const valid =
        (typeof value === 'string' && value.trim().length > 0) ||
        (isRecord(value) && Object.keys(value).length > 0);
      assert(valid, `Field "${field.label}" requires signature payload`);
    }

    if (field.type === 'photo') {
      const valid = typeof value === 'string' || Array.isArray(value) || isRecord(value);
      assert(valid, `Field "${field.label}" requires photo payload`);
      if (Array.isArray(value) && field.rules?.maxPhotos !== undefined) {
        assert(
          value.length <= field.rules.maxPhotos,
          `Field "${field.label}" allows max ${field.rules.maxPhotos} photos`,
        );
      }
    }
  }
}

export function normalizeSubmissionData(
  data: Record<string, unknown> | undefined,
): Record<string, unknown> {
  const payload = isRecord(data) ? { ...data } : {};
  const currentMeta = isRecord(payload._meta) ? payload._meta : {};
  payload._meta = {
    ...currentMeta,
    contractVersion: FORM_CONTRACT_VERSION,
    normalizedAt: new Date().toISOString(),
  };
  return payload;
}
