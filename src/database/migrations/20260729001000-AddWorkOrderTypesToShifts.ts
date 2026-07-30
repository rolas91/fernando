import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddWorkOrderTypesToShifts20260729001000
  implements MigrationInterface
{
  name = 'AddWorkOrderTypesToShifts20260729001000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "work_order_shifts"
      ADD COLUMN IF NOT EXISTS "work_order_types" jsonb NOT NULL DEFAULT '[]'::jsonb
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "work_order_shifts"
      DROP COLUMN IF EXISTS "work_order_types"
    `);
  }
}
