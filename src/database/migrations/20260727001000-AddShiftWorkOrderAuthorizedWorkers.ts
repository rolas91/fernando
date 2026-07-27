import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddShiftWorkOrderAuthorizedWorkers20260727001000
  implements MigrationInterface
{
  name = 'AddShiftWorkOrderAuthorizedWorkers20260727001000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "work_order_shifts"
      ADD COLUMN IF NOT EXISTS "work_order_authorized_worker_ids"
      jsonb NOT NULL DEFAULT '[]'::jsonb
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "work_order_shifts"
      DROP COLUMN IF EXISTS "work_order_authorized_worker_ids"
    `);
  }
}
