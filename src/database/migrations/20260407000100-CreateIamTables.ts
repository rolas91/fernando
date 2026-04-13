import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableForeignKey,
  TableIndex,
} from 'typeorm';

export class CreateIamTables20260407000100 implements MigrationInterface {
  name = 'CreateIamTables20260407000100';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // For uuid_generate_v4() (PrimaryGeneratedColumn('uuid'))
    await queryRunner.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');

    const hasRoles = await queryRunner.hasTable('roles');
    if (!hasRoles) {
      await queryRunner.createTable(
        new Table({
          name: 'roles',
          columns: [
            {
              name: 'id',
              type: 'uuid',
              isPrimary: true,
              isNullable: false,
              default: 'uuid_generate_v4()',
            },
            { name: 'key', type: 'varchar', isNullable: false, isUnique: true },
            { name: 'name', type: 'varchar', isNullable: false },
            { name: 'description', type: 'text', isNullable: true },
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
        true,
      );
    }

    const hasPermissions = await queryRunner.hasTable('permissions');
    if (!hasPermissions) {
      await queryRunner.createTable(
        new Table({
          name: 'permissions',
          columns: [
            {
              name: 'id',
              type: 'uuid',
              isPrimary: true,
              isNullable: false,
              default: 'uuid_generate_v4()',
            },
            {
              name: 'key',
              type: 'varchar',
              isNullable: false,
              isUnique: true,
            },
            { name: 'description', type: 'text', isNullable: true },
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
        true,
      );
    }

    const hasRolePermissions = await queryRunner.hasTable('role_permissions');
    if (!hasRolePermissions) {
      await queryRunner.createTable(
        new Table({
          name: 'role_permissions',
          columns: [
            {
              name: 'role_id',
              type: 'uuid',
              isNullable: false,
              isPrimary: true,
            },
            {
              name: 'permission_id',
              type: 'uuid',
              isNullable: false,
              isPrimary: true,
            },
          ],
        }),
        true,
      );

      await queryRunner.createIndex(
        'role_permissions',
        new TableIndex({
          name: 'IDX_role_permissions_role_id',
          columnNames: ['role_id'],
        }),
      );
      await queryRunner.createIndex(
        'role_permissions',
        new TableIndex({
          name: 'IDX_role_permissions_permission_id',
          columnNames: ['permission_id'],
        }),
      );

      await queryRunner.createForeignKey(
        'role_permissions',
        new TableForeignKey({
          name: 'FK_role_permissions_role_id',
          columnNames: ['role_id'],
          referencedTableName: 'roles',
          referencedColumnNames: ['id'],
          onDelete: 'CASCADE',
        }),
      );
      await queryRunner.createForeignKey(
        'role_permissions',
        new TableForeignKey({
          name: 'FK_role_permissions_permission_id',
          columnNames: ['permission_id'],
          referencedTableName: 'permissions',
          referencedColumnNames: ['id'],
          onDelete: 'CASCADE',
        }),
      );
    }

    const hasUserRoles = await queryRunner.hasTable('user_roles');
    if (!hasUserRoles) {
      await queryRunner.createTable(
        new Table({
          name: 'user_roles',
          columns: [
            {
              name: 'user_id',
              type: 'uuid',
              isNullable: false,
              isPrimary: true,
            },
            {
              name: 'role_id',
              type: 'uuid',
              isNullable: false,
              isPrimary: true,
            },
          ],
        }),
        true,
      );

      await queryRunner.createIndex(
        'user_roles',
        new TableIndex({
          name: 'IDX_user_roles_user_id',
          columnNames: ['user_id'],
        }),
      );
      await queryRunner.createIndex(
        'user_roles',
        new TableIndex({
          name: 'IDX_user_roles_role_id',
          columnNames: ['role_id'],
        }),
      );

      await queryRunner.createForeignKey(
        'user_roles',
        new TableForeignKey({
          name: 'FK_user_roles_user_id',
          columnNames: ['user_id'],
          referencedTableName: 'users',
          referencedColumnNames: ['id'],
          onDelete: 'CASCADE',
        }),
      );
      await queryRunner.createForeignKey(
        'user_roles',
        new TableForeignKey({
          name: 'FK_user_roles_role_id',
          columnNames: ['role_id'],
          referencedTableName: 'roles',
          referencedColumnNames: ['id'],
          onDelete: 'CASCADE',
        }),
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop join tables first (FK dependencies)
    const hasUserRoles = await queryRunner.hasTable('user_roles');
    if (hasUserRoles) await queryRunner.dropTable('user_roles', true);

    const hasRolePermissions = await queryRunner.hasTable('role_permissions');
    if (hasRolePermissions)
      await queryRunner.dropTable('role_permissions', true);

    const hasPermissions = await queryRunner.hasTable('permissions');
    if (hasPermissions) await queryRunner.dropTable('permissions', true);

    const hasRoles = await queryRunner.hasTable('roles');
    if (hasRoles) await queryRunner.dropTable('roles', true);
  }
}
