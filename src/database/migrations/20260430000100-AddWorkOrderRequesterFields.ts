import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddWorkOrderRequesterFields20260430000100
  implements MigrationInterface
{
  name = 'AddWorkOrderRequesterFields20260430000100';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const hasWorkOrdersTable = await queryRunner.hasTable('work_orders');
    if (!hasWorkOrdersTable) return;

    const columns = [
      { name: 'requester_name', length: '180' },
      { name: 'contact_email', length: '255' },
      { name: 'contact_phone_number', length: '64' },
    ];

    for (const column of columns) {
      const exists = await queryRunner.hasColumn('work_orders', column.name);
      if (exists) continue;

      await queryRunner.addColumn(
        'work_orders',
        new TableColumn({
          name: column.name,
          type: 'varchar',
          length: column.length,
          isNullable: false,
          default: "''",
        }),
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const hasWorkOrdersTable = await queryRunner.hasTable('work_orders');
    if (!hasWorkOrdersTable) return;

    for (const columnName of [
      'contact_phone_number',
      'contact_email',
      'requester_name',
    ]) {
      const exists = await queryRunner.hasColumn('work_orders', columnName);
      if (exists) {
        await queryRunner.dropColumn('work_orders', columnName);
      }
    }
  }
}
