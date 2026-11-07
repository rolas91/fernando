import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddPriceToMaterials20260702001000 implements MigrationInterface {
  name = 'AddPriceToMaterials20260702001000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('materials')) {
      if (!(await queryRunner.hasColumn('materials', 'price'))) {
        await queryRunner.addColumn(
          'materials',
          new TableColumn({
            name: 'price',
            type: 'numeric',
            precision: 12,
            scale: 2,
            default: 0,
          }),
        );
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('materials')) {
      if (await queryRunner.hasColumn('materials', 'price')) {
        await queryRunner.dropColumn('materials', 'price');
      }
    }
  }
}
