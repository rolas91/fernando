import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddShiftDisplayOrder20260811002000 implements MigrationInterface {
  name = 'AddShiftDisplayOrder20260811002000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE work_order_shifts
        ADD COLUMN IF NOT EXISTS display_order INTEGER NOT NULL DEFAULT 0
    `);
    await queryRunner.query(`
      WITH ordered AS (
        SELECT
          id,
          (ROW_NUMBER() OVER (
            PARTITION BY work_order_id
            ORDER BY date ASC, start_time DESC, id ASC
          ) - 1)::INTEGER AS next_order
        FROM work_order_shifts
      )
      UPDATE work_order_shifts AS shift
      SET display_order = ordered.next_order
      FROM ordered
      WHERE ordered.id = shift.id
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE work_order_shifts
        DROP COLUMN IF EXISTS display_order
    `);
  }
}
