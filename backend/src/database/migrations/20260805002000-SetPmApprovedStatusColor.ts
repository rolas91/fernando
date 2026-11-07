import { MigrationInterface, QueryRunner } from 'typeorm';

export class SetPmApprovedStatusColor20260805002000 implements MigrationInterface {
  name = 'SetPmApprovedStatusColor20260805002000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE status_catalog
         SET color = '#14B8A6', updated_at = NOW()
       WHERE scope = 'shift' AND value = 'pm_approved'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE status_catalog
         SET color = '#0F766E', updated_at = NOW()
       WHERE scope = 'shift' AND value = 'pm_approved'
    `);
  }
}
