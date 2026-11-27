import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateMobileVersionPolicies20261127001000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE mobile_version_policies (
        platform text PRIMARY KEY CHECK (platform IN ('android', 'ios')),
        minimum_version text,
        candidate_version text,
        candidate_since timestamptz
      )
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE mobile_version_policies');
  }
}
