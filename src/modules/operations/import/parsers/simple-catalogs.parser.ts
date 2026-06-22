import type { ParsedRow, RowError } from './parser.types';
import {
  idFromName,
  pushError,
  readCsv,
  readDate,
  readEnum,
  readNumber,
  readString,
} from './common';

const STATUS_VALUES = ['active', 'inactive', 'archived'];

type SimpleCatalog = 'skill' | 'workerRole' | 'projectType' | 'workOrderType' | 'certification';

type FieldSpec = {
  key: string;
  aliases?: string[];
  required?: boolean;
  type?: 'string' | 'csv';
  trim?: boolean;
};

function buildSimpleParser(
  catalog: SimpleCatalog,
  idPrefix: string,
  extraFields: FieldSpec[] = [],
) {
  return (raw: Record<string, unknown>, row: number): ParsedRow => {
    const errors: RowError[] = [];
    const idIn = readString(raw, 'id', ['catalog_id']);
    if (idIn.error) pushError(errors, { ...idIn.error, row }, row);
    const name = readString(raw, 'name', [], { required: true });
    if (name.error) pushError(errors, { ...name.error, row }, row);
    const description = readString(raw, 'description');
    if (description.error) pushError(errors, { ...description.error, row }, row);
    const status = readEnum(raw, 'status', STATUS_VALUES, [], {
      required: true,
      defaultValue: 'active',
    });
    if (status.error) pushError(errors, { ...status.error, row }, row);

    const extras: Record<string, unknown> = {};
    for (const f of extraFields) {
      const r =
        f.type === 'csv'
          ? readCsv(raw, f.key, f.aliases, { required: f.required, lower: false, trim: f.trim !== false })
          : readString(raw, f.key, f.aliases, { required: f.required, trim: f.trim !== false });
      if (r.error) pushError(errors, { ...r.error, row }, row);
      extras[f.key] = r.value;
    }

    if (errors.length > 0) {
      return { row, raw, data: null, errors, action: 'skip' };
    }

    const id = (idIn.value && idIn.value.trim()) || idFromName(name.value || '', idPrefix);
    const data: Record<string, unknown> = {
      id,
      name: name.value,
      description: description.value || '',
      status: status.value,
      ...extras,
    };
    void catalog;
    return { row, raw, data, errors: [], action: undefined };
  };
}

export const parseSkillRow = buildSimpleParser('skill', 'skl');
export const parseWorkerRoleRow = buildSimpleParser('workerRole', 'wrl');
export const parseProjectTypeRow = buildSimpleParser('projectType', 'pt');
export const parseWorkOrderTypeRow = buildSimpleParser('workOrderType', 'wot');
export const parseCertificationRow = buildSimpleParser('certification', 'cert');

type AssetCatalog = 'equipment' | 'material';

function buildAssetParser(catalog: AssetCatalog) {
  const idPrefix = catalog === 'equipment' ? 'eq' : 'mat';
  return (raw: Record<string, unknown>, row: number): ParsedRow => {
    const errors: RowError[] = [];
    const idIn = readString(raw, 'id');
    if (idIn.error) pushError(errors, { ...idIn.error, row }, row);
    const name = readString(raw, 'name', [], { required: true });
    if (name.error) pushError(errors, { ...name.error, row }, row);
    const type = readString(raw, 'type', [], { required: true });
    if (type.error) pushError(errors, { ...type.error, row }, row);
    const identifier = readString(raw, 'identifier');
    if (identifier.error) pushError(errors, { ...identifier.error, row }, row);
    const brand = readString(raw, 'brand');
    if (brand.error) pushError(errors, { ...brand.error, row }, row);
    const status = readString(raw, 'status', [], { required: true });
    if (status.error) pushError(errors, { ...status.error, row }, row);
    const lastMaintenance = readDate(raw, 'lastMaintenance', ['last_maintenance']);
    if (lastMaintenance.error) pushError(errors, { ...lastMaintenance.error, row }, row);
    const nextMaintenance = readDate(raw, 'nextMaintenance', ['next_maintenance']);
    if (nextMaintenance.error) pushError(errors, { ...nextMaintenance.error, row }, row);
    const notes = readString(raw, 'notes');
    if (notes.error) pushError(errors, { ...notes.error, row }, row);

    if (errors.length > 0) {
      return { row, raw, data: null, errors, action: 'skip' };
    }

    const id = (idIn.value && idIn.value.trim()) || idFromName(name.value || '', idPrefix);
    const data: Record<string, unknown> = {
      id,
      name: name.value,
      type: type.value,
      identifier: identifier.value || '',
      brand: brand.value || '',
      status: status.value,
      lastMaintenance: lastMaintenance.value || null,
      nextMaintenance: nextMaintenance.value || null,
      notes: notes.value || '',
    };
    return { row, raw, data, errors: [], action: undefined };
  };
}

export const parseEquipmentRow = buildAssetParser('equipment');
export const parseMaterialRow = buildAssetParser('material');

export function parseStatusCatalogRow(
  raw: Record<string, unknown>,
  row: number,
): ParsedRow {
  const errors: RowError[] = [];
  const idIn = readString(raw, 'id', ['status_id']);
  if (idIn.error) pushError(errors, { ...idIn.error, row }, row);
  const scope = readEnum(
    raw,
    'scope',
    ['work_order', 'work_status', 'shift', 'timesheet', 'project', 'equipment', 'availability_request', 'incident', 'form_submission'],
    [],
    { required: true },
  );
  if (scope.error) pushError(errors, { ...scope.error, row }, row);
  const value = readString(raw, 'value', [], { required: true });
  if (value.error) pushError(errors, { ...value.error, row }, row);
  const name = readString(raw, 'name', [], { required: true });
  if (name.error) pushError(errors, { ...name.error, row }, row);
  const color = readString(raw, 'color', [], { allowEmpty: true });
  const sortOrder = readNumber(raw, 'sortOrder', ['sort_order'], { allowEmpty: true });
  if (sortOrder.error) pushError(errors, { ...sortOrder.error, row }, row);
  const blocksEditing = readNumber(raw, 'blocksEditing', ['blocks_editing'], { allowEmpty: true });
  const triggersNotification = readNumber(raw, 'triggersNotification', ['triggers_notification'], { allowEmpty: true });
  const requiresApproval = readNumber(raw, 'requiresApproval', ['requires_approval'], { allowEmpty: true });
  const status = readEnum(raw, 'status', ['active', 'inactive'], [], {
    required: true,
    defaultValue: 'active',
  });
  if (status.error) pushError(errors, { ...status.error, row }, row);

  if (errors.length > 0) {
    return { row, raw, data: null, errors, action: 'skip' };
  }

  const id = (idIn.value && idIn.value.trim()) || idFromName(`${scope.value}_${value.value}`, 'st');
  const data: Record<string, unknown> = {
    id,
    scope: scope.value,
    value: value.value,
    name: name.value,
    color: color.value || '#94A3B8',
    sortOrder: sortOrder.value ?? 0,
    blocksEditing: blocksEditing.value != null ? Boolean(blocksEditing.value) : false,
    triggersNotification:
      triggersNotification.value != null ? Boolean(triggersNotification.value) : false,
    requiresApproval: requiresApproval.value != null ? Boolean(requiresApproval.value) : false,
    status: status.value,
  };
  return { row, raw, data, errors: [], action: undefined };
}

export function parseCommercialCatalogItemRow(
  raw: Record<string, unknown>,
  row: number,
): ParsedRow {
  const errors: RowError[] = [];
  const idIn = readString(raw, 'id', ['item_id']);
  const sku = readString(raw, 'sku', [], { required: true });
  if (sku.error) pushError(errors, { ...sku.error, row }, row);
  const description = readString(raw, 'description', [], { required: true });
  if (description.error) pushError(errors, { ...description.error, row }, row);
  const type = readString(raw, 'type');
  const dailyRate = readNumber(raw, 'dailyRate', ['daily_rate'], {
    required: true,
    min: 0,
  });
  if (dailyRate.error) pushError(errors, { ...dailyRate.error, row }, row);
  const itemPrice = readNumber(raw, 'itemPrice', ['item_price'], { allowEmpty: true, min: 0 });
  if (itemPrice.error) pushError(errors, { ...itemPrice.error, row }, row);
  const unit = readString(raw, 'unit', [], { allowEmpty: true });
  const status = readString(raw, 'status', [], { required: true, allowEmpty: true });
  if (status.error) pushError(errors, { ...status.error, row }, row);
  const notes = readString(raw, 'notes');

  if (errors.length > 0) {
    return { row, raw, data: null, errors, action: 'skip' };
  }

  const data: Record<string, unknown> = {
    sku: sku.value,
    description: description.value,
    type: type.value || '',
    dailyRate: dailyRate.value,
    itemPrice: itemPrice.value ?? 0,
    unit: unit.value || 'Each',
    status: status.value || 'active',
    notes: notes.value || '',
  };
  if (idIn.value) data.id = idIn.value.trim();
  return { row, raw, data, errors: [], action: undefined };
}
