import { MigrationInterface, QueryRunner, Table } from 'typeorm';

export class CreateOperationsTables20260407000200
  implements MigrationInterface
{
  name = 'CreateOperationsTables20260407000200';

  private async createIfMissing(queryRunner: QueryRunner, table: Table) {
    const exists = await queryRunner.hasTable(table.name);
    if (exists) return;
    await queryRunner.createTable(table, true);
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    await this.createIfMissing(
      queryRunner,
      new Table({
        name: 'company_settings',
        columns: [
          { name: 'id', type: 'varchar', length: '64', isPrimary: true },
          { name: 'name', type: 'varchar', length: '255', isNullable: false },
          { name: 'address', type: 'text', isNullable: false, default: "''" },
          {
            name: 'phone',
            type: 'varchar',
            length: '64',
            isNullable: false,
            default: "''",
          },
          {
            name: 'email',
            type: 'varchar',
            length: '255',
            isNullable: false,
            default: "''",
          },
          { name: 'logo', type: 'text', isNullable: true },
          { name: 'overtime_rules', type: 'jsonb', isNullable: true },
          {
            name: 'worker_types',
            type: 'text',
            isArray: true,
            isNullable: false,
            default: "'{}'",
          },
          {
            name: 'equipment_types',
            type: 'text',
            isArray: true,
            isNullable: false,
            default: "'{}'",
          },
          {
            name: 'job_statuses',
            type: 'text',
            isArray: true,
            isNullable: false,
            default: "'{}'",
          },
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

    await this.createIfMissing(
      queryRunner,
      new Table({
        name: 'status_catalog',
        columns: [
          { name: 'id', type: 'varchar', length: '64', isPrimary: true },
          {
            name: 'scope',
            type: 'varchar',
            length: '32',
            isNullable: false,
          },
          {
            name: 'value',
            type: 'varchar',
            length: '64',
            isNullable: false,
          },
          {
            name: 'name',
            type: 'varchar',
            length: '180',
            isNullable: false,
          },
          {
            name: 'color',
            type: 'varchar',
            length: '16',
            isNullable: false,
            default: "'#94A3B8'",
          },
          {
            name: 'sort_order',
            type: 'int',
            isNullable: false,
            default: '0',
          },
          {
            name: 'blocks_editing',
            type: 'boolean',
            isNullable: false,
            default: 'false',
          },
          {
            name: 'triggers_notification',
            type: 'boolean',
            isNullable: false,
            default: 'false',
          },
          {
            name: 'requires_approval',
            type: 'boolean',
            isNullable: false,
            default: 'false',
          },
          {
            name: 'status',
            type: 'varchar',
            length: '24',
            isNullable: false,
            default: "'active'",
          },
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

    await this.createIfMissing(
      queryRunner,
      new Table({
        name: 'clients',
        columns: [
          { name: 'id', type: 'varchar', length: '64', isPrimary: true },
          { name: 'name', type: 'varchar', length: '255', isNullable: false },
          {
            name: 'contact_name',
            type: 'varchar',
            length: '180',
            isNullable: false,
            default: "''",
          },
          {
            name: 'email',
            type: 'varchar',
            length: '255',
            isNullable: false,
            default: "''",
          },
          {
            name: 'phone',
            type: 'varchar',
            length: '64',
            isNullable: false,
            default: "''",
          },
          {
            name: 'website',
            type: 'varchar',
            length: '255',
            isNullable: false,
            default: "''",
          },
          { name: 'address', type: 'text', isNullable: false, default: "''" },
          {
            name: 'status',
            type: 'varchar',
            length: '32',
            isNullable: false,
          },
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

    await this.createIfMissing(
      queryRunner,
      new Table({
        name: 'projects',
        columns: [
          { name: 'id', type: 'varchar', length: '64', isPrimary: true },
          {
            name: 'number',
            type: 'varchar',
            length: '80',
            isNullable: false,
            default: "''",
          },
          { name: 'name', type: 'varchar', length: '255', isNullable: false },
          {
            name: 'client_id',
            type: 'varchar',
            length: '64',
            isNullable: false,
            default: "''",
          },
          { name: 'location', type: 'text', isNullable: false, default: "''" },
          {
            name: 'city',
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
          { name: 'start_date', type: 'date', isNullable: true },
          { name: 'end_date', type: 'date', isNullable: true },
          {
            name: 'work_order_number',
            type: 'varchar',
            length: '120',
            isNullable: true,
          },
          {
            name: 'purchase_order',
            type: 'varchar',
            length: '120',
            isNullable: true,
          },
          {
            name: 'description',
            type: 'text',
            isNullable: false,
            default: "''",
          },
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

    await this.createIfMissing(
      queryRunner,
      new Table({
        name: 'work_order_types',
        columns: [
          { name: 'id', type: 'varchar', length: '64', isPrimary: true },
          { name: 'name', type: 'varchar', length: '180', isNullable: false },
          {
            name: 'description',
            type: 'text',
            isNullable: false,
            default: "''",
          },
          {
            name: 'status',
            type: 'varchar',
            length: '24',
            isNullable: false,
            default: "'active'",
          },
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

    await this.createIfMissing(
      queryRunner,
      new Table({
        name: 'workers',
        columns: [
          { name: 'id', type: 'varchar', length: '64', isPrimary: true },
          {
            name: 'first_name',
            type: 'varchar',
            length: '120',
            isNullable: false,
          },
          {
            name: 'last_name',
            type: 'varchar',
            length: '120',
            isNullable: false,
          },
          {
            name: 'email',
            type: 'varchar',
            length: '255',
            isNullable: false,
            default: "''",
          },
          {
            name: 'phone',
            type: 'varchar',
            length: '64',
            isNullable: false,
            default: "''",
          },
          {
            name: 'driver_license',
            type: 'varchar',
            length: '120',
            isNullable: false,
            default: "''",
          },
          {
            name: 'primary_address',
            type: 'text',
            isNullable: false,
            default: "''",
          },
          {
            name: 'city',
            type: 'varchar',
            length: '120',
            isNullable: false,
            default: "''",
          },
          {
            name: 'zip_code',
            type: 'varchar',
            length: '32',
            isNullable: false,
            default: "''",
          },
          {
            name: 'state',
            type: 'varchar',
            length: '64',
            isNullable: false,
            default: "''",
          },
          {
            name: 'type',
            type: 'varchar',
            length: '100',
            isNullable: false,
          },
          {
            name: 'role',
            type: 'varchar',
            length: '100',
            isNullable: false,
          },
          {
            name: 'status',
            type: 'varchar',
            length: '32',
            isNullable: false,
          },
          {
            name: 'skills',
            type: 'text',
            isArray: true,
            isNullable: false,
            default: "'{}'",
          },
          {
            name: 'file_uploads',
            type: 'text',
            isArray: true,
            isNullable: false,
            default: "'{}'",
          },
          { name: 'hire_date', type: 'date', isNullable: true },
          {
            name: 'hourly_rate',
            type: 'numeric',
            precision: 10,
            scale: 2,
            isNullable: false,
            default: '0',
          },
          { name: 'avatar', type: 'text', isNullable: true },
          { name: 'emergency_contact', type: 'text', isNullable: true },
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

    await this.createIfMissing(
      queryRunner,
      new Table({
        name: 'equipment',
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

    await this.createIfMissing(
      queryRunner,
      new Table({
        name: 'shifts',
        columns: [
          { name: 'id', type: 'varchar', length: '64', isPrimary: true },
          { name: 'name', type: 'varchar', length: '180', isNullable: false },
          {
            name: 'type',
            type: 'varchar',
            length: '40',
            isNullable: false,
            default: "'standard'",
          },
          {
            name: 'start_time',
            type: 'varchar',
            length: '5',
            isNullable: true,
          },
          {
            name: 'end_time',
            type: 'varchar',
            length: '5',
            isNullable: true,
          },
          {
            name: 'duration_hours',
            type: 'double precision',
            isNullable: true,
          },
          {
            name: 'status',
            type: 'varchar',
            length: '24',
            isNullable: false,
            default: "'active'",
          },
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

    await this.createIfMissing(
      queryRunner,
      new Table({
        name: 'work_orders',
        columns: [
          { name: 'id', type: 'varchar', length: '64', isPrimary: true },
          {
            name: 'project_id',
            type: 'varchar',
            length: '64',
            isNullable: false,
            default: "''",
          },
          {
            name: 'work_order_type_id',
            type: 'varchar',
            length: '64',
            isNullable: true,
          },
          { name: 'title', type: 'varchar', length: '255', isNullable: false },
          {
            name: 'order_number',
            type: 'varchar',
            length: '120',
            isNullable: true,
          },
          {
            name: 'status',
            type: 'varchar',
            length: '32',
            isNullable: false,
          },
          { name: 'start_date', type: 'date', isNullable: true },
          { name: 'end_date', type: 'date', isNullable: true },
          {
            name: 'shifts',
            type: 'jsonb',
            isNullable: false,
            default: "'[]'::jsonb",
          },
          { name: 'notes', type: 'text', isNullable: false, default: "''" },
          {
            name: 'dispatch_note',
            type: 'text',
            isNullable: false,
            default: "''",
          },
          {
            name: 'file_uploads',
            type: 'text',
            isArray: true,
            isNullable: false,
            default: "'{}'",
          },
          {
            name: 'attachments',
            type: 'text',
            isArray: true,
            isNullable: false,
            default: "'{}'",
          },
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

    await this.createIfMissing(
      queryRunner,
      new Table({
        name: 'timesheets',
        columns: [
          { name: 'id', type: 'varchar', length: '64', isPrimary: true },
          {
            name: 'worker_id',
            type: 'varchar',
            length: '64',
            isNullable: false,
            default: "''",
          },
          {
            name: 'project_id',
            type: 'varchar',
            length: '64',
            isNullable: false,
            default: "''",
          },
          {
            name: 'work_order_id',
            type: 'varchar',
            length: '64',
            isNullable: false,
            default: "''",
          },
          { name: 'date', type: 'date', isNullable: false },
          {
            name: 'clock_in',
            type: 'varchar',
            length: '16',
            isNullable: false,
            default: "''",
          },
          {
            name: 'clock_out',
            type: 'varchar',
            length: '16',
            isNullable: false,
            default: "''",
          },
          {
            name: 'break_minutes',
            type: 'int',
            isNullable: false,
            default: '0',
          },
          {
            name: 'regular_hours',
            type: 'numeric',
            precision: 8,
            scale: 2,
            isNullable: false,
            default: '0',
          },
          {
            name: 'overtime_hours',
            type: 'numeric',
            precision: 8,
            scale: 2,
            isNullable: false,
            default: '0',
          },
          {
            name: 'double_time_hours',
            type: 'numeric',
            precision: 8,
            scale: 2,
            isNullable: false,
            default: '0',
          },
          {
            name: 'status',
            type: 'varchar',
            length: '32',
            isNullable: false,
          },
          {
            name: 'approved_by',
            type: 'varchar',
            length: '180',
            isNullable: false,
            default: "''",
          },
          {
            name: 'rejected_reason',
            type: 'text',
            isNullable: false,
            default: "''",
          },
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

    await this.createIfMissing(
      queryRunner,
      new Table({
        name: 'form_templates',
        columns: [
          { name: 'id', type: 'varchar', length: '64', isPrimary: true },
          { name: 'name', type: 'varchar', length: '255', isNullable: false },
          {
            name: 'description',
            type: 'text',
            isNullable: false,
            default: "''",
          },
          {
            name: 'category',
            type: 'varchar',
            length: '120',
            isNullable: false,
            default: "'Safety'",
          },
          {
            name: 'fields',
            type: 'jsonb',
            isNullable: false,
            default: "'[]'::jsonb",
          },
          {
            name: 'assigned_projects',
            type: 'text',
            isArray: true,
            isNullable: false,
            default: "'{}'",
          },
          {
            name: 'assigned_roles',
            type: 'text',
            isArray: true,
            isNullable: false,
            default: "'{}'",
          },
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

    await this.createIfMissing(
      queryRunner,
      new Table({
        name: 'form_submissions',
        columns: [
          { name: 'id', type: 'varchar', length: '64', isPrimary: true },
          {
            name: 'template_id',
            type: 'varchar',
            length: '64',
            isNullable: false,
            default: "''",
          },
          {
            name: 'project_id',
            type: 'varchar',
            length: '64',
            isNullable: false,
            default: "''",
          },
          {
            name: 'worker_id',
            type: 'varchar',
            length: '64',
            isNullable: false,
            default: "''",
          },
          { name: 'submitted_at', type: 'timestamp', isNullable: true },
          {
            name: 'data',
            type: 'jsonb',
            isNullable: false,
            default: "'{}'::jsonb",
          },
          {
            name: 'status',
            type: 'varchar',
            length: '32',
            isNullable: false,
          },
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

    await this.createIfMissing(
      queryRunner,
      new Table({
        name: 'incidents',
        columns: [
          { name: 'id', type: 'varchar', length: '64', isPrimary: true },
          {
            name: 'project_id',
            type: 'varchar',
            length: '64',
            isNullable: false,
            default: "''",
          },
          {
            name: 'reported_by',
            type: 'varchar',
            length: '180',
            isNullable: false,
            default: "''",
          },
          { name: 'date', type: 'date', isNullable: false },
          {
            name: 'severity',
            type: 'varchar',
            length: '32',
            isNullable: false,
          },
          {
            name: 'status',
            type: 'varchar',
            length: '32',
            isNullable: false,
          },
          { name: 'title', type: 'varchar', length: '255', isNullable: false },
          {
            name: 'description',
            type: 'text',
            isNullable: false,
            default: "''",
          },
          {
            name: 'location',
            type: 'text',
            isNullable: false,
            default: "''",
          },
          {
            name: 'photos',
            type: 'text',
            isArray: true,
            isNullable: false,
            default: "'{}'",
          },
          { name: 'actions', type: 'text', isNullable: false, default: "''" },
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

    await this.createIfMissing(
      queryRunner,
      new Table({
        name: 'notifications',
        columns: [
          { name: 'id', type: 'varchar', length: '64', isPrimary: true },
          { name: 'type', type: 'varchar', length: '32', isNullable: false },
          { name: 'title', type: 'varchar', length: '255', isNullable: false },
          {
            name: 'message',
            type: 'text',
            isNullable: false,
            default: "''",
          },
          { name: 'timestamp', type: 'timestamp', isNullable: true },
          {
            name: 'read',
            type: 'boolean',
            isNullable: false,
            default: 'false',
          },
          { name: 'link', type: 'varchar', length: '64', isNullable: true },
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

    await this.createIfMissing(
      queryRunner,
      new Table({
        name: 'activity_feed',
        columns: [
          { name: 'id', type: 'varchar', length: '64', isPrimary: true },
          { name: 'type', type: 'varchar', length: '64', isNullable: false },
          { name: 'title', type: 'varchar', length: '255', isNullable: false },
          {
            name: 'subtitle',
            type: 'text',
            isNullable: false,
            default: "''",
          },
          {
            name: 'user',
            type: 'varchar',
            length: '180',
            isNullable: false,
            default: "''",
          },
          { name: 'timestamp', type: 'timestamp', isNullable: true },
          {
            name: 'tags',
            type: 'jsonb',
            isNullable: false,
            default: "'[]'::jsonb",
          },
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

    await this.createIfMissing(
      queryRunner,
      new Table({
        name: 'availability_requests',
        columns: [
          { name: 'id', type: 'varchar', length: '64', isPrimary: true },
          {
            name: 'worker_id',
            type: 'varchar',
            length: '64',
            isNullable: false,
          },
          { name: 'date', type: 'date', isNullable: false },
          { name: 'end_date', type: 'date', isNullable: true },
          { name: 'type', type: 'varchar', length: '32', isNullable: false },
          {
            name: 'status',
            type: 'varchar',
            length: '32',
            isNullable: false,
            default: "'pending'",
          },
          { name: 'reason', type: 'text', isNullable: false, default: "''" },
          {
            name: 'start_time',
            type: 'varchar',
            length: '16',
            isNullable: false,
            default: "'00:00'",
          },
          {
            name: 'end_time',
            type: 'varchar',
            length: '16',
            isNullable: false,
            default: "'23:59'",
          },
          {
            name: 'reviewed_by',
            type: 'varchar',
            length: '64',
            isNullable: true,
          },
          { name: 'reviewed_at', type: 'timestamp', isNullable: true },
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

  public async down(queryRunner: QueryRunner): Promise<void> {
    const tables = [
      'availability_requests',
      'activity_feed',
      'notifications',
      'incidents',
      'form_submissions',
      'form_templates',
      'timesheets',
      'work_orders',
      'shifts',
      'equipment',
      'workers',
      'work_order_types',
      'projects',
      'clients',
      'status_catalog',
      'company_settings',
    ];

    for (const tableName of tables) {
      const exists = await queryRunner.hasTable(tableName);
      if (exists) {
        await queryRunner.dropTable(tableName, true);
      }
    }
  }
}
