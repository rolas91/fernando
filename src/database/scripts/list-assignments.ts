import { AppDataSource } from '../data-source';

async function main() {
  if (!AppDataSource.isInitialized) await AppDataSource.initialize();
  const ds = AppDataSource;

  const rows = await ds.query(`
    SELECT
      wo.id AS work_order_id,
      wo.order_number,
      wo.title AS assignment,
      wo.status AS assignment_status,
      p.name AS project,
      c.name AS client,
      ws.id AS shift_id,
      ws.date AS shift_date,
      ws.start_time,
      ws.end_time,
      r.id AS role_id,
      r.role_name,
      r.required_count,
      count(DISTINCT wsrcw.worker_id) FILTER (WHERE wsrcw.worker_id IS NOT NULL) AS assigned_count,
      count(*) FILTER (WHERE wsrcw.confirmation_status = 'confirmed') AS confirmed_count,
      count(*) FILTER (WHERE wsrcw.confirmation_status = 'pending') AS pending_count,
      count(*) FILTER (WHERE wsrcw.confirmation_status = 'declined') AS declined_count
    FROM work_orders wo
    LEFT JOIN projects p ON p.id = wo.project_id
    LEFT JOIN clients c ON c.id = p.client_id
    JOIN work_order_shifts ws ON ws.work_order_id = wo.id
    JOIN work_order_shift_roles r ON r.shift_id = ws.id
    LEFT JOIN work_order_shift_role_workers wsrcw ON wsrcw.role_id = r.id
    WHERE wo.deleted_at IS NULL
    GROUP BY
      wo.id, wo.order_number, wo.title, wo.status,
      p.name, c.name,
      ws.id, ws.date, ws.start_time, ws.end_time,
      r.id, r.role_name, r.required_count
    ORDER BY ws.date, r.role_name
  `);

  console.log(`Found ${rows.length} role assignments:\n`);
  for (const r of rows) {
    console.log(
      `${r.order_number} | ${r.shift_date} ${r.start_time}-${r.end_time} | ${r.role_name} (${r.assigned_count}/${r.required_count}) | ✓${r.confirmed_count} ⏳${r.pending_count} ✗${r.declined_count} | ${r.project}`,
    );
  }

  console.log('\n--- Per-worker detail ---');
  const details = await ds.query(`
    SELECT
      wo.order_number,
      ws.date AS shift_date,
      r.role_name,
      w.first_name || ' ' || w.last_name AS worker_name,
      wsrcw.confirmation_status,
      wsrcw.responded_at
    FROM work_orders wo
    JOIN work_order_shifts ws ON ws.work_order_id = wo.id
    JOIN work_order_shift_roles r ON r.shift_id = ws.id
    JOIN work_order_shift_role_workers wsrcw ON wsrcw.role_id = r.id
    JOIN workers w ON w.id = wsrcw.worker_id
    WHERE wo.deleted_at IS NULL
    ORDER BY ws.date, r.role_name, worker_name
  `);
  for (const d of details) {
    console.log(`  ${d.order_number} ${d.shift_date} ${d.role_name}: ${d.worker_name} → ${d.confirmation_status}${d.responded_at ? ' (' + d.responded_at.toISOString().slice(0, 10) + ')' : ''}`);
  }

  if (AppDataSource.isInitialized) await AppDataSource.destroy();
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
