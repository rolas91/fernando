import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableColumn,
  TableIndex,
} from 'typeorm';

export class AddWorkOrderNumberingConfig20260702002000
  implements MigrationInterface
{
  name = 'AddWorkOrderNumberingConfig20260702002000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('company_settings')) {
      const table = await queryRunner.getTable('company_settings');
      const has = (col: string) => table?.columns.some((c) => c.name === col);

      if (!has('work_order_number_prefix')) {
        await queryRunner.addColumn(
          'company_settings',
          new TableColumn({
            name: 'work_order_number_prefix',
            type: 'varchar',
            length: '16',
            default: "'ASN'",
          }),
        );
      }
      if (!has('work_order_number_padding')) {
        await queryRunner.addColumn(
          'company_settings',
          new TableColumn({
            name: 'work_order_number_padding',
            type: 'int',
            default: 4,
          }),
        );
      }
      if (!has('work_order_number_reset')) {
        await queryRunner.addColumn(
          'company_settings',
          new TableColumn({
            name: 'work_order_number_reset',
            type: 'varchar',
            length: '16',
            default: "'yearly'",
          }),
        );
      }
      if (!has('work_order_number_template')) {
        await queryRunner.addColumn(
          'company_settings',
          new TableColumn({
            name: 'work_order_number_template',
            type: 'varchar',
            length: '64',
            default: "'{PREFIX}-{YYYY}-{NNNN}'",
          }),
        );
      }
    }

    if (!(await queryRunner.hasTable('work_order_sequences'))) {
      await queryRunner.createTable(
        new Table({
          name: 'work_order_sequences',
          columns: [
            {
              name: 'scope',
              type: 'varchar',
              length: '32',
              isPrimary: true,
            },
            {
              name: 'last_value',
              type: 'int',
              default: 0,
            },
            {
              name: 'reset_key',
              type: 'varchar',
              length: '16',
              isPrimary: true,
            },
            {
              name: 'updated_at',
              type: 'timestamp',
              default: 'now()',
            },
          ],
        }),
      );
      await queryRunner.createIndex(
        'work_order_sequences',
        new TableIndex({
          name: 'idx_wos_scope_reset',
          columnNames: ['scope', 'reset_key'],
        }),
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('company_settings')) {
      const table = await queryRunner.getTable('company_settings');
      const has = (col: string) => table?.columns.some((c) => c.name === col);
      if (has('work_order_number_template')) {
        await queryRunner.dropColumn(
          'company_settings',
          'work_order_number_template',
        );
      }
      if (has('work_order_number_reset')) {
        await queryRunner.dropColumn(
          'company_settings',
          'work_order_number_reset',
        );
      }
      if (has('work_order_number_padding')) {
        await queryRunner.dropColumn(
          'company_settings',
          'work_order_number_padding',
        );
      }
      if (has('work_order_number_prefix')) {
        await queryRunner.dropColumn(
          'company_settings',
          'work_order_number_prefix',
        );
      }
    }

    if (await queryRunner.hasTable('work_order_sequences')) {
      await queryRunner.dropTable('work_order_sequences');
    }
  }
}
