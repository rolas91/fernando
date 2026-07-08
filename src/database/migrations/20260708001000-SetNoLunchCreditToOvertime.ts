import { MigrationInterface, QueryRunner } from 'typeorm';

export class SetNoLunchCreditToOvertime20260708001000
  implements MigrationInterface
{
  name = 'SetNoLunchCreditToOvertime20260708001000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('company_settings'))) return;

    await queryRunner.query(`
      UPDATE company_settings
      SET overtime_rules =
        COALESCE(overtime_rules, '{}'::jsonb)
        || CASE
          WHEN COALESCE(overtime_rules, '{}'::jsonb) ? 'noLunchCreditTarget'
            THEN '{}'::jsonb
          ELSE '{"noLunchCreditTarget":"ot"}'::jsonb
        END
        || CASE
          WHEN COALESCE(overtime_rules, '{}'::jsonb) ? 'noLunchCreditEffectiveDate'
            THEN '{}'::jsonb
          ELSE '{"noLunchCreditEffectiveDate":"2026-07-08"}'::jsonb
        END
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('company_settings'))) return;

    await queryRunner.query(`
      UPDATE company_settings
      SET overtime_rules =
        COALESCE(overtime_rules, '{}'::jsonb)
        - 'noLunchCreditTarget'
        - 'noLunchCreditEffectiveDate'
    `);
  }
}
