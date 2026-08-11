import { readCsv } from './common';
import { getDescriptor } from './descriptors';
import { parseWorkerRow } from './workers.parser';

describe('worker import parser', () => {
  it.each([',', '/', ';', '|'])(
    'accepts %s as a separator in every multi-value worker field',
    (separator) => {
      const parsed = parseWorkerRow(
        {
          firstName: 'Jane',
          lastName: 'Doe',
          email: 'jane@example.com',
          phone: '+15125550100',
          type: 'Flagger',
          role: 'Operator',
          status: 'active',
          hourlyRate: 22.5,
          skills: `First Aid${separator}Traffic Control`,
          workerRoles: `Operator${separator}Foreman`,
          certifications: `OSHA 10${separator}CPR`,
        },
        2,
      );

      expect(parsed.errors).toEqual([]);
      expect(parsed.data).toMatchObject({
        skills: ['First Aid', 'Traffic Control'],
        workerRoles: ['Operator', 'Foreman'],
        certifications: ['OSHA 10', 'CPR'],
      });
    },
  );

  it('trims, removes empty values, and deduplicates a mixed list', () => {
    expect(
      readCsv({ skills: ' First Aid, / Traffic Control ; First Aid | ' }, 'skills', [], {
        lower: false,
      }).value,
    ).toEqual(['First Aid', 'Traffic Control']);
  });

  it('keeps every importable worker field in the downloadable template', () => {
    expect(getDescriptor('workers').columns.map((column) => column.header)).toEqual([
      'id',
      'firstName',
      'lastName',
      'email',
      'phone',
      'driverLicense',
      'driverLicenseExpiration',
      'primaryAddress',
      'city',
      'zipCode',
      'state',
      'country',
      'latitude',
      'longitude',
      'type',
      'role',
      'status',
      'hireDate',
      'hourlyRate',
      'emergencyContact',
      'notes',
      'skills',
      'workerRoles',
      'certifications',
    ]);
  });
});
