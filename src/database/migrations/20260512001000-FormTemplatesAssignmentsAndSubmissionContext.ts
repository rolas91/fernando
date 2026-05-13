import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class FormTemplatesAssignmentsAndSubmissionContext20260512001000
  implements MigrationInterface
{
  name = 'FormTemplatesAssignmentsAndSubmissionContext20260512001000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('form_submissions')) {
      if (!(await queryRunner.hasColumn('form_submissions', 'work_order_id'))) {
        await queryRunner.addColumn(
          'form_submissions',
          new TableColumn({
            name: 'work_order_id',
            type: 'varchar',
            length: '64',
            isNullable: false,
            default: "''",
          }),
        );
      }
      if (!(await queryRunner.hasColumn('form_submissions', 'shift_id'))) {
        await queryRunner.addColumn(
          'form_submissions',
          new TableColumn({
            name: 'shift_id',
            type: 'varchar',
            length: '64',
            isNullable: false,
            default: "''",
          }),
        );
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('form_submissions')) {
      if (await queryRunner.hasColumn('form_submissions', 'shift_id')) {
        await queryRunner.dropColumn('form_submissions', 'shift_id');
      }
      if (await queryRunner.hasColumn('form_submissions', 'work_order_id')) {
        await queryRunner.dropColumn('form_submissions', 'work_order_id');
      }
    }
  }
}
