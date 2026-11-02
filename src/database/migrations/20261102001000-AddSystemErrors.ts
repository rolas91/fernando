import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSystemErrors20261102001000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE "system_errors" (
      "id" uuid PRIMARY KEY, "fingerprint" varchar NOT NULL UNIQUE,
      "source" varchar NOT NULL, "level" varchar NOT NULL,
      "message" text NOT NULL, "stack" text NOT NULL, "context" varchar NOT NULL,
      "path" varchar NOT NULL, "method" varchar NOT NULL, "statusCode" integer,
      "userId" varchar NOT NULL, "requestId" varchar NOT NULL,
      "status" varchar NOT NULL DEFAULT 'pending', "occurrences" integer NOT NULL DEFAULT 1,
      "firstSeen" timestamptz NOT NULL, "lastSeen" timestamptz NOT NULL,
      "resolvedAt" timestamptz, "resolvedBy" varchar NOT NULL DEFAULT ''
    )`);
    await queryRunner.query(
      'CREATE INDEX "system_errors_last_seen" ON "system_errors" ("lastSeen")',
    );
  }
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE "system_errors"');
  }
}
