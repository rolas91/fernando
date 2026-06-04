import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

export class CreateShiftChatMessages20260604000100 implements MigrationInterface {
  name = 'CreateShiftChatMessages20260604000100';

  async up(queryRunner: QueryRunner): Promise<void> {
    const hasTable = await queryRunner.hasTable('shift_chat_messages');
    if (!hasTable) {
      await queryRunner.createTable(
        new Table({
          name: 'shift_chat_messages',
          columns: [
            { name: 'id', type: 'varchar', length: '64', isPrimary: true },
            { name: 'work_order_id', type: 'varchar', length: '64' },
            { name: 'shift_id', type: 'varchar', length: '64' },
            { name: 'sender_user_id', type: 'varchar', length: '64', default: "''" },
            { name: 'sender_worker_id', type: 'varchar', length: '64' },
            { name: 'sender_name', type: 'varchar', length: '180' },
            { name: 'kind', type: 'varchar', length: '16', default: "'text'" },
            { name: 'body', type: 'text', default: "''" },
            { name: 'media_url', type: 'text', default: "''" },
            { name: 'media_name', type: 'varchar', length: '240', default: "''" },
            { name: 'media_content_type', type: 'varchar', length: '120', default: "''" },
            { name: 'media_size', type: 'int', default: 0 },
            { name: 'created_at', type: 'timestamp', default: 'now()' },
            { name: 'updated_at', type: 'timestamp', default: 'now()' },
          ],
        }),
      );
    }

    const table = await queryRunner.getTable('shift_chat_messages');
    if (table && !table.indices.some((idx) => idx.name === 'IDX_shift_chat_messages_shift_created')) {
      await queryRunner.createIndex(
        'shift_chat_messages',
        new TableIndex({
          name: 'IDX_shift_chat_messages_shift_created',
          columnNames: ['shift_id', 'created_at'],
        }),
      );
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    const hasTable = await queryRunner.hasTable('shift_chat_messages');
    if (hasTable) {
      await queryRunner.dropTable('shift_chat_messages');
    }
  }
}
