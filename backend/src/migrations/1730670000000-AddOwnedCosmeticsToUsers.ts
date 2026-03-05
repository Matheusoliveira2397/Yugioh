import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddOwnedCosmeticsToUsers1730670000000 implements MigrationInterface {
  name = 'AddOwnedCosmeticsToUsers1730670000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "ownedSleeveIds" json DEFAULT '[]'
    `);
    await queryRunner.query(`
      ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "ownedPlaymatIds" json DEFAULT '[]'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "ownedSleeveIds"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "ownedPlaymatIds"`);
  }
}
