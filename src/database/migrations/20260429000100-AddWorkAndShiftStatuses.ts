import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddWorkAndShiftStatuses20260429000100
  implements MigrationInterface
{
  name = 'AddWorkAndShiftStatuses20260429000100';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const rows = [
      ['ws_pending', 'work_status', 'pending', 'Pending', '#F59E0B', 10, false, false, false, 'active'],
      ['ws_confirmed', 'work_status', 'confirmed', 'Confirmed', '#22C55E', 20, false, false, false, 'active'],
      ['ws_declined', 'work_status', 'declined', 'Declined', '#EF4444', 30, false, true, false, 'active'],
      ['ws_not_available', 'work_status', 'not_available', 'Not Available', '#6B7280', 40, false, false, false, 'active'],
      ['shift_pending', 'shift', 'pending', 'Pending', '#F59E0B', 10, false, false, false, 'active'],
      ['shift_partially_confirmed', 'shift', 'partially_confirmed', 'Partially Confirmed', '#3B82F6', 20, false, true, false, 'active'],
      ['shift_confirmed', 'shift', 'confirmed', 'Confirmed', '#22C55E', 30, false, true, false, 'active'],
      ['shift_in_progress', 'shift', 'in_progress', 'In Progress', '#0EA5E9', 40, false, false, false, 'active'],
      ['shift_completed', 'shift', 'completed', 'Completed', '#334155', 50, false, false, false, 'active'],
    ];

    for (const [
      id,
      scope,
      value,
      name,
      color,
      sortOrder,
      blocksEditing,
      triggersNotification,
      requiresApproval,
      status,
    ] of rows) {
      await queryRunner.query(
        `
          INSERT INTO status_catalog (
            id,
            scope,
            value,
            name,
            color,
            sort_order,
            blocks_editing,
            triggers_notification,
            requires_approval,
            status,
            created_at,
            updated_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())
          ON CONFLICT (id) DO UPDATE SET
            scope = EXCLUDED.scope,
            value = EXCLUDED.value,
            name = EXCLUDED.name,
            color = EXCLUDED.color,
            sort_order = EXCLUDED.sort_order,
            blocks_editing = EXCLUDED.blocks_editing,
            triggers_notification = EXCLUDED.triggers_notification,
            requires_approval = EXCLUDED.requires_approval,
            status = EXCLUDED.status,
            updated_at = NOW()
        `,
        [
          id,
          scope,
          value,
          name,
          color,
          sortOrder,
          blocksEditing,
          triggersNotification,
          requiresApproval,
          status,
        ],
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `
        DELETE FROM status_catalog
        WHERE id = ANY($1)
      `,
      [[
        'ws_pending',
        'ws_confirmed',
        'ws_declined',
        'ws_not_available',
        'shift_pending',
        'shift_partially_confirmed',
        'shift_confirmed',
        'shift_in_progress',
        'shift_completed',
      ]],
    );
  }
}
