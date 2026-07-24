import { MigrationInterface, QueryRunner } from 'typeorm';

export class BindWorkShiftToShiftType20260724001000
  implements MigrationInterface
{
  name = 'BindWorkShiftToShiftType20260724001000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('form_templates'))) return;

    await queryRunner.query(`
      UPDATE form_templates AS ft
      SET fields = updated.fields
      FROM (
        SELECT
          id,
          jsonb_agg(
            CASE
              WHEN field->>'key' = 'workShift'
                OR field->>'id' IN ('work_shift', 'workShift')
              THEN
                (
                  ((field - 'options' - 'dataBinding') #- '{ui,defaultValue}')
                  || jsonb_build_object(
                    'type', 'text',
                    'dataBinding', jsonb_build_object(
                      'path', 'shift.shiftTypeName',
                      'optional', false,
                      'editable', false
                    ),
                    'ui', COALESCE(
                      (field #- '{ui,defaultValue}')->'ui',
                      '{}'::jsonb
                    ) || jsonb_build_object(
                      'helperText',
                      'Automatically loaded from the selected shift.'
                    )
                  )
                )
              ELSE field
            END
            ORDER BY ordinal
          ) AS fields
        FROM form_templates
        CROSS JOIN LATERAL jsonb_array_elements(fields)
          WITH ORDINALITY AS entries(field, ordinal)
        GROUP BY id
      ) AS updated
      WHERE ft.id = updated.id
        AND EXISTS (
          SELECT 1
          FROM jsonb_array_elements(ft.fields) AS candidate
          WHERE candidate->>'key' = 'workShift'
             OR candidate->>'id' IN ('work_shift', 'workShift')
        )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('form_templates'))) return;

    await queryRunner.query(`
      UPDATE form_templates AS ft
      SET fields = updated.fields
      FROM (
        SELECT
          id,
          jsonb_agg(
            CASE
              WHEN field->>'key' = 'workShift'
                OR field->>'id' IN ('work_shift', 'workShift')
              THEN
                (
                  (field - 'dataBinding')
                  || jsonb_build_object(
                    'type', 'dropdown',
                    'options', '["Day", "Swing", "Night"]'::jsonb,
                    'ui', COALESCE(field->'ui', '{}'::jsonb)
                      || jsonb_build_object('defaultValue', 'Day')
                  )
                )
              ELSE field
            END
            ORDER BY ordinal
          ) AS fields
        FROM form_templates
        CROSS JOIN LATERAL jsonb_array_elements(fields)
          WITH ORDINALITY AS entries(field, ordinal)
        GROUP BY id
      ) AS updated
      WHERE ft.id = updated.id
        AND EXISTS (
          SELECT 1
          FROM jsonb_array_elements(ft.fields) AS candidate
          WHERE candidate->>'key' = 'workShift'
             OR candidate->>'id' IN ('work_shift', 'workShift')
        )
    `);
  }
}
