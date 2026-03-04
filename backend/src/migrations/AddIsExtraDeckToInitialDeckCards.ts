import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddIsExtraDeckToInitialDeckCards1730500000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "initial_deck_cards"
      ADD COLUMN IF NOT EXISTS "isExtraDeck" BOOLEAN NOT NULL DEFAULT false
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "initial_deck_cards" DROP COLUMN IF EXISTS "isExtraDeck"
    `);
  }
}
