import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddShiftRequesterContact20260720001000 implements MigrationInterface {
  name = 'AddShiftRequesterContact20260720001000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "work_order_shifts" ADD COLUMN IF NOT EXISTS "requester_phone" varchar(64)`,
    );
    await queryRunner.query(
      `ALTER TABLE "work_order_shifts" ADD COLUMN IF NOT EXISTS "requester_email" varchar(255)`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "work_order_shifts" DROP COLUMN IF EXISTS "requester_email"`,
    );
    await queryRunner.query(
      `ALTER TABLE "work_order_shifts" DROP COLUMN IF EXISTS "requester_phone"`,
    );
  }
}
