import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddTwilioDeliveryTracking20260428000300
  implements MigrationInterface
{
  name = 'AddTwilioDeliveryTracking20260428000300';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('shift_assignment_confirmations');
    if (!table) return;

    const columns = [
      new TableColumn({
        name: 'provider_message_sid',
        type: 'varchar',
        length: '64',
        isNullable: true,
      }),
      new TableColumn({
        name: 'delivery_status',
        type: 'varchar',
        length: '32',
        isNullable: true,
      }),
      new TableColumn({
        name: 'delivery_error',
        type: 'text',
        isNullable: true,
      }),
      new TableColumn({
        name: 'delivered_at',
        type: 'timestamp',
        isNullable: true,
      }),
    ];

    for (const column of columns) {
      if (!table.findColumnByName(column.name)) {
        await queryRunner.addColumn('shift_assignment_confirmations', column);
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('shift_assignment_confirmations');
    if (!table) return;

    for (const columnName of [
      'delivered_at',
      'delivery_error',
      'delivery_status',
      'provider_message_sid',
    ]) {
      if (table.findColumnByName(columnName)) {
        await queryRunner.dropColumn('shift_assignment_confirmations', columnName);
      }
    }
  }
}
