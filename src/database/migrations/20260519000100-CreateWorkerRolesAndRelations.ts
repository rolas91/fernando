import { MigrationInterface, QueryRunner } from 'typeorm';

const DEFAULT_WORKER_ROLES = [
  ['worker_role_flagger', 'Flagger'],
  ['worker_role_lead', 'Lead'],
  ['worker_role_striper', 'Striper'],
  ['worker_role_tma_driver', 'TMA Driver'],
  ['worker_role_freeway_cone_setter', 'Freeway Cone Setter'],
  ['worker_role_pole_depole', 'Pole/Depole'],
] as const;

export class CreateWorkerRolesAndRelations20260519000100
  implements MigrationInterface
{
  name = 'CreateWorkerRolesAndRelations20260519000100';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS worker_roles (
        id varchar(64) PRIMARY KEY,
        name varchar(180) NOT NULL,
        description text NOT NULL DEFAULT '',
        status varchar(24) NOT NULL DEFAULT 'active',
        created_at timestamp NOT NULL DEFAULT now(),
        updated_at timestamp NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS worker_worker_roles (
        worker_id varchar(64) NOT NULL,
        worker_role_id varchar(64) NOT NULL,
        PRIMARY KEY (worker_id, worker_role_id),
        CONSTRAINT fk_worker_worker_roles_worker
          FOREIGN KEY (worker_id) REFERENCES workers(id) ON DELETE CASCADE,
        CONSTRAINT fk_worker_worker_roles_role
          FOREIGN KEY (worker_role_id) REFERENCES worker_roles(id) ON DELETE CASCADE
      )
    `);

    for (const [id, name] of DEFAULT_WORKER_ROLES) {
      await queryRunner.query(
        `
          INSERT INTO worker_roles (id, name, description, status, created_at, updated_at)
          VALUES ($1, $2, '', 'active', now(), now())
          ON CONFLICT (id) DO UPDATE SET
            name = EXCLUDED.name,
            status = 'active',
            updated_at = now()
        `,
        [id, name],
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS worker_worker_roles`);
    await queryRunner.query(`DROP TABLE IF EXISTS worker_roles`);
  }
}
