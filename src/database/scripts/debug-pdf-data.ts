import { AppDataSource } from '../data-source';

type Result = {
  submissionId: string;
  workOrderId: string | null;
  workOrderExists: boolean;
  shiftId: string | null;
  shiftExistsInTable: boolean;
  shiftsFoundForWorkOrder: number;
  pdfUrl: string | null;
};

async function main() {
  if (!AppDataSource.isInitialized) await AppDataSource.initialize();
  const ds = AppDataSource;

  const rows = await ds.query(`
    SELECT
      fs.id,
      fs.work_order_id,
      fs.shift_id,
      fs.pdf_url,
      fs.submitted_at,
      wo.id AS wo_row_exists
    FROM form_submissions fs
    LEFT JOIN work_orders wo ON wo.id = fs.work_order_id AND wo.deleted_at IS NULL
    WHERE fs.submitted_at IS NOT NULL
    ORDER BY fs.submitted_at DESC
    LIMIT 20
  `);

  const results: Result[] = [];

  for (const row of rows) {
    const shifts = row.work_order_id
      ? await ds.query(
          `SELECT id FROM work_order_shifts WHERE work_order_id = $1`,
          [row.work_order_id],
        )
      : [];
    const shiftExists = row.shift_id
      ? await ds.query(
          `SELECT 1 FROM work_order_shifts WHERE id = $1 AND work_order_id = $2 LIMIT 1`,
          [row.shift_id, row.work_order_id],
        )
      : [];

    results.push({
      submissionId: row.id,
      workOrderId: row.work_order_id,
      workOrderExists: !!row.wo_row_exists,
      shiftId: row.shift_id,
      shiftExistsInTable: shiftExists.length > 0,
      shiftsFoundForWorkOrder: shifts.length,
      pdfUrl: row.pdf_url,
    });
  }

  console.log('Most recent 20 submitted form submissions:\n');
  for (const r of results) {
    const status = !r.workOrderExists
      ? '❌ WORK ORDER MISSING'
      : !r.shiftExistsInTable
      ? '❌ SHIFT MISSING IN RELATIONAL TABLE'
      : r.shiftsFoundForWorkOrder === 0
      ? '❌ WORK ORDER HAS NO SHIFTS'
      : '✅';
    console.log(`${status} ${r.submissionId}`);
    console.log(`   workOrderId: ${r.workOrderId || '(none)'} | exists=${r.workOrderExists}`);
    console.log(`   shiftId:     ${r.shiftId || '(none)'} | existsInTable=${r.shiftExistsInTable}`);
    console.log(`   shifts for WO: ${r.shiftsFoundForWorkOrder}`);
    console.log(`   pdfUrl:      ${r.pdfUrl || '(none)'}`);
    console.log('');
  }

  if (AppDataSource.isInitialized) await AppDataSource.destroy();
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
