import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableColumn,
} from 'typeorm';

export class MigrateUserProfilesToUsers20260428000200
  implements MigrationInterface
{
  name = 'MigrateUserProfilesToUsers20260428000200';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');

    const usersTable = await queryRunner.getTable('users');
    if (!usersTable) {
      throw new Error('La tabla users debe existir antes de migrar usuarios');
    }

    const requiredColumns: TableColumn[] = [
      new TableColumn({
        name: 'first_name',
        type: 'varchar',
        length: '120',
        isNullable: false,
        default: "''",
      }),
      new TableColumn({
        name: 'last_name',
        type: 'varchar',
        length: '120',
        isNullable: false,
        default: "''",
      }),
      new TableColumn({
        name: 'phone',
        type: 'varchar',
        length: '64',
        isNullable: false,
        default: "''",
      }),
      new TableColumn({
        name: 'avatar_url',
        type: 'text',
        isNullable: true,
      }),
      new TableColumn({
        name: 'status',
        type: 'varchar',
        length: '32',
        isNullable: false,
        default: "'active'",
      }),
      new TableColumn({
        name: 'last_login',
        type: 'timestamp',
        isNullable: true,
      }),
    ];

    for (const column of requiredColumns) {
      const exists = usersTable.findColumnByName(column.name);
      if (!exists) {
        await queryRunner.addColumn('users', column);
      }
    }

    const hasUserProfiles = await queryRunner.hasTable('user_profiles');
    if (!hasUserProfiles) {
      return;
    }

    await queryRunner.query(`
      INSERT INTO roles (id, key, name, description, created_at, updated_at)
      VALUES
        (uuid_generate_v4(), 'admin', 'Admin', null, now(), now()),
        (uuid_generate_v4(), 'manager', 'Manager', null, now(), now()),
        (uuid_generate_v4(), 'scheduler', 'Scheduler', null, now(), now()),
        (uuid_generate_v4(), 'viewer', 'Viewer', null, now(), now())
      ON CONFLICT (key) DO NOTHING
    `);

    await queryRunner.query(`
      INSERT INTO users (
        id,
        email,
        password_hash,
        first_name,
        last_name,
        phone,
        avatar_url,
        status,
        last_login,
        created_at,
        updated_at
      )
      SELECT
        CASE
          WHEN up.id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
            THEN up.id::uuid
          ELSE uuid_generate_v4()
        END,
        lower(trim(up.email)),
        up.password_hash,
        COALESCE(up.first_name, ''),
        COALESCE(up.last_name, ''),
        COALESCE(up.phone, ''),
        up.avatar_url,
        COALESCE(NULLIF(trim(up.status), ''), 'active'),
        up.last_login,
        COALESCE(up.created_at, now()),
        COALESCE(up.updated_at, now())
      FROM user_profiles up
      ON CONFLICT (email) DO UPDATE SET
        password_hash = EXCLUDED.password_hash,
        first_name = EXCLUDED.first_name,
        last_name = EXCLUDED.last_name,
        phone = EXCLUDED.phone,
        avatar_url = EXCLUDED.avatar_url,
        status = EXCLUDED.status,
        last_login = EXCLUDED.last_login,
        updated_at = EXCLUDED.updated_at
    `);

    await queryRunner.query(`
      DELETE FROM user_roles ur
      USING roles r, users u
      WHERE ur.role_id = r.id
        AND ur.user_id = u.id
        AND r.key IN ('admin', 'manager', 'scheduler', 'viewer')
        AND u.email IN (SELECT lower(trim(email)) FROM user_profiles)
    `);

    await queryRunner.query(`
      INSERT INTO user_roles (user_id, role_id)
      SELECT
        u.id,
        r.id
      FROM user_profiles up
      INNER JOIN users u
        ON u.email = lower(trim(up.email))
      INNER JOIN roles r
        ON r.key = CASE
          WHEN lower(COALESCE(NULLIF(trim(up.role), ''), 'viewer'))
            IN ('admin', 'manager', 'scheduler', 'viewer')
            THEN lower(trim(up.role))
          ELSE 'viewer'
        END
      ON CONFLICT DO NOTHING
    `);

    await queryRunner.dropTable('user_profiles', true);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const hasUserProfiles = await queryRunner.hasTable('user_profiles');
    if (!hasUserProfiles) {
      await queryRunner.createTable(
        new Table({
          name: 'user_profiles',
          columns: [
            { name: 'id', type: 'varchar', length: '64', isPrimary: true },
            {
              name: 'email',
              type: 'varchar',
              length: '255',
              isNullable: false,
              isUnique: true,
            },
            { name: 'password_hash', type: 'text', isNullable: false },
            {
              name: 'first_name',
              type: 'varchar',
              length: '120',
              isNullable: false,
              default: "''",
            },
            {
              name: 'last_name',
              type: 'varchar',
              length: '120',
              isNullable: false,
              default: "''",
            },
            {
              name: 'role',
              type: 'varchar',
              length: '32',
              isNullable: false,
              default: "'viewer'",
            },
            {
              name: 'phone',
              type: 'varchar',
              length: '64',
              isNullable: false,
              default: "''",
            },
            { name: 'avatar_url', type: 'text', isNullable: true },
            {
              name: 'status',
              type: 'varchar',
              length: '32',
              isNullable: false,
              default: "'active'",
            },
            { name: 'last_login', type: 'timestamp', isNullable: true },
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

    await queryRunner.query(`
      INSERT INTO user_profiles (
        id,
        email,
        password_hash,
        first_name,
        last_name,
        role,
        phone,
        avatar_url,
        status,
        last_login,
        created_at,
        updated_at
      )
      SELECT
        u.id::varchar,
        u.email,
        u.password_hash,
        COALESCE(u.first_name, ''),
        COALESCE(u.last_name, ''),
        CASE
          WHEN EXISTS (
            SELECT 1
            FROM user_roles ur
            INNER JOIN roles r ON r.id = ur.role_id
            WHERE ur.user_id = u.id AND r.key = 'admin'
          ) THEN 'admin'
          WHEN EXISTS (
            SELECT 1
            FROM user_roles ur
            INNER JOIN roles r ON r.id = ur.role_id
            WHERE ur.user_id = u.id AND r.key = 'manager'
          ) THEN 'manager'
          WHEN EXISTS (
            SELECT 1
            FROM user_roles ur
            INNER JOIN roles r ON r.id = ur.role_id
            WHERE ur.user_id = u.id AND r.key = 'scheduler'
          ) THEN 'scheduler'
          ELSE 'viewer'
        END,
        COALESCE(u.phone, ''),
        u.avatar_url,
        COALESCE(u.status, 'active'),
        u.last_login,
        u.created_at,
        u.updated_at
      FROM users u
      ON CONFLICT (email) DO NOTHING
    `);
  }
}
