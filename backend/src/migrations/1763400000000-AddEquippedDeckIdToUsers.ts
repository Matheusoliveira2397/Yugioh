import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddEquippedDeckIdToUsers1763400000000 implements MigrationInterface {
  name = 'AddEquippedDeckIdToUsers1763400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users"
      ADD COLUMN IF NOT EXISTS "equipped_deck_id" uuid NULL
    `);
    // Preencher equipped_deck_id para quem já tem equipped_deck_name (pega o primeiro deck do usuário com esse nome)
    await queryRunner.query(`
      UPDATE "users" u
      SET "equipped_deck_id" = (
        SELECT d.id FROM "decks" d
        WHERE d."userId" = u.id AND d.name = u."equippedDeckName"
        LIMIT 1
      )
      WHERE u."equippedDeckName" IS NOT NULL AND u."equippedDeckName" <> ''
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "equipped_deck_id"`);
  }
}
