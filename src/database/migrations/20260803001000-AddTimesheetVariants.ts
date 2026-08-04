import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTimesheetVariants20260803001000 implements MigrationInterface {
  name = 'AddTimesheetVariants20260803001000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "timesheets" ADD COLUMN IF NOT EXISTS "variant" varchar(16) NOT NULL DEFAULT 'internal'`,
    );
    await queryRunner.query(
      `ALTER TABLE "timesheets" ADD COLUMN IF NOT EXISTS "source_submission_id" varchar(64)`,
    );
    await queryRunner.query(
      `ALTER TABLE "timesheets" ADD COLUMN IF NOT EXISTS "manually_edited" boolean NOT NULL DEFAULT false`,
    );
    // Existing payroll rows may already contain reviewed adjustments. Protect
    // them from the legacy submission reconciliation during the migration.
    await queryRunner.query(
      `UPDATE "timesheets" SET "manually_edited" = true WHERE "variant" = 'internal'`,
    );
    await queryRunner.query(
      `ALTER TABLE "timesheets" DROP CONSTRAINT IF EXISTS "CHK_timesheets_variant"`,
    );
    await queryRunner.query(
      `ALTER TABLE "timesheets" ADD CONSTRAINT "CHK_timesheets_variant" CHECK ("variant" IN ('client', 'internal'))`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_timesheets_shift_variant" ON "timesheets" ("work_order_id", "shift_id", "variant")`,
    );
    await queryRunner.query(
      `ALTER TABLE "work_order_shifts" ADD COLUMN IF NOT EXISTS "client_timesheet_notes" text NOT NULL DEFAULT ''`,
    );
    await queryRunner.query(
      `ALTER TABLE "work_order_shifts" ADD COLUMN IF NOT EXISTS "internal_timesheet_notes" text NOT NULL DEFAULT ''`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "work_order_shifts" DROP COLUMN IF EXISTS "internal_timesheet_notes"`,
    );
    await queryRunner.query(
      `ALTER TABLE "work_order_shifts" DROP COLUMN IF EXISTS "client_timesheet_notes"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_timesheets_shift_variant"`,
    );
    await queryRunner.query(
      `ALTER TABLE "timesheets" DROP CONSTRAINT IF EXISTS "CHK_timesheets_variant"`,
    );
    await queryRunner.query(
      `ALTER TABLE "timesheets" DROP COLUMN IF EXISTS "manually_edited"`,
    );
    await queryRunner.query(
      `ALTER TABLE "timesheets" DROP COLUMN IF EXISTS "source_submission_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "timesheets" DROP COLUMN IF EXISTS "variant"`,
    );
  }
}
