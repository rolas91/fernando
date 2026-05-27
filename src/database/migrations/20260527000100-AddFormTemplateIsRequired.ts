import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddFormTemplateIsRequired20260527000100 implements MigrationInterface {
  name = 'AddFormTemplateIsRequired20260527000100';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('form_templates'))) return;
    if (await queryRunner.hasColumn('form_templates', 'is_required')) return;
    await queryRunner.addColumn(
      'form_templates',
      new TableColumn({
        name: 'is_required',
        type: 'boolean',
        isNullable: false,
        default: true,
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('form_templates'))) return;
    if (await queryRunner.hasColumn('form_templates', 'is_required')) {
      await queryRunner.dropColumn('form_templates', 'is_required');
    }
  }
}
