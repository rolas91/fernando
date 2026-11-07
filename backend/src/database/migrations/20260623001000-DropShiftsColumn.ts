import { MigrationInterface, QueryRunner } from 'typeorm';

export class DropShiftsColumn20260623001000 implements MigrationInterface {
  name = 'DropShiftsColumn20260623001000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "work_orders" DROP COLUMN IF EXISTS "shifts"`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "work_orders" ADD COLUMN "shifts" jsonb NOT NULL DEFAULT '[]'::jsonb`,
    );
  }
}
