import type { ParsedRow, RowError } from './parser.types';
import {
  idFromName,
  pushError,
  readBoolean,
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
export const parseCertificationRow = buildSimpleParser('certification', 'cert', [
  { key: 'documentUrl', aliases: ['document_url'], required: false },
]);

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
    const identifier = readString(
      raw,
      'identifier',
      catalog === 'material' ? ['material_id'] : [],
      { required: catalog === 'material' },
    );
    if (identifier.error) pushError(errors, { ...identifier.error, row }, row);
    const brand = readString(raw, 'brand');
    if (brand.error) pushError(errors, { ...brand.error, row }, row);
    const status = readString(raw, 'status', [], { required: true });
    if (status.error) pushError(errors, { ...status.error, row }, row);
    const lastMaintenance = readDate(raw, 'lastMaintenance', ['last_maintenance']);
    if (lastMaintenance.error) pushError(errors, { ...lastMaintenance.error, row }, row);
    const nextMaintenance = readDate(raw, 'nextMaintenance', ['next_maintenance']);
    if (nextMaintenance.error) pushError(errors, { ...nextMaintenance.error, row }, row);
    const price = readNumber(raw, 'price', [], { allowEmpty: true, min: 0 });
    if (price.error) pushError(errors, { ...price.error, row }, row);
    const notes = readString(raw, 'notes');
    if (notes.error) pushError(errors, { ...notes.error, row }, row);

    if (errors.length > 0) {
      return { row, raw, data: null, errors, action: 'skip' };
    }

    const generatedIdSource =
      catalog === 'material'
        ? `${identifier.value || ''}_${name.value || ''}_${type.value || ''}`
        : name.value || '';
    const id =
      (idIn.value && idIn.value.trim()) ||
      idFromName(generatedIdSource, idPrefix);
    const data: Record<string, unknown> = {
      id,
      name: name.value,
      type: type.value,
      identifier: identifier.value || '',
      brand: brand.value || '',
      status: status.value,
      price: price.value ?? 0,
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
  const blocksEditing = readBoolean(raw, 'blocksEditing', ['blocks_editing'], { default: false });
  if (blocksEditing.error) pushError(errors, { ...blocksEditing.error, row }, row);
  const triggersNotification = readBoolean(raw, 'triggersNotification', ['triggers_notification'], { default: false });
  if (triggersNotification.error) pushError(errors, { ...triggersNotification.error, row }, row);
  const requiresApproval = readBoolean(raw, 'requiresApproval', ['requires_approval'], { default: false });
  if (requiresApproval.error) pushError(errors, { ...requiresApproval.error, row }, row);
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
    blocksEditing: blocksEditing.value,
    triggersNotification: triggersNotification.value,
    requiresApproval: requiresApproval.value,
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

export function parseProjectRow(
  raw: Record<string, unknown>,
  row: number,
): ParsedRow {
  const errors: RowError[] = [];
  const idIn = readString(raw, 'id', ['project_id']);
  const number = readString(raw, 'number', [], { required: true });
  if (number.error) pushError(errors, { ...number.error, row }, row);
  const name = readString(raw, 'name', [], { required: true });
  if (name.error) pushError(errors, { ...name.error, row }, row);
  const clientId = readString(raw, 'clientId', ['client_id']);
  const clientName = readString(raw, 'clientName', ['client_name']);
  const projectTypeId = readString(raw, 'projectTypeId', ['project_type_id']);
  const projectTypeName = readString(raw, 'projectTypeName', ['project_type_name']);
  const projectManager = readString(raw, 'projectManager', ['project_manager']);
  const projectManagerEmail = readString(raw, 'projectManagerEmail', ['project_manager_email']);
  const location = readString(raw, 'location');
  const city = readString(raw, 'city');
  const state = readString(raw, 'state');
  const zipCode = readString(raw, 'zipCode', ['zip_code', 'zip']);
  const country = readString(raw, 'country', [], { allowEmpty: true });
  const latitude = readNumber(raw, 'latitude', [], { allowEmpty: true });
  if (latitude.error) pushError(errors, { ...latitude.error, row }, row);
  const longitude = readNumber(raw, 'longitude', [], { allowEmpty: true });
  if (longitude.error) pushError(errors, { ...longitude.error, row }, row);
  const status = readString(raw, 'status', [], { required: true });
  if (status.error) pushError(errors, { ...status.error, row }, row);
  const workOrderNumber = readString(raw, 'workOrderNumber', ['work_order_number']);
  const purchaseOrder = readString(raw, 'purchaseOrder', ['purchase_order']);
  const startDate = readDate(raw, 'startDate', ['start_date']);
  const endDate = readDate(raw, 'endDate', ['end_date']);
  const description = readString(raw, 'description');
  const notes = readString(raw, 'notes');

  if (errors.length > 0) {
    return { row, raw, data: null, errors, action: 'skip' };
  }

  const id = (idIn.value && idIn.value.trim()) || idFromName(number.value || '', 'prj');
  const data: Record<string, unknown> = {
    id,
    number: number.value,
    name: name.value,
    clientId: clientId.value || '',
    clientName: clientName.value || '',
    projectTypeId: projectTypeId.value || '',
    projectTypeName: projectTypeName.value || '',
    projectManager: projectManager.value || '',
    projectManagerEmail: projectManagerEmail.value || '',
    location: location.value || '',
    city: city.value || '',
    state: state.value || '',
    zipCode: zipCode.value || '',
    country: country.value || 'USA',
    latitude: latitude.value ?? null,
    longitude: longitude.value ?? null,
    status: status.value,
    workOrderNumber: workOrderNumber.value || '',
    purchaseOrder: purchaseOrder.value || '',
    startDate: startDate.value || null,
    endDate: endDate.value || null,
    description: description.value || '',
    notes: notes.value || '',
  };
  return { row, raw, data, errors: [], action: undefined };
}
