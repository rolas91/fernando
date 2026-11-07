import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddShiftCancellationConfirmations20261021001000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE "shift_cancellation_confirmations" (
      "work_order_id" varchar(64) NOT NULL,
      "shift_id" varchar(64) NOT NULL,
      "worker_id" varchar(64) NOT NULL,
      "notification_id" varchar(64) NOT NULL,
      "acknowledged_at" timestamp NULL,
      PRIMARY KEY ("work_order_id", "shift_id", "worker_id")
    )`);
    await queryRunner.query(
      `ALTER TABLE "notifications" ADD COLUMN "acknowledged_at" timestamp NULL`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "notifications" DROP COLUMN "acknowledged_at"`,
    );
    await queryRunner.query(`DROP TABLE "shift_cancellation_confirmations"`);
  }
}
