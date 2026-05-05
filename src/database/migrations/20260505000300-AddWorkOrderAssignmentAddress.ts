import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddWorkOrderAssignmentAddress20260505000300
  implements MigrationInterface
{
  name = 'AddWorkOrderAssignmentAddress20260505000300';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const hasWorkOrdersTable = await queryRunner.hasTable('work_orders');
    if (!hasWorkOrdersTable) return;

    if (!(await queryRunner.hasColumn('work_orders', 'assignment_address'))) {
      await queryRunner.addColumn(
        'work_orders',
        new TableColumn({
          name: 'assignment_address',
          type: 'text',
          isNullable: false,
          default: "''",
        }),
      );
    }

    if (!(await queryRunner.hasColumn('work_orders', 'latitude'))) {
      await queryRunner.addColumn(
        'work_orders',
        new TableColumn({
          name: 'latitude',
          type: 'double precision',
          isNullable: true,
        }),
      );
    }

    if (!(await queryRunner.hasColumn('work_orders', 'longitude'))) {
      await queryRunner.addColumn(
        'work_orders',
        new TableColumn({
          name: 'longitude',
          type: 'double precision',
          isNullable: true,
        }),
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const hasWorkOrdersTable = await queryRunner.hasTable('work_orders');
    if (!hasWorkOrdersTable) return;

    for (const columnName of ['longitude', 'latitude', 'assignment_address']) {
      if (await queryRunner.hasColumn('work_orders', columnName)) {
        await queryRunner.dropColumn('work_orders', columnName);
      }
    }
  }
}
