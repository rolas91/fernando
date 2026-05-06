import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddGeoAndPostalExpandWorkersClientsProjects20260506002000
  implements MigrationInterface
{
  name = 'AddGeoAndPostalExpandWorkersClientsProjects20260506002000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('workers')) {
      if (!(await queryRunner.hasColumn('workers', 'latitude'))) {
        await queryRunner.addColumn(
          'workers',
          new TableColumn({
            name: 'latitude',
            type: 'double precision',
            isNullable: true,
          }),
        );
      }
      if (!(await queryRunner.hasColumn('workers', 'longitude'))) {
        await queryRunner.addColumn(
          'workers',
          new TableColumn({
            name: 'longitude',
            type: 'double precision',
            isNullable: true,
          }),
        );
      }
      if (!(await queryRunner.hasColumn('workers', 'country'))) {
        await queryRunner.addColumn(
          'workers',
          new TableColumn({
            name: 'country',
            type: 'varchar',
            length: '120',
            isNullable: false,
            default: `'USA'`,
          }),
        );
      }
    }

    if (await queryRunner.hasTable('clients')) {
      if (!(await queryRunner.hasColumn('clients', 'city'))) {
        await queryRunner.addColumn(
          'clients',
          new TableColumn({
            name: 'city',
            type: 'varchar',
            length: '180',
            isNullable: false,
            default: "''",
          }),
        );
      }
      if (!(await queryRunner.hasColumn('clients', 'state'))) {
        await queryRunner.addColumn(
          'clients',
          new TableColumn({
            name: 'state',
            type: 'varchar',
            length: '120',
            isNullable: false,
            default: "''",
          }),
        );
      }
      if (!(await queryRunner.hasColumn('clients', 'zip_code'))) {
        await queryRunner.addColumn(
          'clients',
          new TableColumn({
            name: 'zip_code',
            type: 'varchar',
            length: '32',
            isNullable: false,
            default: "''",
          }),
        );
      }
      if (!(await queryRunner.hasColumn('clients', 'latitude'))) {
        await queryRunner.addColumn(
          'clients',
          new TableColumn({
            name: 'latitude',
            type: 'double precision',
            isNullable: true,
          }),
        );
      }
      if (!(await queryRunner.hasColumn('clients', 'longitude'))) {
        await queryRunner.addColumn(
          'clients',
          new TableColumn({
            name: 'longitude',
            type: 'double precision',
            isNullable: true,
          }),
        );
      }
      if (!(await queryRunner.hasColumn('clients', 'country'))) {
        await queryRunner.addColumn(
          'clients',
          new TableColumn({
            name: 'country',
            type: 'varchar',
            length: '120',
            isNullable: false,
            default: `'USA'`,
          }),
        );
      }
    }

    if (await queryRunner.hasTable('projects')) {
      if (!(await queryRunner.hasColumn('projects', 'state'))) {
        await queryRunner.addColumn(
          'projects',
          new TableColumn({
            name: 'state',
            type: 'varchar',
            length: '120',
            isNullable: false,
            default: "''",
          }),
        );
      }
      if (!(await queryRunner.hasColumn('projects', 'zip_code'))) {
        await queryRunner.addColumn(
          'projects',
          new TableColumn({
            name: 'zip_code',
            type: 'varchar',
            length: '32',
            isNullable: false,
            default: "''",
          }),
        );
      }
      if (!(await queryRunner.hasColumn('projects', 'latitude'))) {
        await queryRunner.addColumn(
          'projects',
          new TableColumn({
            name: 'latitude',
            type: 'double precision',
            isNullable: true,
          }),
        );
      }
      if (!(await queryRunner.hasColumn('projects', 'longitude'))) {
        await queryRunner.addColumn(
          'projects',
          new TableColumn({
            name: 'longitude',
            type: 'double precision',
            isNullable: true,
          }),
        );
      }
      if (!(await queryRunner.hasColumn('projects', 'country'))) {
        await queryRunner.addColumn(
          'projects',
          new TableColumn({
            name: 'country',
            type: 'varchar',
            length: '120',
            isNullable: false,
            default: `'USA'`,
          }),
        );
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('projects')) {
      for (const columnName of [
        'country',
        'longitude',
        'latitude',
        'zip_code',
        'state',
      ]) {
        if (await queryRunner.hasColumn('projects', columnName)) {
          await queryRunner.dropColumn('projects', columnName);
        }
      }
    }

    if (await queryRunner.hasTable('clients')) {
      for (const columnName of [
        'country',
        'longitude',
        'latitude',
        'zip_code',
        'state',
        'city',
      ]) {
        if (await queryRunner.hasColumn('clients', columnName)) {
          await queryRunner.dropColumn('clients', columnName);
        }
      }
    }

    if (await queryRunner.hasTable('workers')) {
      for (const columnName of ['country', 'longitude', 'latitude']) {
        if (await queryRunner.hasColumn('workers', columnName)) {
          await queryRunner.dropColumn('workers', columnName);
        }
      }
    }
  }
}
