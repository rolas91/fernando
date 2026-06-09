import { MigrationInterface, QueryRunner, Table } from 'typeorm';

const CATALOG_SEED = [
  ['item_cone_28', 'CONE-28', '28" Traffic Cone', 'Cone', '1.50', '5.00', 'Each', 'active'],
  ['item_cone_36', 'CONE-36', '36" Traffic Cone', 'Cone', '2.00', '7.00', 'Each', 'active'],
  ['item_base_18', 'BASE-18', '18" Rubber Base', 'Base', '0.80', '3.50', 'Each', 'active'],
  ['item_base_24', 'BASE-24', '24" Rubber Base', 'Base', '1.20', '4.50', 'Each', 'active'],
  ['item_sign_rw', 'SIGN-RW', 'Road Work Sign', 'Sign', '2.00', '8.00', 'Each', 'active'],
  ['item_sign_det', 'SIGN-DET', 'Detour Sign', 'Sign', '2.00', '8.00', 'Each', 'active'],
  ['item_barr_8', 'BARR-8', "8' Type III Barricade", 'Barricade', '1.75', '12.00', 'Each', 'active'],
  ['item_light_tma', 'LIGHT-TMA', 'TMA Arrow Board Light', 'Equipment', '15.00', '0.00', 'Each', 'active'],
  ['item_drum_18', 'DRUM-18', '18" Traffic Drum', 'Drum', '1.25', '6.00', 'Each', 'active'],
];

export class CreateCommercialCatalogAndInvoices20260609001000 implements MigrationInterface {
  name = 'CreateCommercialCatalogAndInvoices20260609001000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('commercial_catalog_items'))) {
      await queryRunner.createTable(
        new Table({
          name: 'commercial_catalog_items',
          columns: [
            { name: 'id', type: 'varchar', length: '64', isPrimary: true },
            { name: 'sku', type: 'varchar', length: '80', isUnique: true },
            { name: 'description', type: 'varchar', length: '255' },
            { name: 'type', type: 'varchar', length: '80', default: "''" },
            { name: 'daily_rate', type: 'numeric', precision: 12, scale: 2, default: 0 },
            { name: 'item_price', type: 'numeric', precision: 12, scale: 2, default: 0 },
            { name: 'unit', type: 'varchar', length: '40', default: "'Each'" },
            { name: 'status', type: 'varchar', length: '32', default: "'active'" },
            { name: 'notes', type: 'text', default: "''" },
            { name: 'created_at', type: 'timestamp', default: 'now()' },
            { name: 'updated_at', type: 'timestamp', default: 'now()' },
          ],
        }),
      );
    }

    const hasItemPriceColumn = await queryRunner.hasColumn('commercial_catalog_items', 'item_price');
    if (!hasItemPriceColumn) {
      await queryRunner.query(`ALTER TABLE commercial_catalog_items ADD COLUMN item_price numeric(12,2) NOT NULL DEFAULT 0`);
    }

    for (const row of CATALOG_SEED) {
      await queryRunner.query(
        `
          INSERT INTO commercial_catalog_items
            (id, sku, description, type, daily_rate, item_price, unit, status, created_at, updated_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
          ON CONFLICT (sku) DO NOTHING
        `,
        row,
      );
    }

    if (!(await queryRunner.hasTable('commercial_invoices'))) {
      await queryRunner.createTable(
        new Table({
          name: 'commercial_invoices',
          columns: [
            { name: 'id', type: 'varchar', length: '64', isPrimary: true },
            { name: 'invoice_number', type: 'varchar', length: '80', isUnique: true },
            { name: 'commercial_work_order_id', type: 'varchar', length: '64' },
            { name: 'work_order_number', type: 'varchar', length: '80' },
            { name: 'customer_name', type: 'varchar', length: '255', default: "''" },
            { name: 'job_name', type: 'varchar', length: '255', default: "''" },
            { name: 'contact', type: 'varchar', length: '180', default: "''" },
            { name: 'email', type: 'varchar', length: '255', default: "''" },
            { name: 'billing_date', type: 'date' },
            { name: 'next_invoice_date', type: 'date' },
            { name: 'amount', type: 'numeric', precision: 12, scale: 2, default: 0 },
            { name: 'status', type: 'varchar', length: '32', default: "'generated'" },
            { name: 'items', type: 'jsonb', default: "'[]'::jsonb" },
            { name: 'created_by', type: 'varchar', length: '180', default: "''" },
            { name: 'pdf_html', type: 'text', default: "''" },
            { name: 'created_at', type: 'timestamp', default: 'now()' },
            { name: 'updated_at', type: 'timestamp', default: 'now()' },
          ],
        }),
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('commercial_invoices')) {
      await queryRunner.dropTable('commercial_invoices', true);
    }
    if (await queryRunner.hasTable('commercial_catalog_items')) {
      await queryRunner.dropTable('commercial_catalog_items', true);
    }
  }
}
