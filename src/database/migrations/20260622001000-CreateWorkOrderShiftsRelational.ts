import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateWorkOrderShiftsRelational20260622001000
  implements MigrationInterface
{
  name = 'CreateWorkOrderShiftsRelational20260622001000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS work_order_shifts (
        id varchar(64) PRIMARY KEY,
        work_order_id varchar(64) NOT NULL
          REFERENCES work_orders(id) ON DELETE CASCADE,
        date date NOT NULL,
        start_time varchar(16) NOT NULL DEFAULT '',
        end_time varchar(16) NOT NULL DEFAULT '',
        default_role_start_time varchar(16),
        shift_template_id varchar(64),
        created_at timestamptz NOT NULL DEFAULT NOW(),
        updated_at timestamptz NOT NULL DEFAULT NOW()
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_work_order_shifts_work_order ON work_order_shifts (work_order_id)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_work_order_shifts_date ON work_order_shifts (date)`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS work_order_shift_roles (
        id varchar(64) PRIMARY KEY,
        shift_id varchar(64) NOT NULL
          REFERENCES work_order_shifts(id) ON DELETE CASCADE,
        role_name varchar(180) NOT NULL,
        required_count integer NOT NULL DEFAULT 1,
        start_time varchar(16),
        required_certification_ids text[] NOT NULL DEFAULT '{}',
        required_skill_ids text[] NOT NULL DEFAULT '{}',
        created_at timestamptz NOT NULL DEFAULT NOW(),
        updated_at timestamptz NOT NULL DEFAULT NOW()
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_work_order_shift_roles_shift ON work_order_shift_roles (shift_id)`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS work_order_shift_role_workers (
        role_id varchar(64) NOT NULL
          REFERENCES work_order_shift_roles(id) ON DELETE CASCADE,
        worker_id varchar(64) NOT NULL
          REFERENCES workers(id) ON DELETE CASCADE,
        confirmation_status varchar(24) NOT NULL DEFAULT 'pending',
        requested_at timestamptz,
        responded_at timestamptz,
        notification_channel varchar(24),
        created_at timestamptz NOT NULL DEFAULT NOW(),
        updated_at timestamptz NOT NULL DEFAULT NOW(),
        PRIMARY KEY (role_id, worker_id)
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_wosrw_role ON work_order_shift_role_workers (role_id)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_wosrw_worker ON work_order_shift_role_workers (worker_id)`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS work_order_shift_role_equipment (
        role_id varchar(64) NOT NULL
          REFERENCES work_order_shift_roles(id) ON DELETE CASCADE,
        equipment_id varchar(64) NOT NULL
          REFERENCES equipment(id) ON DELETE CASCADE,
        created_at timestamptz NOT NULL DEFAULT NOW(),
        updated_at timestamptz NOT NULL DEFAULT NOW(),
        PRIMARY KEY (role_id, equipment_id)
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS work_order_shift_role_materials (
        role_id varchar(64) NOT NULL
          REFERENCES work_order_shift_roles(id) ON DELETE CASCADE,
        material_id varchar(64) NOT NULL
          REFERENCES materials(id) ON DELETE CASCADE,
        created_at timestamptz NOT NULL DEFAULT NOW(),
        updated_at timestamptz NOT NULL DEFAULT NOW(),
        PRIMARY KEY (role_id, material_id)
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS work_order_shift_role_materials`);
    await queryRunner.query(`DROP TABLE IF EXISTS work_order_shift_role_equipment`);
    await queryRunner.query(`DROP TABLE IF EXISTS work_order_shift_role_workers`);
    await queryRunner.query(`DROP TABLE IF EXISTS work_order_shift_roles`);
    await queryRunner.query(`DROP TABLE IF EXISTS work_order_shifts`);
  }
}
