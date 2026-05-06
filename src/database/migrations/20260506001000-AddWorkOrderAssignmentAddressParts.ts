import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddWorkOrderAssignmentAddressParts20260506001000
  implements MigrationInterface
{
  name = 'AddWorkOrderAssignmentAddressParts20260506001000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const hasWorkOrdersTable = await queryRunner.hasTable('work_orders');
    if (!hasWorkOrdersTable) return;

    if (!(await queryRunner.hasColumn('work_orders', 'assignment_city'))) {
      await queryRunner.addColumn(
        'work_orders',
        new TableColumn({
          name: 'assignment_city',
          type: 'varchar',
          length: '180',
          isNullable: false,
          default: "''",
        }),
      );
    }

    if (!(await queryRunner.hasColumn('work_orders', 'assignment_state'))) {
      await queryRunner.addColumn(
        'work_orders',
        new TableColumn({
          name: 'assignment_state',
          type: 'varchar',
          length: '120',
          isNullable: false,
          default: "''",
        }),
      );
    }

    if (!(await queryRunner.hasColumn('work_orders', 'assignment_zip_code'))) {
      await queryRunner.addColumn(
        'work_orders',
        new TableColumn({
          name: 'assignment_zip_code',
          type: 'varchar',
          length: '32',
          isNullable: false,
          default: "''",
        }),
      );
    }

    if (!(await queryRunner.hasColumn('work_orders', 'assignment_country'))) {
      await queryRunner.addColumn(
        'work_orders',
        new TableColumn({
          name: 'assignment_country',
          type: 'varchar',
          length: '120',
          isNullable: false,
          default: `'USA'`,
        }),
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const hasWorkOrdersTable = await queryRunner.hasTable('work_orders');
    if (!hasWorkOrdersTable) return;

    for (const columnName of [
      'assignment_country',
      'assignment_zip_code',
      'assignment_state',
      'assignment_city',
    ]) {
      if (await queryRunner.hasColumn('work_orders', columnName)) {
        await queryRunner.dropColumn('work_orders', columnName);
      }
    }
  }
}
