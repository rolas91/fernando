import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPmApprovalToShifts20260805001000 implements MigrationInterface {
  name = 'AddPmApprovalToShifts20260805001000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE work_order_shifts
        ADD COLUMN IF NOT EXISTS pm_approved_at TIMESTAMP NULL,
        ADD COLUMN IF NOT EXISTS pm_approved_by_user_id UUID NULL
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE work_order_shifts
          ADD CONSTRAINT fk_work_order_shifts_pm_approved_by
          FOREIGN KEY (pm_approved_by_user_id) REFERENCES users(id) ON DELETE SET NULL;
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$
    `);
    await queryRunner.query(`
      INSERT INTO status_catalog (
        id, scope, value, name, color, sort_order, blocks_editing,
        triggers_notification, requires_approval, automatic, status,
        created_at, updated_at
      ) VALUES (
        'shift_pm_approved', 'shift', 'pm_approved', 'PM Approved', '#0F766E', 80,
        TRUE, FALSE, FALSE, TRUE, 'active', NOW(), NOW()
      )
      ON CONFLICT (id) DO UPDATE SET
        value = EXCLUDED.value,
        name = EXCLUDED.name,
        color = EXCLUDED.color,
        sort_order = EXCLUDED.sort_order,
        blocks_editing = EXCLUDED.blocks_editing,
        automatic = EXCLUDED.automatic,
        status = EXCLUDED.status,
        updated_at = NOW()
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM status_catalog WHERE id = 'shift_pm_approved'`);
    await queryRunner.query(`
      ALTER TABLE work_order_shifts
        DROP CONSTRAINT IF EXISTS fk_work_order_shifts_pm_approved_by,
        DROP COLUMN IF EXISTS pm_approved_by_user_id,
        DROP COLUMN IF EXISTS pm_approved_at
    `);
  }
}
