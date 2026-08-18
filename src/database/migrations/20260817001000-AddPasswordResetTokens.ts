import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPasswordResetTokens20260817001000 implements MigrationInterface {
  name = 'AddPasswordResetTokens20260817001000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS password_reset_tokens (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id UUID NOT NULL,
        token_hash VARCHAR(64) NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        used_at TIMESTAMP NULL,
        created_at TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT FK_password_reset_tokens_user
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        CONSTRAINT UQ_password_reset_tokens_token_hash UNIQUE (token_hash)
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS IDX_password_reset_tokens_user_id
      ON password_reset_tokens (user_id)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS IDX_password_reset_tokens_expires_at
      ON password_reset_tokens (expires_at)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS password_reset_tokens');
  }
}
