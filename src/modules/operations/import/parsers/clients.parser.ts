import type { ParsedRow, RowError } from './parser.types';
import { idFromName, pushError, readNumber, readString } from './common';

export function parseClientRow(
  raw: Record<string, unknown>,
  row: number,
): ParsedRow {
  const errors: RowError[] = [];
  const idIn = readString(raw, 'id', ['client_id']);
  const name = readString(raw, 'name', [], { required: true });
  if (name.error) pushError(errors, { ...name.error, row }, row);
  const contactName = readString(raw, 'contactName', ['contact_name']);
  const email = readString(raw, 'email');
  const phone = readString(raw, 'phone');
  const website = readString(raw, 'website');
  const address = readString(raw, 'address');
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
  const notes = readString(raw, 'notes');

  if (errors.length > 0) {
    return { row, raw, data: null, errors, action: 'skip' };
  }

  const id = (idIn.value && idIn.value.trim()) || idFromName(name.value || '', 'cli');
  const data: Record<string, unknown> = {
    id,
    name: name.value,
    contactName: contactName.value || '',
    email: email.value || '',
    phone: phone.value || '',
    website: website.value || '',
    address: address.value || '',
    city: city.value || '',
    state: state.value || '',
    zipCode: zipCode.value || '',
    country: country.value || 'USA',
    latitude: latitude.value ?? null,
    longitude: longitude.value ?? null,
    status: status.value,
    notes: notes.value || '',
  };
  return { row, raw, data, errors: [], action: undefined };
}
