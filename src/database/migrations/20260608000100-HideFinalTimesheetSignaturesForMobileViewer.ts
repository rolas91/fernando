import { MigrationInterface, QueryRunner } from 'typeorm';

export class HideFinalTimesheetSignaturesForMobileViewer20260608000100 implements MigrationInterface {
  name = 'HideFinalTimesheetSignaturesForMobileViewer20260608000100';

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
              WHEN
                field.value->>'id' IN ('worker_signature', 'employee_foreman_signature', 'customer_approval_signature')
                OR field.value->>'key' IN ('workerSignature', 'employeeForemanSignature', 'customerApprovalSignature')
                OR lower(field.value->>'label') LIKE '%employee%foreman%signature%'
                OR lower(field.value->>'label') LIKE '%customer%approval%'
                OR lower(field.value->>'label') LIKE '%customer%contract%'
              THEN jsonb_set(
                field.value,
                '{rules}',
                jsonb_set(
                  COALESCE(field.value->'rules', '{}'::jsonb),
                  '{hiddenForMobileRoles}',
                  (
                    SELECT jsonb_agg(DISTINCT role_value)
                    FROM jsonb_array_elements_text(
                      COALESCE(field.value->'rules'->'hiddenForMobileRoles', '[]'::jsonb) || '["viewer"]'::jsonb
                    ) AS roles(role_value)
                  ),
                  true
                ),
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
          WHERE field.value->>'id' IN ('worker_signature', 'employee_foreman_signature', 'customer_approval_signature')
            OR field.value->>'key' IN ('workerSignature', 'employeeForemanSignature', 'customerApprovalSignature')
            OR lower(field.value->>'label') LIKE '%employee%foreman%signature%'
            OR lower(field.value->>'label') LIKE '%customer%approval%'
            OR lower(field.value->>'label') LIKE '%customer%contract%'
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
              WHEN
                field.value->>'id' IN ('worker_signature', 'employee_foreman_signature', 'customer_approval_signature')
                OR field.value->>'key' IN ('workerSignature', 'employeeForemanSignature', 'customerApprovalSignature')
                OR lower(field.value->>'label') LIKE '%employee%foreman%signature%'
                OR lower(field.value->>'label') LIKE '%customer%approval%'
                OR lower(field.value->>'label') LIKE '%customer%contract%'
              THEN jsonb_set(
                field.value,
                '{rules}',
                jsonb_set(
                  COALESCE(field.value->'rules', '{}'::jsonb),
                  '{hiddenForMobileRoles}',
                  COALESCE(
                    (
                      SELECT jsonb_agg(role_value)
                      FROM jsonb_array_elements_text(
                        COALESCE(field.value->'rules'->'hiddenForMobileRoles', '[]'::jsonb)
                      ) AS roles(role_value)
                      WHERE role_value <> 'viewer'
                    ),
                    '[]'::jsonb
                  ),
                  true
                ),
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
          WHERE field.value->>'id' IN ('worker_signature', 'employee_foreman_signature', 'customer_approval_signature')
            OR field.value->>'key' IN ('workerSignature', 'employeeForemanSignature', 'customerApprovalSignature')
            OR lower(field.value->>'label') LIKE '%employee%foreman%signature%'
            OR lower(field.value->>'label') LIKE '%customer%approval%'
            OR lower(field.value->>'label') LIKE '%customer%contract%'
        )
    `);
  }
}
