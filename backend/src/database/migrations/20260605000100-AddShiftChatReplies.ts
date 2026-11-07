import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddShiftChatReplies20260605000100 implements MigrationInterface {
  name = 'AddShiftChatReplies20260605000100';

  async up(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('shift_chat_messages');
    if (!table) return;

    const columns = [
      new TableColumn({
        name: 'reply_to_message_id',
        type: 'varchar',
        length: '64',
        default: "''",
      }),
      new TableColumn({
        name: 'reply_to_sender_name',
        type: 'varchar',
        length: '180',
        default: "''",
      }),
      new TableColumn({
        name: 'reply_to_kind',
        type: 'varchar',
        length: '16',
        default: "''",
      }),
      new TableColumn({
        name: 'reply_to_preview',
        type: 'varchar',
        length: '280',
        default: "''",
      }),
    ];

    for (const column of columns) {
      if (!table.columns.some((existing) => existing.name === column.name)) {
        await queryRunner.addColumn('shift_chat_messages', column);
      }
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('shift_chat_messages');
    if (!table) return;

    for (const columnName of [
      'reply_to_preview',
      'reply_to_kind',
      'reply_to_sender_name',
      'reply_to_message_id',
    ]) {
      if (table.columns.some((column) => column.name === columnName)) {
        await queryRunner.dropColumn('shift_chat_messages', columnName);
      }
    }
  }
}
