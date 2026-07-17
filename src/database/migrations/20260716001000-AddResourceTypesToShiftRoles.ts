import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddResourceTypesToShiftRoles20260716001000 implements MigrationInterface {
  name = 'AddResourceTypesToShiftRoles20260716001000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "work_order_shift_roles" ADD COLUMN IF NOT EXISTS "equipment_types" text[] NOT NULL DEFAULT '{}'`,
    );
    await queryRunner.query(
      `ALTER TABLE "work_order_shift_roles" ADD COLUMN IF NOT EXISTS "material_types" text[] NOT NULL DEFAULT '{}'`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "work_order_shift_roles" DROP COLUMN IF EXISTS "material_types"`,
    );
    await queryRunner.query(
      `ALTER TABLE "work_order_shift_roles" DROP COLUMN IF EXISTS "equipment_types"`,
    );
  }
}
