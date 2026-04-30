import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddWorkerFileUploads20260429000700
  implements MigrationInterface
{
  name = 'AddWorkerFileUploads20260429000700';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const hasWorkersTable = await queryRunner.hasTable('workers');
    if (!hasWorkersTable) return;

    const hasFileUploadsColumn = await queryRunner.hasColumn(
      'workers',
      'file_uploads',
    );
    if (hasFileUploadsColumn) return;

    await queryRunner.addColumn(
      'workers',
      new TableColumn({
        name: 'file_uploads',
        type: 'text',
        isArray: true,
        isNullable: false,
        default: "'{}'",
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const hasWorkersTable = await queryRunner.hasTable('workers');
    if (!hasWorkersTable) return;

    const hasFileUploadsColumn = await queryRunner.hasColumn(
      'workers',
      'file_uploads',
    );
    if (!hasFileUploadsColumn) return;

    await queryRunner.dropColumn('workers', 'file_uploads');
  }
}
