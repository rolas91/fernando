import { isSameMaterialImportRecord } from './catalog-import.service';
import { parseMaterialRow } from './parsers/simple-catalogs.parser';

describe('material catalog import identity', () => {
  const existing = {
    identifier: 'MAT-100',
    name: 'Traffic Cone',
    type: 'Traffic Control',
  };

  it('matches only when Material ID, name, and type all match', () => {
    expect(
      isSameMaterialImportRecord(existing, {
        identifier: ' mat-100 ',
        name: 'traffic cone',
        type: 'traffic control',
      }),
    ).toBe(true);
  });

  it.each([
    ['different Material ID', { ...existing, identifier: 'MAT-101' }],
    ['different name', { ...existing, name: 'Channelizer' }],
    ['different type', { ...existing, type: 'Safety Equipment' }],
  ])('does not match a record with a %s', (_difference, candidate) => {
    expect(isSameMaterialImportRecord(existing, candidate)).toBe(false);
  });

  it('does not match when one of the three identity fields is missing', () => {
    expect(
      isSameMaterialImportRecord(existing, {
        identifier: 'MAT-100',
        name: 'Traffic Cone',
        type: '',
      }),
    ).toBe(false);
  });

  it('accepts Material ID as an alias for the visible identifier', () => {
    const parsed = parseMaterialRow(
      {
        'Material ID': 'MAT-100',
        name: 'Traffic Cone',
        type: 'Traffic Control',
        status: 'available',
      },
      2,
    );

    expect(parsed.errors).toEqual([]);
    expect(parsed.data).toMatchObject({
      identifier: 'MAT-100',
      name: 'Traffic Cone',
      type: 'Traffic Control',
    });
  });

  it('rejects a material without a Material ID', () => {
    const parsed = parseMaterialRow(
      { name: 'Traffic Cone', type: 'Traffic Control', status: 'available' },
      7,
    );

    expect(parsed.errors).toContainEqual(
      expect.objectContaining({
        row: 7,
        field: 'identifier',
        code: 'REQUIRED',
      }),
    );
  });

  it('generates different internal IDs for the same visible ID and name in different types', () => {
    const signage = parseMaterialRow(
      {
        'Material ID': 'MAT-100',
        name: 'Traffic Cone',
        type: 'Signage',
        status: 'available',
      },
      2,
    );
    const safety = parseMaterialRow(
      {
        'Material ID': 'MAT-100',
        name: 'Traffic Cone',
        type: 'Safety',
        status: 'available',
      },
      3,
    );

    expect(signage.data?.id).not.toBe(safety.data?.id);
  });
});
