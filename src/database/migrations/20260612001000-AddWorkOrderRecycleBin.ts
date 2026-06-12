import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddWorkOrderRecycleBin20260612001000 implements MigrationInterface {
  name = 'AddWorkOrderRecycleBin20260612001000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "work_orders" ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMP NULL',
    );
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_work_orders_deleted_at" ON "work_orders" ("deleted_at")',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_work_orders_deleted_at"');
    await queryRunner.query('ALTER TABLE "work_orders" DROP COLUMN IF EXISTS "deleted_at"');
  }
}
