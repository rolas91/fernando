import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddShiftName20260723001000 implements MigrationInterface {
  name = 'AddShiftName20260723001000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "work_order_shifts" ADD COLUMN IF NOT EXISTS "shift_name" varchar(180)`,
    );
    await queryRunner.query(
      `UPDATE "work_order_shifts"
       SET "shift_name" = CONCAT('Shift ', "date"::text)
       WHERE "shift_name" IS NULL OR BTRIM("shift_name") = ''`,
    );
    await queryRunner.query(
      `ALTER TABLE "work_order_shifts" ALTER COLUMN "shift_name" SET NOT NULL`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "work_order_shifts" DROP COLUMN IF EXISTS "shift_name"`,
    );
  }
}
