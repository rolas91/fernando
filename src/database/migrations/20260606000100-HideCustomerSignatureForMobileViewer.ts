import { MigrationInterface, QueryRunner } from 'typeorm';

export class HideCustomerSignatureForMobileViewer20260606000100 implements MigrationInterface {
  name = 'HideCustomerSignatureForMobileViewer20260606000100';

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
              WHEN field.value->>'id' = 'customer_approval_signature'
                OR field.value->>'key' = 'customerApprovalSignature'
                OR lower(field.value->>'label') LIKE '%customer%approval%'
              THEN jsonb_set(
                field.value,
                '{rules}',
                COALESCE(field.value->'rules', '{}'::jsonb) || '{"hiddenForMobileRoles":["viewer"]}'::jsonb,
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
          WHERE field.value->>'id' = 'customer_approval_signature'
            OR field.value->>'key' = 'customerApprovalSignature'
            OR lower(field.value->>'label') LIKE '%customer%approval%'
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
              WHEN field.value->>'id' = 'customer_approval_signature'
                OR field.value->>'key' = 'customerApprovalSignature'
                OR lower(field.value->>'label') LIKE '%customer%approval%'
              THEN jsonb_set(
                field.value,
                '{rules}',
                COALESCE(field.value->'rules', '{}'::jsonb) - 'hiddenForMobileRoles',
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
          WHERE field.value->>'id' = 'customer_approval_signature'
            OR field.value->>'key' = 'customerApprovalSignature'
            OR lower(field.value->>'label') LIKE '%customer%approval%'
        )
    `);
  }
}
