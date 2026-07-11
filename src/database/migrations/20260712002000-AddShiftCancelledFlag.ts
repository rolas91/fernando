import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds a `cancelled` boolean to `work_order_shifts`. The shift-status
 * computation uses this flag to derive the automatic `shift_cancelled`
 * status independently of the user-pickable `status` column.
 */
export class AddShiftCancelledFlag20260712002000
  implements MigrationInterface
{
  name = 'AddShiftCancelledFlag20260712002000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE work_order_shifts
        ADD COLUMN IF NOT EXISTS cancelled BOOLEAN NOT NULL DEFAULT FALSE
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE work_order_shifts
        DROP COLUMN IF EXISTS cancelled
    `);
  }
}
