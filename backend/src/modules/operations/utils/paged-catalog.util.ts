import { BadRequestException } from '@nestjs/common';
import { ObjectLiteral, Repository } from 'typeorm';

export const CATALOG_FIELDS = {
  incidents: ['title', 'description', 'location'],
  workers: ['firstName', 'lastName', 'email', 'type'],
  projects: ['name', 'number', 'city', 'location', 'state', 'zipCode'],
  clients: [
    'name',
    'contactName',
    'email',
    'website',
    'address',
    'city',
    'state',
  ],
  equipment: ['name', 'identifier', 'type', 'brand'],
  materials: ['name', 'identifier', 'id', 'sku', 'type', 'brand'],
} as const;
export type PagedCatalog = keyof typeof CATALOG_FIELDS;
export interface CatalogListInput {
  search?: unknown;
  status?: unknown;
  type?: unknown;
  sort?: unknown;
  direction?: unknown;
  statusOrder?: string[];
}

export function pageNumber(
  value: unknown,
  fallback: number,
  max: number,
): number {
  if (value === undefined) return fallback;
  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value))
    throw new BadRequestException('Page and limit must be positive integers.');
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number > max)
    throw new BadRequestException('Page or limit exceeds the supported range.');
  return number;
}

export function catalogText(value: unknown, max = 300): string {
  if (value === undefined) return '';
  if (typeof value !== 'string' || value.length > max)
    throw new BadRequestException('Invalid catalog filter.');
  return value;
}

export function catalogQuery<T extends ObjectLiteral>(
  repo: Repository<T>,
  resource: PagedCatalog,
  input: CatalogListInput,
) {
  const query = repo.createQueryBuilder('item');
  const search = catalogText(input.search);
  const status = catalogText(input.status, 120);
  const type = catalogText(input.type, 120);
  if (search) {
    const columns = CATALOG_FIELDS[resource]
      .map((field) => 'item.' + field)
      .join(', ');
    const escaped = search
      .toLowerCase()
      .replace(/[\\%_]/g, (value) => String.fromCharCode(92) + value);
    const roles =
      "COALESCE((SELECT string_agg(role.name, ' ' ORDER BY role.name) FROM worker_worker_roles link JOIN worker_roles role ON role.id = link.worker_role_id WHERE link.worker_id = item.id), '')";
    const client =
      "COALESCE((SELECT client.name FROM clients client WHERE client.id = item.client_id), '')";
    const expression =
      resource === 'incidents'
        ? 'CONCAT(item.title, item.description, item.location)'
        : resource === 'workers'
          ? "CONCAT_WS(' ', " + columns + ', ' + roles + ')'
          : resource === 'projects'
            ? 'CONCAT(item.name, item.number, ' +
              client +
              ', item.city, item.location, item.state, item.zipCode)'
            : "CONCAT_WS(' ', " + columns + ')';
    query.andWhere('LOWER(' + expression + ') LIKE :search', {
      search: '%' + escaped + '%',
    });
  }
  if (status) query.andWhere('item.status = :status', { status });
  if (type) {
    if (resource === 'clients' || resource === 'incidents')
      throw new BadRequestException('Clients do not support a type filter.');
    if (resource === 'workers')
      query.andWhere(
        '(item.type = :type OR EXISTS (SELECT 1 FROM worker_worker_roles link JOIN worker_roles role ON role.id = link.worker_role_id WHERE link.worker_id = item.id AND role.name = :type))',
        { type },
      );
    else if (resource === 'projects')
      throw new BadRequestException('Projects do not support a type filter.');
    else query.andWhere('item.type = :type', { type });
  }
  if (resource === 'incidents') {
    query.orderBy('item.date', 'DESC');
  } else if (resource === 'projects') {
    const sort = catalogText(input.sort) || 'date';
    const direction = catalogText(input.direction) || 'asc';
    if (
      !['date', 'name', 'status'].includes(sort) ||
      !['asc', 'desc'].includes(direction)
    )
      throw new BadRequestException('Invalid project sort.');
    const order = direction === 'asc' ? 'ASC' : 'DESC';
    if (sort === 'status') {
      const statuses = input.statusOrder?.length
        ? input.statusOrder
        : ['pending', 'confirmed', 'in_progress', 'completed', 'cancelled'];
      const cases = statuses.map((status, index) => {
        query.setParameter('sortStatus' + index, status);
        return 'WHEN :sortStatus' + index + ' THEN ' + index;
      });
      query.orderBy(
        'CASE item.status ' + cases.join(' ') + ' ELSE 2147483647 END',
        order,
      );
    } else
      query.orderBy(
        sort === 'date' ? 'item.startDate' : 'LOWER(item.name)',
        order,
        order === 'ASC' ? 'NULLS FIRST' : 'NULLS LAST',
      );
  } else if (resource === 'workers') {
    query.orderBy('item.firstName', 'ASC').addOrderBy('item.lastName', 'ASC');
  } else if (resource !== 'clients') {
    // Compare every digit run numerically, including multiple runs in one identifier.
    const natural =
      "(SELECT string_agg(CASE WHEN (part)[1] ~ '^[0-9]+$' THEN lpad(length(ltrim((part)[1], '0'))::text, 6, '0') || ltrim((part)[1], '0') ELSE lower((part)[1]) END, '' ORDER BY ordinal) FROM regexp_matches(COALESCE(item.identifier, ''), '([0-9]+|[^0-9]+)', 'g') WITH ORDINALITY AS tokens(part, ordinal))";
    query.orderBy(natural, 'ASC', 'NULLS FIRST');
    query.addOrderBy('LOWER(item.name)', 'ASC');
  } else query.orderBy('LOWER(item.name)', 'ASC');
  return query.addOrderBy('item.id', 'ASC');
}
