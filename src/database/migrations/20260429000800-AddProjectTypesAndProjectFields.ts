import { MigrationInterface, QueryRunner, Table, TableColumn } from 'typeorm';

export class AddProjectTypesAndProjectFields20260429000800
  implements MigrationInterface
{
  name = 'AddProjectTypesAndProjectFields20260429000800';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const hasProjectTypesTable = await queryRunner.hasTable('project_types');
    if (!hasProjectTypesTable) {
      await queryRunner.createTable(
        new Table({
          name: 'project_types',
          columns: [
            { name: 'id', type: 'varchar', length: '64', isPrimary: true },
            { name: 'name', type: 'varchar', length: '180', isNullable: false },
            {
              name: 'description',
              type: 'text',
              isNullable: false,
              default: "''",
            },
            {
              name: 'status',
              type: 'varchar',
              length: '24',
              isNullable: false,
              default: "'active'",
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
      );
    }

    const hasProjectsTable = await queryRunner.hasTable('projects');
    if (!hasProjectsTable) return;

    const columns: Array<{ name: string; type: string; length?: string }> = [
      { name: 'project_type_id', type: 'varchar', length: '64' },
      { name: 'project_manager', type: 'varchar', length: '180' },
      { name: 'project_manager_email', type: 'varchar', length: '255' },
    ];

    for (const column of columns) {
      const exists = await queryRunner.hasColumn('projects', column.name);
      if (exists) continue;
      await queryRunner.addColumn(
        'projects',
        new TableColumn({
          name: column.name,
          type: column.type,
          length: column.length,
          isNullable: false,
          default: "''",
        }),
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('projects')) {
      for (const columnName of [
        'project_manager_email',
        'project_manager',
        'project_type_id',
      ]) {
        if (await queryRunner.hasColumn('projects', columnName)) {
          await queryRunner.dropColumn('projects', columnName);
        }
      }
    }

    if (await queryRunner.hasTable('project_types')) {
      await queryRunner.dropTable('project_types');
    }
  }
}
