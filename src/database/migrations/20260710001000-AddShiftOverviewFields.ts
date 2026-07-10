import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddShiftOverviewFields20260710001000 implements MigrationInterface {
  name = 'AddShiftOverviewFields20260710001000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "work_order_shifts" ADD COLUMN IF NOT EXISTS "status" varchar(64) NOT NULL DEFAULT 'customer_pending'`);
    await queryRunner.query(`ALTER TABLE "work_order_shifts" ADD COLUMN IF NOT EXISTS "created_by_user_id" varchar(64)`);
    await queryRunner.query(`ALTER TABLE "work_order_shifts" ADD COLUMN IF NOT EXISTS "address" text`);
    await queryRunner.query(`ALTER TABLE "work_order_shifts" ADD COLUMN IF NOT EXISTS "requester_name" varchar(200)`);
    await queryRunner.query(`ALTER TABLE "work_order_shifts" ADD COLUMN IF NOT EXISTS "visible_document_types" jsonb NOT NULL DEFAULT '[]'::jsonb`);
    await queryRunner.query(`ALTER TABLE "work_order_shifts" ADD COLUMN IF NOT EXISTS "notes" text`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "work_order_shifts" DROP COLUMN IF EXISTS "notes"`);
    await queryRunner.query(`ALTER TABLE "work_order_shifts" DROP COLUMN IF EXISTS "visible_document_types"`);
    await queryRunner.query(`ALTER TABLE "work_order_shifts" DROP COLUMN IF EXISTS "requester_name"`);
    await queryRunner.query(`ALTER TABLE "work_order_shifts" DROP COLUMN IF EXISTS "address"`);
    await queryRunner.query(`ALTER TABLE "work_order_shifts" DROP COLUMN IF EXISTS "created_by_user_id"`);
    await queryRunner.query(`ALTER TABLE "work_order_shifts" DROP COLUMN IF EXISTS "status"`);
  }
}
