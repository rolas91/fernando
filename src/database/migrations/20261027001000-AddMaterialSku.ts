import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMaterialSku20261027001000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "materials" ADD COLUMN "sku" varchar(120) NOT NULL DEFAULT ''`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "materials" DROP COLUMN "sku"`);
  }
}
