import { MigrationInterface, QueryRunner } from 'typeorm';

/** Existing form templates must bind job-site fields to the selected shift. */
export class UseShiftAddressInFormTemplates20260712004000 implements MigrationInterface {
  name = 'UseShiftAddressInFormTemplates20260712004000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE form_templates ft
      SET fields = patched.fields,
          updated_at = NOW()
      FROM (
        SELECT id,
               jsonb_agg(
                 CASE
                   WHEN field #>> '{dataBinding,path}' = 'workOrder.assignmentAddress'
                     THEN jsonb_set(field, '{dataBinding,path}', '"shift.address"'::jsonb)
                   ELSE field
                 END
                 ORDER BY ordinal
               ) AS fields
        FROM form_templates,
             jsonb_array_elements(fields) WITH ORDINALITY AS entries(field, ordinal)
        GROUP BY id
      ) patched
      WHERE ft.id = patched.id
        AND ft.fields @> '[{"dataBinding":{"path":"workOrder.assignmentAddress"}}]'::jsonb
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE form_templates ft
      SET fields = patched.fields,
          updated_at = NOW()
      FROM (
        SELECT id,
               jsonb_agg(
                 CASE
                   WHEN field #>> '{dataBinding,path}' = 'shift.address'
                     THEN jsonb_set(field, '{dataBinding,path}', '"workOrder.assignmentAddress"'::jsonb)
                   ELSE field
                 END
                 ORDER BY ordinal
               ) AS fields
        FROM form_templates,
             jsonb_array_elements(fields) WITH ORDINALITY AS entries(field, ordinal)
        GROUP BY id
      ) patched
      WHERE ft.id = patched.id
        AND ft.fields @> '[{"dataBinding":{"path":"shift.address"}}]'::jsonb
    `);
  }
}
