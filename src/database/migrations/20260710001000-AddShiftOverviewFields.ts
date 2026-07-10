import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddShiftOverviewFields20260710001000 implements MigrationInterface {
  name = 'AddShiftOverviewFields20260710001000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "work_order_shifts" ADD COLUMN IF NOT EXISTS "status" varchar(64) NOT NULL DEFAULT 'customer_pending'`);
    await queryRunner.query(`ALTER TABLE "work_order_shifts" ADD COLUMN IF NOT EXISTS "created_by_user_id" uuid`);
    await queryRunner.query(`ALTER TABLE "work_order_shifts" ADD COLUMN IF NOT EXISTS "requester_user_id" uuid`);
    await queryRunner.query(`ALTER TABLE "work_order_shifts" ADD COLUMN IF NOT EXISTS "address" text`);
    await queryRunner.query(`ALTER TABLE "work_order_shifts" ADD COLUMN IF NOT EXISTS "address_latitude" double precision`);
    await queryRunner.query(`ALTER TABLE "work_order_shifts" ADD COLUMN IF NOT EXISTS "address_longitude" double precision`);
    await queryRunner.query(`ALTER TABLE "work_order_shifts" ADD COLUMN IF NOT EXISTS "address_city" varchar(120)`);
    await queryRunner.query(`ALTER TABLE "work_order_shifts" ADD COLUMN IF NOT EXISTS "address_state" varchar(120)`);
    await queryRunner.query(`ALTER TABLE "work_order_shifts" ADD COLUMN IF NOT EXISTS "address_zip_code" varchar(32)`);
    await queryRunner.query(`ALTER TABLE "work_order_shifts" ADD COLUMN IF NOT EXISTS "address_country" varchar(120)`);
    await queryRunner.query(`ALTER TABLE "work_order_shifts" ADD COLUMN IF NOT EXISTS "requester_name" varchar(200)`);
    await queryRunner.query(`ALTER TABLE "work_order_shifts" ADD COLUMN IF NOT EXISTS "visible_document_types" jsonb NOT NULL DEFAULT '[]'::jsonb`);
    await queryRunner.query(`ALTER TABLE "work_order_shifts" ADD COLUMN IF NOT EXISTS "notes" text`);
    await queryRunner.query(`ALTER TABLE "work_order_shifts" ADD CONSTRAINT "FK_work_order_shifts_created_by_user" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL`);
    await queryRunner.query(`ALTER TABLE "work_order_shifts" ADD CONSTRAINT "FK_work_order_shifts_requester_user" FOREIGN KEY ("requester_user_id") REFERENCES "users"("id") ON DELETE SET NULL`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "work_order_shifts" DROP CONSTRAINT IF EXISTS "FK_work_order_shifts_requester_user"`);
    await queryRunner.query(`ALTER TABLE "work_order_shifts" DROP CONSTRAINT IF EXISTS "FK_work_order_shifts_created_by_user"`);
    await queryRunner.query(`ALTER TABLE "work_order_shifts" DROP COLUMN IF EXISTS "notes"`);
    await queryRunner.query(`ALTER TABLE "work_order_shifts" DROP COLUMN IF EXISTS "visible_document_types"`);
    await queryRunner.query(`ALTER TABLE "work_order_shifts" DROP COLUMN IF EXISTS "requester_name"`);
    await queryRunner.query(`ALTER TABLE "work_order_shifts" DROP COLUMN IF EXISTS "address"`);
    await queryRunner.query(`ALTER TABLE "work_order_shifts" DROP COLUMN IF EXISTS "address_country"`);
    await queryRunner.query(`ALTER TABLE "work_order_shifts" DROP COLUMN IF EXISTS "address_zip_code"`);
    await queryRunner.query(`ALTER TABLE "work_order_shifts" DROP COLUMN IF EXISTS "address_state"`);
    await queryRunner.query(`ALTER TABLE "work_order_shifts" DROP COLUMN IF EXISTS "address_city"`);
    await queryRunner.query(`ALTER TABLE "work_order_shifts" DROP COLUMN IF EXISTS "address_longitude"`);
    await queryRunner.query(`ALTER TABLE "work_order_shifts" DROP COLUMN IF EXISTS "address_latitude"`);
    await queryRunner.query(`ALTER TABLE "work_order_shifts" DROP COLUMN IF EXISTS "requester_user_id"`);
    await queryRunner.query(`ALTER TABLE "work_order_shifts" DROP COLUMN IF EXISTS "created_by_user_id"`);
    await queryRunner.query(`ALTER TABLE "work_order_shifts" DROP COLUMN IF EXISTS "status"`);
  }
}
