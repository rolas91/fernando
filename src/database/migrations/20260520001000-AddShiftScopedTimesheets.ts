import { MigrationInterface, QueryRunner, TableColumn, TableIndex } from 'typeorm';

export class AddShiftScopedTimesheets20260520001000 implements MigrationInterface {
  name = 'AddShiftScopedTimesheets20260520001000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const hasTable = await queryRunner.hasTable('timesheets');
    if (!hasTable) return;

    const addColumn = async (column: TableColumn) => {
      if (!(await queryRunner.hasColumn('timesheets', column.name))) {
        await queryRunner.addColumn('timesheets', column);
      }
    };

    await addColumn(
      new TableColumn({
        name: 'shift_id',
        type: 'varchar',
        length: '64',
        default: "''",
      }),
    );
    await addColumn(
      new TableColumn({
        name: 'lunch_taken',
        type: 'boolean',
        default: false,
      }),
    );
    await addColumn(
      new TableColumn({
        name: 'employee_note',
        type: 'text',
        default: "''",
      }),
    );
    await addColumn(
      new TableColumn({
        name: 'signature',
        type: 'text',
        default: "''",
      }),
    );

    const table = await queryRunner.getTable('timesheets');
    const hasUnique = table?.indices.some(
      (idx) => idx.name === 'IDX_timesheets_work_order_shift_worker_unique',
    );
    if (!hasUnique) {
      await queryRunner.createIndex(
        'timesheets',
        new TableIndex({
          name: 'IDX_timesheets_work_order_shift_worker_unique',
          columnNames: ['work_order_id', 'shift_id', 'worker_id'],
          isUnique: true,
          where: "work_order_id <> '' AND shift_id <> '' AND worker_id <> ''",
        }),
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const hasTable = await queryRunner.hasTable('timesheets');
    if (!hasTable) return;

    const table = await queryRunner.getTable('timesheets');
    const unique = table?.indices.find(
      (idx) => idx.name === 'IDX_timesheets_work_order_shift_worker_unique',
    );
    if (unique) {
      await queryRunner.dropIndex('timesheets', unique);
    }

    for (const columnName of ['signature', 'employee_note', 'lunch_taken', 'shift_id']) {
      if (await queryRunner.hasColumn('timesheets', columnName)) {
        await queryRunner.dropColumn('timesheets', columnName);
      }
    }
  }
}
