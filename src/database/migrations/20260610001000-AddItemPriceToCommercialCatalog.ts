import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddItemPriceToCommercialCatalog20260610001000
  implements MigrationInterface
{
  name = 'AddItemPriceToCommercialCatalog20260610001000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('commercial_catalog_items')) {
      if (
        !(await queryRunner.hasColumn(
          'commercial_catalog_items',
          'item_price',
        ))
      ) {
        await queryRunner.addColumn(
          'commercial_catalog_items',
          new TableColumn({
            name: 'item_price',
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
    if (await queryRunner.hasTable('commercial_catalog_items')) {
      if (
        await queryRunner.hasColumn(
          'commercial_catalog_items',
          'item_price',
        )
      ) {
        await queryRunner.dropColumn(
          'commercial_catalog_items',
          'item_price',
        );
      }
    }
  }
}
