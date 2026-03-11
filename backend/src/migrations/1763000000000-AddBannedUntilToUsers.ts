import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddBannedUntilToUsers1763000000000 implements MigrationInterface {
  name = 'AddBannedUntilToUsers1763000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users"
      ADD COLUMN IF NOT EXISTS "bannedUntil" TIMESTAMP NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users" DROP COLUMN IF EXISTS "bannedUntil"
    `);
  }
}
