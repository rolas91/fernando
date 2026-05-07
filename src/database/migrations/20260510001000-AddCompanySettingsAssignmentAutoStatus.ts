import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddCompanySettingsAssignmentAutoStatus20260510001000
  implements MigrationInterface
{
  name = 'AddCompanySettingsAssignmentAutoStatus20260510001000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('company_settings')) {
      if (
        !(await queryRunner.hasColumn(
          'company_settings',
          'assignment_auto_status',
        ))
      ) {
        await queryRunner.addColumn(
          'company_settings',
          new TableColumn({
            name: 'assignment_auto_status',
            type: 'jsonb',
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
          'assignment_auto_status',
        )
      ) {
        await queryRunner.dropColumn(
          'company_settings',
          'assignment_auto_status',
        );
      }
    }
  }
}
