import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddWorkerExpirationDate20260504000100
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    const hasWorkerCertifications = await queryRunner.hasTable(
      'worker_certifications',
    );

    if (hasWorkerCertifications) {
      const hasRelationColumn = await queryRunner.hasColumn(
        'worker_certifications',
        'expiration_date',
      );
      if (!hasRelationColumn) {
        await queryRunner.addColumn(
          'worker_certifications',
          new TableColumn({
            name: 'expiration_date',
            type: 'date',
            isNullable: true,
          }),
        );
      }
    }

    const hasWorkers = await queryRunner.hasTable('workers');
    if (!hasWorkers) return;

    const hasWorkerColumn = await queryRunner.hasColumn('workers', 'expiration_date');
    if (!hasWorkerColumn) return;

    if (hasWorkerCertifications) {
      await queryRunner.query(`
        UPDATE worker_certifications AS wc
        SET expiration_date = w.expiration_date
        FROM workers AS w
        WHERE w.id = wc.worker_id
          AND w.expiration_date IS NOT NULL
          AND wc.expiration_date IS NULL
      `);
    }

    await queryRunner.dropColumn('workers', 'expiration_date');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const hasWorkers = await queryRunner.hasTable('workers');
    if (hasWorkers) {
      const hasWorkerColumn = await queryRunner.hasColumn(
        'workers',
        'expiration_date',
      );
      if (!hasWorkerColumn) {
        await queryRunner.addColumn(
          'workers',
          new TableColumn({
            name: 'expiration_date',
            type: 'date',
            isNullable: true,
          }),
        );
      }
    }

    const hasWorkerCertifications = await queryRunner.hasTable(
      'worker_certifications',
    );
    if (!hasWorkerCertifications) return;

    const hasRelationColumn = await queryRunner.hasColumn(
      'worker_certifications',
      'expiration_date',
    );
    if (!hasRelationColumn) return;

    await queryRunner.dropColumn('worker_certifications', 'expiration_date');
  }
}
