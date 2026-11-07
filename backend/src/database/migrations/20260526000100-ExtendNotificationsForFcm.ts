import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class ExtendNotificationsForFcm20260526000100 implements MigrationInterface {
  name = 'ExtendNotificationsForFcm20260526000100';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('notifications'))) return;

    const columns: TableColumn[] = [
      new TableColumn({
        name: 'channel',
        type: 'varchar',
        length: '32',
        isNullable: false,
        default: "'in_app'",
      }),
      new TableColumn({
        name: 'worker_id',
        type: 'varchar',
        length: '64',
        isNullable: true,
      }),
      new TableColumn({
        name: 'work_order_id',
        type: 'varchar',
        length: '64',
        isNullable: true,
      }),
      new TableColumn({
        name: 'shift_id',
        type: 'varchar',
        length: '64',
        isNullable: true,
      }),
      new TableColumn({
        name: 'role_id',
        type: 'varchar',
        length: '64',
        isNullable: true,
      }),
      new TableColumn({
        name: 'delivery_status',
        type: 'varchar',
        length: '64',
        isNullable: true,
      }),
      new TableColumn({
        name: 'provider_message_id',
        type: 'text',
        isNullable: true,
      }),
    ];

    for (const column of columns) {
      if (!(await queryRunner.hasColumn('notifications', column.name))) {
        await queryRunner.addColumn('notifications', column);
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('notifications'))) return;

    for (const name of [
      'provider_message_id',
      'delivery_status',
      'role_id',
      'shift_id',
      'work_order_id',
      'worker_id',
      'channel',
    ]) {
      if (await queryRunner.hasColumn('notifications', name)) {
        await queryRunner.dropColumn('notifications', name);
      }
    }
  }
}
