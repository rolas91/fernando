import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddMinimumRestHoursToCompanySettings20260610002000
  implements MigrationInterface
{
  name = 'AddMinimumRestHoursToCompanySettings20260610002000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('company_settings')) {
      if (
        !(await queryRunner.hasColumn(
          'company_settings',
          'minimum_rest_hours',
        ))
      ) {
        await queryRunner.addColumn(
          'company_settings',
          new TableColumn({
            name: 'minimum_rest_hours',
            type: 'numeric',
            precision: 4,
            scale: 1,
            default: 8.0,
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
          'minimum_rest_hours',
        )
      ) {
        await queryRunner.dropColumn(
          'company_settings',
          'minimum_rest_hours',
        );
      }
    }
  }
}
