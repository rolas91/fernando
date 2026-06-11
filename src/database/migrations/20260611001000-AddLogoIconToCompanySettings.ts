import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddLogoIconToCompanySettings20260611001000
  implements MigrationInterface
{
  name = 'AddLogoIconToCompanySettings20260611001000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('company_settings')) {
      if (
        !(await queryRunner.hasColumn(
          'company_settings',
          'logo_icon',
        ))
      ) {
        await queryRunner.addColumn(
          'company_settings',
          new TableColumn({
            name: 'logo_icon',
            type: 'text',
            isNullable: true,
          }),
        );
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('company_settings')) {
      if (
        await queryRunner.hasColumn(
          'company_settings',
          'logo_icon',
        )
      ) {
        await queryRunner.dropColumn(
          'company_settings',
          'logo_icon',
        );
      }
    }
  }
}
