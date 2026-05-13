import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddWorkOrderFormTemplateIds20260512002000 implements MigrationInterface {
  name = 'AddWorkOrderFormTemplateIds20260512002000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('work_orders'))) return;
    if (await queryRunner.hasColumn('work_orders', 'form_template_ids')) return;

    await queryRunner.addColumn(
      'work_orders',
      new TableColumn({
        name: 'form_template_ids',
        type: 'text',
        isArray: true,
        isNullable: false,
        default: "'{}'",
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('work_orders'))) return;
    if (await queryRunner.hasColumn('work_orders', 'form_template_ids')) {
      await queryRunner.dropColumn('work_orders', 'form_template_ids');
    }
  }
}
