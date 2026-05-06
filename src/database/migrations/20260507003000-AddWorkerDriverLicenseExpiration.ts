import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddWorkerDriverLicenseExpiration20260507003000
  implements MigrationInterface
{
  name = 'AddWorkerDriverLicenseExpiration20260507003000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('workers'))) return;

    if (!(await queryRunner.hasColumn('workers', 'driver_license_expiration'))) {
      await queryRunner.addColumn(
        'workers',
        new TableColumn({
          name: 'driver_license_expiration',
          type: 'date',
          isNullable: true,
        }),
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('workers'))) return;
    if (
      await queryRunner.hasColumn('workers', 'driver_license_expiration')
    ) {
      await queryRunner.dropColumn('workers', 'driver_license_expiration');
    }
  }
}
