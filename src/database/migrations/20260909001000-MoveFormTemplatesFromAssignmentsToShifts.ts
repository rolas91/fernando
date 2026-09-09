import { MigrationInterface, QueryRunner } from 'typeorm';

export class MoveFormTemplatesFromAssignmentsToShifts20260909001000
  implements MigrationInterface
{
  name = 'MoveFormTemplatesFromAssignmentsToShifts20260909001000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "work_order_shifts"
      ADD COLUMN IF NOT EXISTS "form_template_ids" text[] NOT NULL DEFAULT '{}'
    `);
    await queryRunner.query(`
      UPDATE "work_order_shifts" AS shift
      SET "form_template_ids" = COALESCE(work_order."form_template_ids", '{}')
      FROM "work_orders" AS work_order
      WHERE shift."work_order_id" = work_order."id"
    `);
    await queryRunner.query(`
      ALTER TABLE "work_orders"
      DROP COLUMN IF EXISTS "form_template_ids"
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "work_orders"
      ADD COLUMN IF NOT EXISTS "form_template_ids" text[] NOT NULL DEFAULT '{}'
    `);
    await queryRunner.query(`
      UPDATE "work_orders" AS work_order
      SET "form_template_ids" = COALESCE(forms.ids, '{}')
      FROM (
        SELECT shift."work_order_id", array_agg(DISTINCT template_id) AS ids
        FROM "work_order_shifts" AS shift
        CROSS JOIN LATERAL unnest(shift."form_template_ids") AS template_id
        GROUP BY shift."work_order_id"
      ) AS forms
      WHERE work_order."id" = forms."work_order_id"
    `);
    await queryRunner.query(`
      ALTER TABLE "work_order_shifts"
      DROP COLUMN IF EXISTS "form_template_ids"
    `);
  }
}
