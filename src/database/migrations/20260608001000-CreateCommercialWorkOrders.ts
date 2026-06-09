import { MigrationInterface, QueryRunner, Table } from 'typeorm';

export class CreateCommercialWorkOrders20260608001000 implements MigrationInterface {
  name = 'CreateCommercialWorkOrders20260608001000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const hasTable = await queryRunner.hasTable('commercial_work_orders');
    if (hasTable) return;

    await queryRunner.createTable(
      new Table({
        name: 'commercial_work_orders',
        columns: [
          { name: 'id', type: 'varchar', length: '64', isPrimary: true },
          { name: 'work_order_number', type: 'varchar', length: '80', isUnique: true },
          { name: 'type', type: 'varchar', length: '24' },
          { name: 'status', type: 'varchar', length: '32' },
          { name: 'parent_work_order_id', type: 'varchar', length: '64', isNullable: true },
          { name: 'rollover_index', type: 'integer', default: 0 },
          { name: 'job_number', type: 'varchar', length: '120', default: "''" },
          { name: 'job_name', type: 'varchar', length: '255', default: "''" },
          { name: 'project_id', type: 'varchar', length: '64', default: "''" },
          { name: 'customer_id', type: 'varchar', length: '64', default: "''" },
          { name: 'customer_name', type: 'varchar', length: '255', default: "''" },
          { name: 'contact', type: 'varchar', length: '180', default: "''" },
          { name: 'phone', type: 'varchar', length: '64', default: "''" },
          { name: 'email', type: 'varchar', length: '255', default: "''" },
          { name: 'customer_order_number', type: 'varchar', length: '120', default: "''" },
          { name: 'description_of_work', type: 'text', default: "''" },
          { name: 'work_date', type: 'date', isNullable: true },
          { name: 'on_rent_date', type: 'date', isNullable: true },
          { name: 'original_on_rent_date', type: 'date', isNullable: true },
          { name: 'previous_billing_date', type: 'date', isNullable: true },
          { name: 'next_invoice_date', type: 'date', isNullable: true },
          { name: 'off_rent_date', type: 'date', isNullable: true },
          { name: 'items', type: 'jsonb', default: "'[]'::jsonb" },
          { name: 'notes', type: 'text', default: "''" },
          { name: 'created_by', type: 'varchar', length: '180', default: "''" },
          { name: 'pdf_html', type: 'text', default: "''" },
          { name: 'pdf_generated_at', type: 'timestamp', isNullable: true },
          { name: 'created_at', type: 'timestamp', default: 'now()' },
          { name: 'updated_at', type: 'timestamp', default: 'now()' },
        ],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const hasTable = await queryRunner.hasTable('commercial_work_orders');
    if (hasTable) await queryRunner.dropTable('commercial_work_orders', true);
  }
}
