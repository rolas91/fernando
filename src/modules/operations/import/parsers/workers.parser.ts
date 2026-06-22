import type { ParsedRow, RowError } from './parser.types';
import { idFromName, pushError, readCsv, readDate, readNumber, readString } from './common';

export function parseWorkerRow(
  raw: Record<string, unknown>,
  row: number,
): ParsedRow {
  const errors: RowError[] = [];
  if (pickFieldExists(raw, 'createAppUser') || pickFieldExists(raw, 'appUserPassword') || pickFieldExists(raw, 'appUserRole')) {
    pushError(errors, { row, field: 'createAppUser', code: 'FORBIDDEN_COLUMN', message: 'No se permite crear usuarios desde el import de workers' }, row);
  }

  const idIn = readString(raw, 'id', ['worker_id']);
  const firstName = readString(raw, 'firstName', ['first_name'], { required: true });
  if (firstName.error) pushError(errors, { ...firstName.error, row }, row);
  const lastName = readString(raw, 'lastName', ['last_name'], { required: true });
  if (lastName.error) pushError(errors, { ...lastName.error, row }, row);
  const email = readString(raw, 'email', [], { required: true });
  if (email.error) pushError(errors, { ...email.error, row }, row);
  const phone = readString(raw, 'phone', [], { required: true });
  if (phone.error) pushError(errors, { ...phone.error, row }, row);
  const driverLicense = readString(raw, 'driverLicense', ['driver_license']);
  const driverLicenseExpiration = readDate(raw, 'driverLicenseExpiration', ['driver_license_expiration']);
  const primaryAddress = readString(raw, 'primaryAddress', ['address', 'primary_address']);
  const city = readString(raw, 'city');
  const zipCode = readString(raw, 'zipCode', ['zip_code', 'zip']);
  const state = readString(raw, 'state');
  const country = readString(raw, 'country', [], { allowEmpty: true });
  const latitude = readNumber(raw, 'latitude', [], { allowEmpty: true });
  if (latitude.error) pushError(errors, { ...latitude.error, row }, row);
  const longitude = readNumber(raw, 'longitude', [], { allowEmpty: true });
  if (longitude.error) pushError(errors, { ...longitude.error, row }, row);
  const type = readString(raw, 'type', [], { required: true });
  if (type.error) pushError(errors, { ...type.error, row }, row);
  const role = readString(raw, 'role', [], { required: true });
  if (role.error) pushError(errors, { ...role.error, row }, row);
  const status = readString(raw, 'status', [], { required: true });
  if (status.error) pushError(errors, { ...status.error, row }, row);
  const hireDate = readDate(raw, 'hireDate', ['hire_date']);
  const hourlyRate = readNumber(raw, 'hourlyRate', ['hourly_rate'], { required: true, min: 0, max: 1000 });
  if (hourlyRate.error) pushError(errors, { ...hourlyRate.error, row }, row);
  const emergencyContact = readString(raw, 'emergencyContact', ['emergency_contact']);
  const notes = readString(raw, 'notes');
  const skills = readCsv(raw, 'skills', [], { lower: false, trim: true });
  if (skills.error) pushError(errors, { ...skills.error, row }, row);
  const workerRoles = readCsv(raw, 'workerRoles', ['roles'], { lower: false, trim: true });
  if (workerRoles.error) pushError(errors, { ...workerRoles.error, row }, row);
  const certifications = readCsv(raw, 'certifications', [], { lower: false, trim: true });
  if (certifications.error) pushError(errors, { ...certifications.error, row }, row);

  if (errors.length > 0) {
    return { row, raw, data: null, errors, action: 'skip' };
  }

  const baseId = (idIn.value && idIn.value.trim()) || idFromName(`${firstName.value}_${lastName.value}`, 'wkr');
  const data: Record<string, unknown> = {
    id: baseId,
    firstName: firstName.value,
    lastName: lastName.value,
    email: email.value,
    phone: phone.value,
    driverLicense: driverLicense.value || '',
    driverLicenseExpiration: driverLicenseExpiration.value || null,
    primaryAddress: primaryAddress.value || '',
    city: city.value || '',
    zipCode: zipCode.value || '',
    state: state.value || '',
    country: country.value || 'USA',
    latitude: latitude.value ?? null,
    longitude: longitude.value ?? null,
    type: type.value,
    role: role.value,
    status: status.value,
    hireDate: hireDate.value || null,
    hourlyRate: hourlyRate.value,
    emergencyContact: emergencyContact.value || null,
    notes: notes.value || '',
    skills: skills.value,
    workerRoles: workerRoles.value,
    certifications: certifications.value,
  };
  return { row, raw, data, errors: [], action: undefined };
}

function pickFieldExists(raw: Record<string, unknown>, key: string): boolean {
  const target = key.toLowerCase();
  for (const k of Object.keys(raw)) {
    if (k.toLowerCase() === target) {
      const v = raw[k];
      return v !== undefined && v !== null && String(v).trim() !== '';
    }
  }
  return false;
}
