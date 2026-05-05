import { MigrationInterface, QueryRunner } from 'typeorm';

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

export class CreateSkillsAndWorkerRelations20260504000200
  implements MigrationInterface
{
  name = 'CreateSkillsAndWorkerRelations20260504000200';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS skills (
        id varchar(64) PRIMARY KEY,
        name varchar(180) NOT NULL,
        description text NOT NULL DEFAULT '',
        status varchar(24) NOT NULL DEFAULT 'active',
        created_at timestamp NOT NULL DEFAULT now(),
        updated_at timestamp NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS worker_skills (
        worker_id varchar(64) NOT NULL,
        skill_id varchar(64) NOT NULL,
        PRIMARY KEY (worker_id, skill_id),
        CONSTRAINT fk_worker_skills_worker
          FOREIGN KEY (worker_id) REFERENCES workers(id) ON DELETE CASCADE,
        CONSTRAINT fk_worker_skills_skill
          FOREIGN KEY (skill_id) REFERENCES skills(id) ON DELETE CASCADE
      )
    `);

    const legacyColumnRows = (await queryRunner.query(`
      SELECT 1
      FROM information_schema.columns
      WHERE table_name = 'workers'
        AND column_name = 'skills'
      LIMIT 1
    `)) as Array<{ '?column?': number }>;

    if (legacyColumnRows.length > 0) {
      const rows = (await queryRunner.query(`
        SELECT id, skills
        FROM workers
        WHERE skills IS NOT NULL
      `)) as Array<{ id: string; skills: string[] | null }>;

      const knownSkillIds = new Map<string, string>();
      let generatedCounter = 0;

      for (const row of rows) {
        const legacySkills = Array.isArray(row.skills) ? row.skills : [];

        for (const rawSkill of legacySkills) {
          if (typeof rawSkill !== 'string') continue;
          const nameValue = normalizeName(rawSkill);
          if (!nameValue) continue;

          let skillId = knownSkillIds.get(nameValue.toLowerCase());
          if (!skillId) {
            generatedCounter += 1;
            skillId = `skill_${slugify(nameValue) || generatedCounter}`;
            knownSkillIds.set(nameValue.toLowerCase(), skillId);
          }

          await queryRunner.query(
            `
              INSERT INTO skills (id, name, description, status)
              VALUES ($1, $2, '', 'active')
              ON CONFLICT (id) DO UPDATE
              SET name = EXCLUDED.name,
                  updated_at = now()
            `,
            [skillId, nameValue],
          );

          await queryRunner.query(
            `
              INSERT INTO worker_skills (worker_id, skill_id)
              VALUES ($1, $2)
              ON CONFLICT DO NOTHING
            `,
            [row.id, skillId],
          );
        }
      }

      await queryRunner.query(`
        ALTER TABLE workers
        DROP COLUMN IF EXISTS skills
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE workers
      ADD COLUMN IF NOT EXISTS skills text[] NOT NULL DEFAULT '{}'
    `);

    await queryRunner.query(`
      UPDATE workers AS w
      SET skills = COALESCE(
        (
          SELECT array_agg(s.name ORDER BY s.name)
          FROM worker_skills ws
          JOIN skills s ON s.id = ws.skill_id
          WHERE ws.worker_id = w.id
        ),
        '{}'
      )
    `);

    await queryRunner.query(`
      DROP TABLE IF EXISTS worker_skills
    `);
    await queryRunner.query(`
      DROP TABLE IF EXISTS skills
    `);
  }
}
