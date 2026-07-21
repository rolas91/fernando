import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddEquipmentMaterialsSoftDelete20260721001000 implements MigrationInterface {
  name = 'AddEquipmentMaterialsSoftDelete20260721001000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "equipment" ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMP NULL');
    await queryRunner.query('ALTER TABLE "materials" ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMP NULL');
    await queryRunner.query('CREATE INDEX IF NOT EXISTS "IDX_equipment_deleted_at" ON "equipment" ("deleted_at")');
    await queryRunner.query('CREATE INDEX IF NOT EXISTS "IDX_materials_deleted_at" ON "materials" ("deleted_at")');
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_materials_deleted_at"');
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_equipment_deleted_at"');
    await queryRunner.query('ALTER TABLE "materials" DROP COLUMN IF EXISTS "deleted_at"');
    await queryRunner.query('ALTER TABLE "equipment" DROP COLUMN IF EXISTS "deleted_at"');
  }
}
