import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddShiftConfirmationResetReason20260811001000
  implements MigrationInterface
{
  name = 'AddShiftConfirmationResetReason20260811001000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE work_order_shifts
        ADD COLUMN IF NOT EXISTS confirmation_reset_reason VARCHAR(32) NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE work_order_shifts
        DROP COLUMN IF EXISTS confirmation_reset_reason
    `);
  }
}
