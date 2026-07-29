import { MigrationInterface, QueryRunner } from 'typeorm';

export class RemoveRoleResources20260804001000 implements MigrationInterface {
  name = 'RemoveRoleResources20260804001000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "work_order_shift_role_materials"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "work_order_shift_role_equipment"`);
    await queryRunner.query(
      `ALTER TABLE "work_order_shift_roles" DROP COLUMN IF EXISTS "material_types"`,
    );
    await queryRunner.query(
      `ALTER TABLE "work_order_shift_roles" DROP COLUMN IF EXISTS "equipment_types"`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "work_order_shift_roles" ADD COLUMN IF NOT EXISTS "equipment_types" text[] NOT NULL DEFAULT '{}'`,
    );
    await queryRunner.query(
      `ALTER TABLE "work_order_shift_roles" ADD COLUMN IF NOT EXISTS "material_types" text[] NOT NULL DEFAULT '{}'`,
    );
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "work_order_shift_role_equipment" (
        "role_id" varchar(64) NOT NULL,
        "equipment_id" varchar(64) NOT NULL,
        CONSTRAINT "PK_work_order_shift_role_equipment" PRIMARY KEY ("role_id", "equipment_id"),
        CONSTRAINT "FK_role_equipment_role" FOREIGN KEY ("role_id") REFERENCES "work_order_shift_roles"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_role_equipment_equipment" FOREIGN KEY ("equipment_id") REFERENCES "equipment"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "work_order_shift_role_materials" (
        "role_id" varchar(64) NOT NULL,
        "material_id" varchar(64) NOT NULL,
        CONSTRAINT "PK_work_order_shift_role_materials" PRIMARY KEY ("role_id", "material_id"),
        CONSTRAINT "FK_role_material_role" FOREIGN KEY ("role_id") REFERENCES "work_order_shift_roles"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_role_material_material" FOREIGN KEY ("material_id") REFERENCES "materials"("id") ON DELETE CASCADE
      )
    `);
  }
}
