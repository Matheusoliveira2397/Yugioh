import { MigrationInterface, QueryRunner } from 'typeorm';

export class RemoveRatingFromUsers1762500000000 implements MigrationInterface {
  name = 'RemoveRatingFromUsers1762500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_users_rating"`);
    await queryRunner.query(`
      ALTER TABLE "users" DROP COLUMN IF EXISTS "rating"
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users" ADD COLUMN "rating" integer NOT NULL DEFAULT 1000
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_users_rating" ON "users"("rating" DESC)
    `);
  }
}
