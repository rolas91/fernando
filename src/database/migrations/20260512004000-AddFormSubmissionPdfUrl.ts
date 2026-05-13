import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddFormSubmissionPdfUrl20260512004000
  implements MigrationInterface
{
  name = 'AddFormSubmissionPdfUrl20260512004000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('form_submissions'))) return;
    if (await queryRunner.hasColumn('form_submissions', 'pdf_url')) return;

    await queryRunner.addColumn(
      'form_submissions',
      new TableColumn({
        name: 'pdf_url',
        type: 'text',
        isNullable: false,
        default: "''",
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('form_submissions'))) return;
    if (await queryRunner.hasColumn('form_submissions', 'pdf_url')) {
      await queryRunner.dropColumn('form_submissions', 'pdf_url');
    }
  }
}
