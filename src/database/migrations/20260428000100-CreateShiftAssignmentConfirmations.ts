import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

export class CreateShiftAssignmentConfirmations20260428000100
  implements MigrationInterface
{
  name = 'CreateShiftAssignmentConfirmations20260428000100';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const hasTable = await queryRunner.hasTable('shift_assignment_confirmations');
    if (hasTable) return;

    await queryRunner.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');

    await queryRunner.createTable(
      new Table({
        name: 'shift_assignment_confirmations',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            isNullable: false,
            default: 'uuid_generate_v4()',
          },
          {
            name: 'work_order_id',
            type: 'varchar',
            length: '64',
            isNullable: false,
          },
          {
            name: 'shift_id',
            type: 'varchar',
            length: '64',
            isNullable: false,
          },
          {
            name: 'role_id',
            type: 'varchar',
            length: '64',
            isNullable: false,
          },
          {
            name: 'worker_id',
            type: 'varchar',
            length: '64',
            isNullable: false,
          },
          {
            name: 'token',
            type: 'varchar',
            length: '160',
            isNullable: false,
          },
          {
            name: 'status',
            type: 'varchar',
            length: '32',
            isNullable: false,
            default: "'pending'",
          },
          {
            name: 'delivery_channel',
            type: 'varchar',
            length: '32',
            isNullable: true,
          },
          {
            name: 'requested_at',
            type: 'timestamp',
            isNullable: true,
          },
          {
            name: 'responded_at',
            type: 'timestamp',
            isNullable: true,
          },
          {
            name: 'last_message',
            type: 'text',
            isNullable: false,
            default: "''",
          },
          {
            name: 'last_sent_to',
            type: 'varchar',
            length: '255',
            isNullable: true,
          },
          {
            name: 'created_at',
            type: 'timestamp',
            isNullable: false,
            default: 'now()',
          },
          {
            name: 'updated_at',
            type: 'timestamp',
            isNullable: false,
            default: 'now()',
          },
        ],
      }),
      true,
    );

    await queryRunner.createIndex(
      'shift_assignment_confirmations',
      new TableIndex({
        name: 'IDX_shift_assignment_confirmations_token',
        columnNames: ['token'],
        isUnique: true,
      }),
    );

    await queryRunner.createIndex(
      'shift_assignment_confirmations',
      new TableIndex({
        name: 'IDX_shift_assignment_confirmations_assignment',
        columnNames: ['work_order_id', 'shift_id', 'role_id', 'worker_id'],
        isUnique: true,
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const hasTable = await queryRunner.hasTable('shift_assignment_confirmations');
    if (!hasTable) return;
    await queryRunner.dropTable('shift_assignment_confirmations', true);
  }
}
