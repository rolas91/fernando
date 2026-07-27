import { MigrationInterface, QueryRunner } from 'typeorm';

export class LinkWorkersToUsers20260727002000
  implements MigrationInterface
{
  name = 'LinkWorkersToUsers20260727002000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "workers"
      ADD COLUMN IF NOT EXISTS "user_id" uuid NULL
    `);
    await queryRunner.query(`
      UPDATE "workers"
      SET "email" = LOWER(BTRIM("email"))
      WHERE "email" IS NOT NULL
    `);
    await queryRunner.query(`
      WITH ranked_matches AS (
        SELECT
          w.id AS worker_id,
          u.id AS user_id,
          ROW_NUMBER() OVER (
            PARTITION BY u.id
            ORDER BY w.created_at ASC, w.id ASC
          ) AS match_rank
        FROM workers w
        INNER JOIN users u
          ON LOWER(BTRIM(w.email)) = LOWER(BTRIM(u.email))
        WHERE BTRIM(w.email) <> ''
          AND w.user_id IS NULL
      )
      UPDATE workers w
      SET user_id = ranked_matches.user_id
      FROM ranked_matches
      WHERE w.id = ranked_matches.worker_id
        AND ranked_matches.match_rank = 1
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "uq_workers_user_id"
      ON "workers" ("user_id")
      WHERE "user_id" IS NOT NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "workers"
      ADD CONSTRAINT "fk_workers_user_id"
      FOREIGN KEY ("user_id") REFERENCES "users"("id")
      ON DELETE SET NULL
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "workers"
      DROP CONSTRAINT IF EXISTS "fk_workers_user_id"
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS "uq_workers_user_id"
    `);
    await queryRunner.query(`
      ALTER TABLE "workers"
      DROP COLUMN IF EXISTS "user_id"
    `);
  }
}
