import { AppDataSource } from '../data-source';

type ResetResult = {
  workOrders: number;
  shifts: number;
  roles: number;
  workers: number;
  equipment: number;
  materials: number;
};

async function main() {
  if (!AppDataSource.isInitialized) await AppDataSource.initialize();
  const ds = AppDataSource;

  const counts = await Promise.all([
    ds.query(`SELECT COUNT(*)::int AS c FROM work_order_shifts`),
    ds.query(`SELECT COUNT(*)::int AS c FROM work_order_shift_roles`),
    ds.query(`SELECT COUNT(*)::int AS c FROM work_order_shift_role_workers`),
    ds.query(`SELECT COUNT(*)::int AS c FROM work_order_shift_role_equipment`),
    ds.query(`SELECT COUNT(*)::int AS c FROM work_order_shift_role_materials`),
    ds.query(`SELECT COUNT(*)::int AS c FROM work_orders WHERE deleted_at IS NULL`),
  ]);
  const before: ResetResult = {
    workOrders: counts[5][0].c,
    shifts: counts[0][0].c,
    roles: counts[1][0].c,
    workers: counts[2][0].c,
    equipment: counts[3][0].c,
    materials: counts[4][0].c,
  };

  console.log('--- BEFORE ---');
  console.log(JSON.stringify(before, null, 2));

  await ds.transaction(async (manager) => {
    await manager.query(`DELETE FROM work_order_shift_role_workers`);
    await manager.query(`DELETE FROM work_order_shift_role_equipment`);
    await manager.query(`DELETE FROM work_order_shift_role_materials`);
    await manager.query(`DELETE FROM work_order_shift_roles`);
    await manager.query(`DELETE FROM work_order_shifts`);
    await manager.query(`UPDATE work_orders SET shifts = '[]'::jsonb`);
    await manager.query(
      `DELETE FROM work_orders WHERE deleted_at IS NULL`,
    );
  });

  const afterCounts = await Promise.all([
    ds.query(`SELECT COUNT(*)::int AS c FROM work_order_shifts`),
    ds.query(`SELECT COUNT(*)::int AS c FROM work_order_shift_roles`),
    ds.query(`SELECT COUNT(*)::int AS c FROM work_order_shift_role_workers`),
    ds.query(`SELECT COUNT(*)::int AS c FROM work_order_shift_role_equipment`),
    ds.query(`SELECT COUNT(*)::int AS c FROM work_order_shift_role_materials`),
    ds.query(`SELECT COUNT(*)::int AS c FROM work_orders WHERE deleted_at IS NULL`),
  ]);
  const after: ResetResult = {
    workOrders: afterCounts[5][0].c,
    shifts: afterCounts[0][0].c,
    roles: afterCounts[1][0].c,
    workers: afterCounts[2][0].c,
    equipment: afterCounts[3][0].c,
    materials: afterCounts[4][0].c,
  };

  console.log('--- AFTER ---');
  console.log(JSON.stringify(after, null, 2));
  console.log('Reset complete. Catalogs (workers, equipment, materials, projects, clients, shift templates) preserved.');

  if (AppDataSource.isInitialized) await AppDataSource.destroy();
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
