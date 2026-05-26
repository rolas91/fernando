import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddWorkerFcmTokens20260523000100 implements MigrationInterface {
  name = 'AddWorkerFcmTokens20260523000100';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const hasTable = await queryRunner.hasTable('workers');
    if (!hasTable) return;

    if (!(await queryRunner.hasColumn('workers', 'fcm_tokens'))) {
      await queryRunner.addColumn(
        'workers',
        new TableColumn({
          name: 'fcm_tokens',
          type: 'text',
          isArray: true,
          default: "'{}'",
        }),
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const hasTable = await queryRunner.hasTable('workers');
    if (!hasTable) return;

    if (await queryRunner.hasColumn('workers', 'fcm_tokens')) {
      await queryRunner.dropColumn('workers', 'fcm_tokens');
    }
  }
}
