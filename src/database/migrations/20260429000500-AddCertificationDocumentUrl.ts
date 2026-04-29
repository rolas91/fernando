import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCertificationDocumentUrl20260429000500
  implements MigrationInterface
{
  name = 'AddCertificationDocumentUrl20260429000500';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE certifications
      ADD COLUMN IF NOT EXISTS document_url text
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE certifications
      DROP COLUMN IF EXISTS document_url
    `);
  }
}
