import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPlannedResourcesToShifts20260717001000 implements MigrationInterface {
  name = 'AddPlannedResourcesToShifts20260717001000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "work_order_shifts" ADD COLUMN IF NOT EXISTS "planned_equipment" jsonb NOT NULL DEFAULT '[]'::jsonb`);
    await queryRunner.query(`ALTER TABLE "work_order_shifts" ADD COLUMN IF NOT EXISTS "planned_materials" jsonb NOT NULL DEFAULT '[]'::jsonb`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "work_order_shifts" DROP COLUMN IF EXISTS "planned_materials"`);
    await queryRunner.query(`ALTER TABLE "work_order_shifts" DROP COLUMN IF EXISTS "planned_equipment"`);
  }
}
