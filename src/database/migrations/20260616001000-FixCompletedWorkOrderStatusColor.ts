import { MigrationInterface, QueryRunner } from 'typeorm';

export class FixCompletedWorkOrderStatusColor20260616001000
  implements MigrationInterface
{
  name = 'FixCompletedWorkOrderStatusColor20260616001000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `
        UPDATE status_catalog
        SET color = '#6B7280',
            updated_at = NOW()
        WHERE scope = 'work_order'
          AND value = 'completed'
      `,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `
        UPDATE status_catalog
        SET color = '#22C55E',
            updated_at = NOW()
        WHERE scope = 'work_order'
          AND value = 'completed'
      `,
    );
  }
}
