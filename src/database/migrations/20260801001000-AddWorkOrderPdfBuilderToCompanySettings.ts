import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddWorkOrderPdfBuilderToCompanySettings20260801001000
  implements MigrationInterface
{
  name = 'AddWorkOrderPdfBuilderToCompanySettings20260801001000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "company_settings"
      ADD COLUMN IF NOT EXISTS "work_order_pdf_builder" jsonb
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "company_settings"
      DROP COLUMN IF EXISTS "work_order_pdf_builder"
    `);
  }
}
