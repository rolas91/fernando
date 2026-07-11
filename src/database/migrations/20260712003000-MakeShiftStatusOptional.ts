import { MigrationInterface, QueryRunner } from 'typeorm';

/** Manual shift status is optional until an administrator explicitly selects it. */
export class MakeShiftStatusOptional20260712003000 implements MigrationInterface {
  name = 'MakeShiftStatusOptional20260712003000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE work_order_shifts
        ALTER COLUMN status DROP DEFAULT,
        ALTER COLUMN status DROP NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE work_order_shifts SET status = 'customer_pending' WHERE status IS NULL
    `);
    await queryRunner.query(`
      ALTER TABLE work_order_shifts
        ALTER COLUMN status SET DEFAULT 'customer_pending',
        ALTER COLUMN status SET NOT NULL
    `);
  }
}
