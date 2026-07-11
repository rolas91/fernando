import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Refactor: shift status unified into a single controlled vocabulary.
 *
 * Replaces the old status_catalog seed (pending / partially_confirmed /
 * confirmed / in_progress / completed) with the seven statuses the shift
 * calendar actually uses, divided into two kinds:
 *
 *   - Manual (user picks them when creating / editing a shift):
 *       customer_pending, dispatch_pending, ready_to_notify
 *
 *   - Automatic (computed by the backend from confirmation_status and form
 *     submissions; users cannot pick them):
 *       awaiting_response, workers_confirmed, shift_cancelled, shift_completed
 */
export class AddShiftStatusCatalog20260712001000
  implements MigrationInterface
{
  name = 'AddShiftStatusCatalog20260712001000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM status_catalog
      WHERE scope = 'shift'
    `);

    await queryRunner.query(`
      ALTER TABLE status_catalog
        ADD COLUMN IF NOT EXISTS automatic BOOLEAN NOT NULL DEFAULT FALSE
    `);

    const rows: Array<[string, string, string, string, string, number, boolean, boolean, boolean, boolean, string]> = [
      ['shift_customer_pending', 'shift', 'customer_pending', 'Customer Pending', '#F97316', 10, false, false, false, false, 'active'],
      ['shift_dispatch_pending', 'shift', 'dispatch_pending', 'Dispatch Pending', '#EAB308', 20, false, false, false, false, 'active'],
      ['shift_ready_to_notify', 'shift', 'ready_to_notify', 'Ready to Notify', '#3B82F6', 30, false, false, true, false, 'active'],
      ['shift_awaiting_response', 'shift', 'awaiting_response', 'Awaiting Response', '#8B5CF6', 40, false, false, true, true, 'active'],
      ['shift_workers_confirmed', 'shift', 'workers_confirmed', 'Workers Confirmed', '#22C55E', 50, false, false, false, true, 'active'],
      ['shift_cancelled', 'shift', 'shift_cancelled', 'Shift Cancelled', '#EF4444', 60, true, false, false, true, 'active'],
      ['shift_completed', 'shift', 'shift_completed', 'Shift Completed', '#64748B', 70, true, false, false, true, 'active'],
    ];

    for (const [id, scope, value, name, color, sortOrder, blocksEditing, triggersNotification, requiresApproval, automatic, status] of rows) {
      await queryRunner.query(
        `INSERT INTO status_catalog (
            id, scope, value, name, color, sort_order,
            blocks_editing, triggers_notification, requires_approval,
            automatic, status, created_at, updated_at
          )
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW(),NOW())
          ON CONFLICT (id) DO UPDATE SET
            scope = EXCLUDED.scope,
            value = EXCLUDED.value,
            name = EXCLUDED.name,
            color = EXCLUDED.color,
            sort_order = EXCLUDED.sort_order,
            blocks_editing = EXCLUDED.blocks_editing,
            triggers_notification = EXCLUDED.triggers_notification,
            requires_approval = EXCLUDED.requires_approval,
            automatic = EXCLUDED.automatic,
            status = EXCLUDED.status,
            updated_at = NOW()`,
        [id, scope, value, name, color, sortOrder, blocksEditing, triggersNotification, requiresApproval, automatic, status],
      );
    }

    await queryRunner.query(`
      UPDATE work_order_shifts
         SET status = 'customer_pending'
       WHERE status NOT IN ('customer_pending', 'dispatch_pending', 'ready_to_notify')
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM status_catalog WHERE scope = 'shift'`);
    await queryRunner.query(`ALTER TABLE status_catalog DROP COLUMN IF EXISTS automatic`);
    const rows = [
      ['shift_pending', 'shift', 'pending', 'Pending', '#F59E0B', 10, false, false, false, 'active'],
      ['shift_partially_confirmed', 'shift', 'partially_confirmed', 'Partially Confirmed', '#3B82F6', 20, false, true, false, 'active'],
      ['shift_confirmed', 'shift', 'confirmed', 'Confirmed', '#22C55E', 30, false, true, false, 'active'],
      ['shift_in_progress', 'shift', 'in_progress', 'In Progress', '#0EA5E9', 40, false, false, false, 'active'],
      ['shift_completed', 'shift', 'completed', 'Completed', '#334155', 50, false, false, false, 'active'],
    ];
    for (const [id, scope, value, name, color, sortOrder, blocksEditing, triggersNotification, requiresApproval, status] of rows) {
      await queryRunner.query(
        `INSERT INTO status_catalog (
            id, scope, value, name, color, sort_order,
            blocks_editing, triggers_notification, requires_approval,
            status, created_at, updated_at
          )
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW(),NOW())
          ON CONFLICT (id) DO NOTHING`,
        [id, scope, value, name, color, sortOrder, blocksEditing, triggersNotification, requiresApproval, status],
      );
    }
  }
}
