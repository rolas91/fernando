import { MigrationInterface, QueryRunner, Table, TableColumn } from 'typeorm';

const MATERIAL_STATUSES = [
  {
    id: 'mat_available',
    scope: 'material',
    value: 'available',
    name: 'Available',
    color: '#22C55E',
    sortOrder: 10,
    blocksEditing: false,
    triggersNotification: false,
    requiresApproval: false,
    status: 'active',
  },
  {
    id: 'mat_assigned',
    scope: 'material',
    value: 'assigned',
    name: 'Assigned',
    color: '#F59E0B',
    sortOrder: 20,
    blocksEditing: false,
    triggersNotification: true,
    requiresApproval: false,
    status: 'active',
  },
  {
    id: 'mat_maintenance',
    scope: 'material',
    value: 'maintenance',
    name: 'Maintenance',
    color: '#EF4444',
    sortOrder: 30,
    blocksEditing: false,
    triggersNotification: true,
    requiresApproval: true,
    status: 'active',
  },
  {
    id: 'mat_retired',
    scope: 'material',
    value: 'retired',
    name: 'Retired',
    color: '#6B7280',
    sortOrder: 40,
    blocksEditing: true,
    triggersNotification: false,
    requiresApproval: false,
    status: 'active',
  },
];

export class AddMaterialsModule20260505000100 implements MigrationInterface {
  name = 'AddMaterialsModule20260505000100';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const hasMaterials = await queryRunner.hasTable('materials');
    if (!hasMaterials) {
      await queryRunner.createTable(
        new Table({
          name: 'materials',
          columns: [
            { name: 'id', type: 'varchar', length: '64', isPrimary: true },
            { name: 'name', type: 'varchar', length: '180', isNullable: false },
            { name: 'type', type: 'varchar', length: '120', isNullable: false },
            {
              name: 'identifier',
              type: 'varchar',
              length: '120',
              isNullable: false,
              default: "''",
            },
            {
              name: 'brand',
              type: 'varchar',
              length: '120',
              isNullable: false,
              default: "''",
            },
            {
              name: 'status',
              type: 'varchar',
              length: '32',
              isNullable: false,
            },
            { name: 'last_maintenance', type: 'date', isNullable: true },
            { name: 'next_maintenance', type: 'date', isNullable: true },
            { name: 'notes', type: 'text', isNullable: false, default: "''" },
            {
              name: 'created_at',
              type: 'timestamp',
              isNullable: false,
              default: 'now()',
            },
            {
              name: 'updated_at',
              type: 'timestamp',
              isNullable: false,
              default: 'now()',
            },
          ],
        }),
      );
    }

    const hasCompanySettings = await queryRunner.hasTable('company_settings');
    if (hasCompanySettings) {
      const hasColumn = await queryRunner.hasColumn('company_settings', 'material_types');
      if (!hasColumn) {
        await queryRunner.addColumn(
          'company_settings',
          new TableColumn({
            name: 'material_types',
            type: 'text',
            isArray: true,
            isNullable: false,
            default: "'{}'",
          }),
        );
      }

      await queryRunner.query(`
        UPDATE company_settings
        SET material_types = ARRAY(
          SELECT DISTINCT item
          FROM unnest(COALESCE(material_types, '{}') || ARRAY['Sign', 'Cone', 'Barricade', 'Drum']) AS item
          ORDER BY item
        )
      `);
    }

    const hasStatusCatalog = await queryRunner.hasTable('status_catalog');
    if (hasStatusCatalog) {
      for (const item of MATERIAL_STATUSES) {
        await queryRunner.query(
          `
            INSERT INTO status_catalog (
              id,
              scope,
              value,
              name,
              color,
              sort_order,
              blocks_editing,
              triggers_notification,
              requires_approval,
              status,
              created_at,
              updated_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())
            ON CONFLICT (id) DO UPDATE SET
              scope = EXCLUDED.scope,
              value = EXCLUDED.value,
              name = EXCLUDED.name,
              color = EXCLUDED.color,
              sort_order = EXCLUDED.sort_order,
              blocks_editing = EXCLUDED.blocks_editing,
              triggers_notification = EXCLUDED.triggers_notification,
              requires_approval = EXCLUDED.requires_approval,
              status = EXCLUDED.status,
              updated_at = NOW()
          `,
          [
            item.id,
            item.scope,
            item.value,
            item.name,
            item.color,
            item.sortOrder,
            item.blocksEditing,
            item.triggersNotification,
            item.requiresApproval,
            item.status,
          ],
        );
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const hasStatusCatalog = await queryRunner.hasTable('status_catalog');
    if (hasStatusCatalog) {
      await queryRunner.query(`
        DELETE FROM status_catalog
        WHERE scope = 'material'
      `);
    }

    const hasCompanySettings = await queryRunner.hasTable('company_settings');
    if (hasCompanySettings) {
      const hasColumn = await queryRunner.hasColumn('company_settings', 'material_types');
      if (hasColumn) {
        await queryRunner.dropColumn('company_settings', 'material_types');
      }
    }

    const hasMaterials = await queryRunner.hasTable('materials');
    if (hasMaterials) {
      await queryRunner.dropTable('materials', true);
    }
  }
}
