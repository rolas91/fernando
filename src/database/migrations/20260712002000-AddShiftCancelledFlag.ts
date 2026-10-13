import { MigrationInterface, QueryRunner } from 'typeorm';

   
                                                                      
                                                                       
                                                             
   
export class AddShiftCancelledFlag20260712002000 implements MigrationInterface {
  name = 'AddShiftCancelledFlag20260712002000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE work_order_shifts
        ADD COLUMN IF NOT EXISTS cancelled BOOLEAN NOT NULL DEFAULT FALSE
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE work_order_shifts
        DROP COLUMN IF EXISTS cancelled
    `);
  }
}
