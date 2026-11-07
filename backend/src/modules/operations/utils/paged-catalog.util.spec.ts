import { DataSource } from 'typeorm';
import { Client } from '../../../entities/client.entity';
import { Equipment } from '../../../entities/equipment.entity';
import { Material } from '../../../entities/material.entity';
import { catalogQuery, catalogText, pageNumber } from './paged-catalog.util';

describe('paged catalog SQL and validation', () => {
  let source: DataSource;
  beforeAll(async () => {
    source = new DataSource({
      type: 'postgres',
      entities: [Client, Equipment, Material],
    });
    await (
      source as unknown as { buildMetadatas(): Promise<void> }
    ).buildMetadatas();
  });
  it.each(['0', '-1', '1.5', 'Infinity', 'NaN', '1e4', '', '10000001'])(
    'rejects invalid page %s',
    (value) => {
      expect(() => pageNumber(value, 1, 10000000)).toThrow();
    },
  );
  it('caps page size with explicit validation and rejects non-string filters', () => {
    expect(pageNumber(undefined, 25, 100)).toBe(25);
    expect(pageNumber('100', 25, 100)).toBe(100);
    expect(() => pageNumber('101', 25, 100)).toThrow();
    expect(() => catalogText(['bad'])).toThrow();
    expect(() => catalogText('a'.repeat(301))).toThrow();
  });
  it('searches all configured client fields with bound literal wildcard characters', () => {
    const query = catalogQuery(source.getRepository(Client), 'clients', {
      search: 'A%_B',
      status: 'active',
    })
      .skip(25)
      .take(25);
    const [sql, params] = query.getQueryAndParameters();
    expect(sql).toContain('"item"."contact_name"');
    expect(sql).toContain('CONCAT_WS');
    expect(sql).toContain('LIMIT 25 OFFSET 25');
    expect(sql).toContain('ORDER BY LOWER("item"."name") ASC, "item"."id" ASC');
    expect(params).toEqual(['%a\\%\\_b%', 'active']);
  });
  it.each([
    ['equipment', Equipment],
    ['materials', Material],
  ] as const)(
    'retains soft deletes and natural multi-number ordering for %s',
    (resource, entity) => {
      const [sql, params] = catalogQuery(
        source.getRepository(entity),
        resource,
        { type: 'Cone', status: 'available' },
      ).getQueryAndParameters();
      expect(sql).toContain('"item"."deleted_at" IS NULL');
      expect(sql).toContain('regexp_matches');
      expect(sql).toContain('WITH ORDINALITY');
      expect(sql).toContain('"item"."id" ASC');
      expect(params).toEqual(['available', 'Cone']);
      if (resource === 'materials') {
        const [searchSql] = catalogQuery(
          source.getRepository(Material),
          'materials',
          { search: 'SKU' },
        ).getQueryAndParameters();
        expect(searchSql).toContain('"item"."sku"');
        expect(searchSql).toContain('"item"."id"');
      }
    },
  );
  it('rejects unsupported client type filters instead of silently changing results', () => {
    expect(() =>
      catalogQuery(source.getRepository(Client), 'clients', { type: 'wrong' }),
    ).toThrow();
  });
});
