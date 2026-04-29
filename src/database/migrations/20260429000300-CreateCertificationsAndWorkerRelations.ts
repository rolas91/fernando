import { MigrationInterface, QueryRunner } from 'typeorm';

type LegacyCertification = {
  id?: unknown;
  name?: unknown;
  description?: unknown;
  status?: unknown;
};

function normalizeName(raw: string) {
  return raw.trim().replace(/\s+/g, ' ');
}

function slugify(raw: string) {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48);
}

export class CreateCertificationsAndWorkerRelations20260429000300
  implements MigrationInterface
{
  name = 'CreateCertificationsAndWorkerRelations20260429000300';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS certifications (
        id varchar(64) PRIMARY KEY,
        name varchar(180) NOT NULL,
        description text NOT NULL DEFAULT '',
        status varchar(24) NOT NULL DEFAULT 'active',
        created_at timestamp NOT NULL DEFAULT now(),
        updated_at timestamp NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS worker_certifications (
        worker_id varchar(64) NOT NULL,
        certification_id varchar(64) NOT NULL,
        PRIMARY KEY (worker_id, certification_id),
        CONSTRAINT fk_worker_certifications_worker
          FOREIGN KEY (worker_id) REFERENCES workers(id) ON DELETE CASCADE,
        CONSTRAINT fk_worker_certifications_certification
          FOREIGN KEY (certification_id) REFERENCES certifications(id) ON DELETE CASCADE
      )
    `);

    const legacyColumnRows = (await queryRunner.query(`
      SELECT 1
      FROM information_schema.columns
      WHERE table_name = 'workers'
        AND column_name = 'certifications'
      LIMIT 1
    `)) as Array<{ '?column?': number }>;

    if (legacyColumnRows.length > 0) {
      const rows = (await queryRunner.query(`
        SELECT id, certifications
        FROM workers
        WHERE certifications IS NOT NULL
      `)) as Array<{ id: string; certifications: LegacyCertification[] | null }>;

      const knownCertificationIds = new Map<string, string>();
      let generatedCounter = 0;

      for (const row of rows) {
        const legacyCertifications = Array.isArray(row.certifications)
          ? row.certifications
          : [];

        for (const legacy of legacyCertifications) {
          const nameValue =
            typeof legacy?.name === 'string' ? normalizeName(legacy.name) : '';
          if (!nameValue) continue;

          const preferredId =
            typeof legacy?.id === 'string' && legacy.id.trim().length > 0
              ? legacy.id.trim().slice(0, 64)
              : '';
          const lookupKey = preferredId || nameValue.toLowerCase();

          let certificationId = knownCertificationIds.get(lookupKey);
          if (!certificationId) {
            generatedCounter += 1;
            const generatedSuffix = slugify(nameValue) || `item_${generatedCounter}`;
            certificationId = preferredId || `cert_${generatedSuffix}`;
            knownCertificationIds.set(lookupKey, certificationId);
          }

          const description =
            typeof legacy?.description === 'string'
              ? legacy.description.trim()
              : '';
          const status =
            typeof legacy?.status === 'string' &&
            legacy.status.trim().toLowerCase() === 'inactive'
              ? 'inactive'
              : 'active';

          await queryRunner.query(
            `
              INSERT INTO certifications (id, name, description, status)
              VALUES ($1, $2, $3, $4)
              ON CONFLICT (id) DO UPDATE
              SET name = EXCLUDED.name,
                  description = EXCLUDED.description,
                  status = EXCLUDED.status,
                  updated_at = now()
            `,
            [certificationId, nameValue, description, status],
          );

          await queryRunner.query(
            `
              INSERT INTO worker_certifications (worker_id, certification_id)
              VALUES ($1, $2)
              ON CONFLICT DO NOTHING
            `,
            [row.id, certificationId],
          );
        }
      }

      await queryRunner.query(`
        ALTER TABLE workers
        DROP COLUMN IF EXISTS certifications
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE workers
      ADD COLUMN IF NOT EXISTS certifications jsonb NOT NULL DEFAULT '[]'::jsonb
    `);

    await queryRunner.query(`
      UPDATE workers AS w
      SET certifications = COALESCE(
        (
          SELECT jsonb_agg(
            jsonb_build_object(
              'id', c.id,
              'name', c.name,
              'description', c.description,
              'status', c.status
            )
            ORDER BY c.name
          )
          FROM worker_certifications wc
          JOIN certifications c ON c.id = wc.certification_id
          WHERE wc.worker_id = w.id
        ),
        '[]'::jsonb
      )
    `);

    await queryRunner.query(`
      DROP TABLE IF EXISTS worker_certifications
    `);
    await queryRunner.query(`
      DROP TABLE IF EXISTS certifications
    `);
  }
}
