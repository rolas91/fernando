import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddWorkOrderTypeOptionsToCompanySettings20260730001000
  implements MigrationInterface
{
  name = 'AddWorkOrderTypeOptionsToCompanySettings20260730001000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "company_settings"
      ADD COLUMN IF NOT EXISTS "work_order_type_options"
      text[] NOT NULL DEFAULT '{}'
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "company_settings"
      DROP COLUMN IF EXISTS "work_order_type_options"
    `);
  }
}
