import { MigrationInterface, QueryRunner } from 'typeorm';

export class AnimeDecksAndDuelOriginRANDOMANIME1763300000000 implements MigrationInterface {
  name = 'AnimeDecksAndDuelOriginRANDOMANIME1763300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    try {
      await queryRunner.query(`ALTER TYPE "duelorigin" ADD VALUE 'RANDOM_ANIME'`);
    } catch {
      // Ignore if value already exists (e.g. re-run migration)
    }
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "anime_decks" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "name" character varying NOT NULL,
        "description" text,
        "isActive" boolean NOT NULL DEFAULT true,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_anime_decks" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "anime_deck_cards" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "animeDeckId" uuid NOT NULL,
        "cardId" character varying NOT NULL,
        "quantity" integer NOT NULL DEFAULT 1,
        "isExtraDeck" boolean NOT NULL DEFAULT false,
        CONSTRAINT "PK_anime_deck_cards" PRIMARY KEY ("id"),
        CONSTRAINT "FK_anime_deck_cards_anime_deck" FOREIGN KEY ("animeDeckId") REFERENCES "anime_decks"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_anime_deck_cards_card" FOREIGN KEY ("cardId") REFERENCES "cards"("id")
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "anime_deck_cards"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "anime_decks"`);
    // PostgreSQL does not support removing enum values easily; leave duelorigin as is
  }
}
