import { AppDataSource } from '../data-source';

async function main() {
  if (!AppDataSource.isInitialized) await AppDataSource.initialize();
  const ds = AppDataSource;

  const last = await ds.query('SELECT name FROM migrations ORDER BY id DESC LIMIT 5');
  console.log('Last 5 migrations:');
  for (const r of last) console.log('  -', r.name);

  const tables = await ds.query(
    "SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename LIKE 'work_order_shift%'",
  );
  console.log('Relational tables present:');
  for (const t of tables) console.log('  -', t.tablename);
  if (tables.length === 0) console.log('  (none)');

  const counts = await Promise.all(
    tables.map(async (t: { tablename: string }) => {
      const rows = await ds.query(`SELECT count(*)::int AS c FROM "${t.tablename}"`);
      return { table: t.tablename, count: rows[0].c };
    }),
  );
  console.log('Row counts:');
  for (const c of counts) console.log(`  - ${c.table}: ${c.count} rows`);

  const woCount = await ds.query('SELECT count(*)::int AS c FROM work_orders');
  const woShifts = await ds.query('SELECT count(*)::int AS c FROM work_orders WHERE jsonb_array_length(shifts) > 0');
  console.log(`Work orders: ${woCount[0].c} total, ${woShifts[0].c} with shifts in JSON`);

  if (AppDataSource.isInitialized) await AppDataSource.destroy();
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
