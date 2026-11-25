import { MigrationInterface, QueryRunner } from 'typeorm';
export class AddUserWebAccess20261125001000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "web_access_enabled" boolean NOT NULL DEFAULT false',
    );
  }
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "users" DROP COLUMN IF EXISTS "web_access_enabled"',
    );
  }
}
