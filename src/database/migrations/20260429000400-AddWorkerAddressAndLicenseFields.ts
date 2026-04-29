import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddWorkerAddressAndLicenseFields20260429000400
  implements MigrationInterface
{
  name = 'AddWorkerAddressAndLicenseFields20260429000400';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE workers
      ADD COLUMN IF NOT EXISTS driver_license varchar(120) NOT NULL DEFAULT ''
    `);
    await queryRunner.query(`
      ALTER TABLE workers
      ADD COLUMN IF NOT EXISTS primary_address text NOT NULL DEFAULT ''
    `);
    await queryRunner.query(`
      ALTER TABLE workers
      ADD COLUMN IF NOT EXISTS city varchar(120) NOT NULL DEFAULT ''
    `);
    await queryRunner.query(`
      ALTER TABLE workers
      ADD COLUMN IF NOT EXISTS zip_code varchar(32) NOT NULL DEFAULT ''
    `);
    await queryRunner.query(`
      ALTER TABLE workers
      ADD COLUMN IF NOT EXISTS state varchar(64) NOT NULL DEFAULT ''
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE workers
      DROP COLUMN IF EXISTS state
    `);
    await queryRunner.query(`
      ALTER TABLE workers
      DROP COLUMN IF EXISTS zip_code
    `);
    await queryRunner.query(`
      ALTER TABLE workers
      DROP COLUMN IF EXISTS city
    `);
    await queryRunner.query(`
      ALTER TABLE workers
      DROP COLUMN IF EXISTS primary_address
    `);
    await queryRunner.query(`
      ALTER TABLE workers
      DROP COLUMN IF EXISTS driver_license
    `);
  }
}
