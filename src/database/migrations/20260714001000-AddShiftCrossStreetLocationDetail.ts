import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddShiftCrossStreetLocationDetail20260714001000 implements MigrationInterface {
  name = 'AddShiftCrossStreetLocationDetail20260714001000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "work_order_shifts" ADD COLUMN IF NOT EXISTS "cross_street_location_detail" text`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "work_order_shifts" DROP COLUMN IF EXISTS "cross_street_location_detail"`,
    );
  }
}
