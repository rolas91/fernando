import { AppDataSource } from '../data-source';

type Result = {
  workersScanned: number;
  workersWithRoles: number;
  workersWithoutRoles: number;
  workersWithTypeOnly: number;
  workersWithRolesAndType: number;
  workersWithRolesButTypeMismatch: number;
  typeSynced: number;
};

async function main() {
  if (!AppDataSource.isInitialized) await AppDataSource.initialize();
  const ds = AppDataSource;

  const rows = await ds.query(`
    SELECT
      w.id,
      w.type AS legacy_type,
      array_agg(wr.name ORDER BY wr.name) FILTER (WHERE wr.id IS NOT NULL) AS role_names
    FROM workers w
    LEFT JOIN worker_worker_roles wwr ON wwr.worker_id = w.id
    LEFT JOIN worker_roles wr ON wr.id = wwr.worker_role_id
    WHERE w.status <> 'inactive'
    GROUP BY w.id, w.type
    ORDER BY w.first_name, w.last_name
  `);

  const result: Result = {
    workersScanned: rows.length,
    workersWithRoles: 0,
    workersWithoutRoles: 0,
    workersWithTypeOnly: 0,
    workersWithRolesAndType: 0,
    workersWithRolesButTypeMismatch: 0,
    typeSynced: 0,
  };

  console.log(`Scanning ${rows.length} workers...`);
  console.log('');

  const examples: { id: string; legacy: string; roles: string[] }[] = [];

  for (const row of rows) {
    const roleNames: string[] = Array.isArray(row.role_names)
      ? row.role_names.filter((n: string | null) => typeof n === 'string' && n.length > 0)
      : [];
    const legacy = (row.legacy_type ?? '').trim();

    if (roleNames.length === 0) {
      result.workersWithoutRoles++;
      if (legacy) result.workersWithTypeOnly++;
      continue;
    }
    result.workersWithRoles++;
    if (legacy) result.workersWithRolesAndType++;
    const firstRole = roleNames[0];
    if (legacy && legacy.toLowerCase() !== firstRole.toLowerCase()) {
      result.workersWithRolesButTypeMismatch++;
      if (examples.length < 5) {
        examples.push({ id: row.id, legacy, roles: roleNames });
      }
    }
  }

  console.log('--- BEFORE ---');
  console.log(JSON.stringify(result, null, 2));
  if (examples.length > 0) {
    console.log('');
    console.log('Sample mismatches (first 5):');
    for (const ex of examples) {
      console.log(`  ${ex.id}: type="${ex.legacy}" but roles=[${ex.roles.join(', ')}]`);
    }
  }

  console.log('');
  console.log('Syncing legacy `type` to first role name for workers with roles...');

  const synced = await ds.query(`
    WITH first_role AS (
      SELECT DISTINCT ON (wwr.worker_id)
        wwr.worker_id,
        wr.name AS role_name
      FROM worker_worker_roles wwr
      JOIN worker_roles wr ON wr.id = wwr.worker_role_id
      WHERE wr.status <> 'inactive' AND wr.name IS NOT NULL AND wr.name <> ''
      ORDER BY wwr.worker_id, wr.name ASC
    )
    UPDATE workers w
    SET type = fr.role_name, updated_at = NOW()
    FROM first_role fr
    WHERE w.id = fr.worker_id
      AND (w.type IS DISTINCT FROM fr.role_name)
    RETURNING w.id
  `);

  result.typeSynced = synced.length;

  const after = await ds.query(`
    SELECT
      count(*) FILTER (WHERE legacy_match) AS matched,
      count(*) FILTER (WHERE NOT legacy_match) AS mismatched
    FROM (
      SELECT
        w.id,
        (lower(coalesce(w.type, '')) = lower(coalesce((
          SELECT wr.name
          FROM worker_worker_roles wwr
          JOIN worker_roles wr ON wr.id = wwr.worker_role_id
          WHERE wwr.worker_id = w.id AND wr.status <> 'inactive'
          ORDER BY wr.name
          LIMIT 1
        ), w.type))) AS legacy_match
      FROM workers w
      WHERE w.status <> 'inactive'
    ) t
  `);

  console.log('');
  console.log('--- AFTER ---');
  console.log(`Matched: ${after[0].matched}, Mismatched: ${after[0].mismatched}`);
  console.log(`Synced ${result.typeSynced} workers.`);

  if (AppDataSource.isInitialized) await AppDataSource.destroy();
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
