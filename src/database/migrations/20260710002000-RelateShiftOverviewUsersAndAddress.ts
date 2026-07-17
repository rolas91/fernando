import { MigrationInterface, QueryRunner } from 'typeorm';

export class RelateShiftOverviewUsersAndAddress20260710002000 implements MigrationInterface {
  name = 'RelateShiftOverviewUsersAndAddress20260710002000';
  async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "work_order_shifts" ADD COLUMN IF NOT EXISTS "requester_user_id" uuid, ADD COLUMN IF NOT EXISTS "address_latitude" double precision, ADD COLUMN IF NOT EXISTS "address_longitude" double precision, ADD COLUMN IF NOT EXISTS "address_city" varchar(120), ADD COLUMN IF NOT EXISTS "address_state" varchar(120), ADD COLUMN IF NOT EXISTS "address_zip_code" varchar(32), ADD COLUMN IF NOT EXISTS "address_country" varchar(120)`);
    await q.query(`ALTER TABLE "work_order_shifts" ALTER COLUMN "created_by_user_id" TYPE uuid USING NULLIF("created_by_user_id"::text, '')::uuid`);
    await q.query(`DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='FK_work_order_shifts_created_by_user') THEN ALTER TABLE "work_order_shifts" ADD CONSTRAINT "FK_work_order_shifts_created_by_user" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL; END IF; IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='FK_work_order_shifts_requester_user') THEN ALTER TABLE "work_order_shifts" ADD CONSTRAINT "FK_work_order_shifts_requester_user" FOREIGN KEY ("requester_user_id") REFERENCES "users"("id") ON DELETE SET NULL; END IF; END $$`);
  }
  async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "work_order_shifts" DROP CONSTRAINT IF EXISTS "FK_work_order_shifts_requester_user", DROP CONSTRAINT IF EXISTS "FK_work_order_shifts_created_by_user"`);
  }
}
