import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddWorkOrderDispatchAndFiles20260429000200
  implements MigrationInterface
{
  name = 'AddWorkOrderDispatchAndFiles20260429000200';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE work_orders
      ADD COLUMN IF NOT EXISTS dispatch_note text NOT NULL DEFAULT ''
    `);
    await queryRunner.query(`
      ALTER TABLE work_orders
      ADD COLUMN IF NOT EXISTS file_uploads text[] NOT NULL DEFAULT '{}'
    `);
    await queryRunner.query(`
      UPDATE work_orders
      SET file_uploads = attachments
      WHERE (file_uploads IS NULL OR cardinality(file_uploads) = 0)
        AND attachments IS NOT NULL
        AND cardinality(attachments) > 0
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE work_orders
      DROP COLUMN IF EXISTS file_uploads
    `);
    await queryRunner.query(`
      ALTER TABLE work_orders
      DROP COLUMN IF EXISTS dispatch_note
    `);
  }
}
