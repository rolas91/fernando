import type { MigrationInterface, QueryRunner } from 'typeorm';

export class IncludeVariantInTimesheetUniqueIndex20260806001000
  implements MigrationInterface
{
  name = 'IncludeVariantInTimesheetUniqueIndex20260806001000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_timesheets_work_order_shift_worker_unique"`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_timesheets_work_order_shift_worker_unique"
       ON "timesheets" ("work_order_id", "shift_id", "worker_id", "variant")
       WHERE "work_order_id" <> '' AND "shift_id" <> '' AND "worker_id" <> ''`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_timesheets_work_order_shift_worker_unique"`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_timesheets_work_order_shift_worker_unique"
       ON "timesheets" ("work_order_id", "shift_id", "worker_id")
       WHERE "work_order_id" <> '' AND "shift_id" <> '' AND "worker_id" <> ''`,
    );
  }
}
