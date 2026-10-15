import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSubmissionWorkOrderNumber20261015001000 implements MigrationInterface {
  name = 'AddSubmissionWorkOrderNumber20261015001000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "form_submissions" ADD COLUMN IF NOT EXISTS "work_order_number" varchar(120) NULL`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "form_submissions" DROP COLUMN IF EXISTS "work_order_number"`,
    );
  }
}
