import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddClientWebsite20260429000600 implements MigrationInterface {
  name = 'AddClientWebsite20260429000600';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const hasClientsTable = await queryRunner.hasTable('clients');
    if (!hasClientsTable) return;

    const hasWebsiteColumn = await queryRunner.hasColumn('clients', 'website');
    if (hasWebsiteColumn) return;

    await queryRunner.addColumn(
      'clients',
      new TableColumn({
        name: 'website',
        type: 'varchar',
        length: '255',
        isNullable: false,
        default: "''",
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const hasClientsTable = await queryRunner.hasTable('clients');
    if (!hasClientsTable) return;

    const hasWebsiteColumn = await queryRunner.hasColumn('clients', 'website');
    if (!hasWebsiteColumn) return;

    await queryRunner.dropColumn('clients', 'website');
  }
}
