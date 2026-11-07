import { MigrationInterface, QueryRunner } from 'typeorm';

export class HideTimesheetCustomerApprovalForMobileViewer20260606000200 implements MigrationInterface {
  name = 'HideTimesheetCustomerApprovalForMobileViewer20260606000200';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const hasTable = await queryRunner.hasTable('form_templates');
    if (!hasTable) return;

    await queryRunner.query(`
      UPDATE form_templates AS ft
      SET fields = updated.fields
      FROM (
        SELECT
          id,
          jsonb_agg(
            CASE
              WHEN field.value->>'id' = 'worker_timesheets'
                OR field.value->>'key' = 'workerTimesheets'
                OR field.value->>'type' = 'timesheet'
              THEN jsonb_set(
                field.value,
                '{rules}',
                COALESCE(field.value->'rules', '{}'::jsonb) || '{"hideCustomerApprovalForMobileRoles":["viewer"]}'::jsonb,
                true
              )
              ELSE field.value
            END
            ORDER BY field.ordinality
          ) AS fields
        FROM form_templates
        CROSS JOIN LATERAL jsonb_array_elements(fields) WITH ORDINALITY AS field(value, ordinality)
        WHERE fields IS NOT NULL
        GROUP BY id
      ) AS updated
      WHERE ft.id = updated.id
        AND EXISTS (
          SELECT 1
          FROM jsonb_array_elements(ft.fields) AS field(value)
          WHERE field.value->>'id' = 'worker_timesheets'
            OR field.value->>'key' = 'workerTimesheets'
            OR field.value->>'type' = 'timesheet'
        )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const hasTable = await queryRunner.hasTable('form_templates');
    if (!hasTable) return;

    await queryRunner.query(`
      UPDATE form_templates AS ft
      SET fields = updated.fields
      FROM (
        SELECT
          id,
          jsonb_agg(
            CASE
              WHEN field.value->>'id' = 'worker_timesheets'
                OR field.value->>'key' = 'workerTimesheets'
                OR field.value->>'type' = 'timesheet'
              THEN jsonb_set(
                field.value,
                '{rules}',
                COALESCE(field.value->'rules', '{}'::jsonb) - 'hideCustomerApprovalForMobileRoles',
                true
              )
              ELSE field.value
            END
            ORDER BY field.ordinality
          ) AS fields
        FROM form_templates
        CROSS JOIN LATERAL jsonb_array_elements(fields) WITH ORDINALITY AS field(value, ordinality)
        WHERE fields IS NOT NULL
        GROUP BY id
      ) AS updated
      WHERE ft.id = updated.id
        AND EXISTS (
          SELECT 1
          FROM jsonb_array_elements(ft.fields) AS field(value)
          WHERE field.value->>'id' = 'worker_timesheets'
            OR field.value->>'key' = 'workerTimesheets'
            OR field.value->>'type' = 'timesheet'
        )
    `);
  }
}
