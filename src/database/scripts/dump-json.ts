import { AppDataSource } from '../data-source';

async function main() {
  if (!AppDataSource.isInitialized) await AppDataSource.initialize();
  const ds = AppDataSource;

  const rows = await ds.query(
    'SELECT shifts FROM work_orders WHERE jsonb_array_length(shifts) > 0 LIMIT 1',
  );
  console.log('=== JSON shape (from DB) ===');
  console.log(JSON.stringify(rows[0].shifts, null, 2));

  if (AppDataSource.isInitialized) await AppDataSource.destroy();
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
