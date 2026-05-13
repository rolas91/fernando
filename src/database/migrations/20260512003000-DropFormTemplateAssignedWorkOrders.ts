import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class DropFormTemplateAssignedWorkOrders20260512003000
  implements MigrationInterface
{
  name = 'DropFormTemplateAssignedWorkOrders20260512003000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('form_templates')) {
      if (await queryRunner.hasColumn('form_templates', 'assigned_work_orders')) {
        await queryRunner.dropColumn('form_templates', 'assigned_work_orders');
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('form_templates')) {
      if (!(await queryRunner.hasColumn('form_templates', 'assigned_work_orders'))) {
        await queryRunner.addColumn(
          'form_templates',
          new TableColumn({
            name: 'assigned_work_orders',
            type: 'text',
            isArray: true,
            isNullable: false,
            default: "'{}'",
          }),
        );
      }
    }
  }
}
