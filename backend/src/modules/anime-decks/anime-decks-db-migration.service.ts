import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';

@Injectable()
export class AnimeDecksDbMigrationService implements OnModuleInit {
  private readonly logger = new Logger(AnimeDecksDbMigrationService.name);

  constructor(private dataSource: DataSource) {}

  async onModuleInit() {
    await new Promise(resolve => setTimeout(resolve, 500));
    try {
      await this.ensureTablesExist();
    } catch (error: any) {
      this.logger.error('Erro ao criar tabelas anime_decks:', error?.message || error);
    }
  }

  private async ensureTablesExist(): Promise<void> {
    const queryRunner = this.dataSource.createQueryRunner();
    try {
      await queryRunner.connect();

      const animeDecksExists = await queryRunner.query(`
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'anime_decks'
      `);

      if (animeDecksExists.length === 0) {
        this.logger.log('🔧 Criando tabelas anime_decks e anime_deck_cards...');

        await queryRunner.query(`
          CREATE TABLE IF NOT EXISTS "anime_decks" (
            "id" uuid NOT NULL DEFAULT gen_random_uuid(),
            "name" character varying NOT NULL,
            "description" text,
            "isActive" boolean NOT NULL DEFAULT true,
            "coverCardId" uuid NULL,
            "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
            "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
            CONSTRAINT "PK_anime_decks" PRIMARY KEY ("id"),
            CONSTRAINT "FK_anime_decks_cover_card" FOREIGN KEY ("coverCardId") REFERENCES "cards"("id") ON DELETE SET NULL
          )
        `);

        await queryRunner.query(`
          CREATE TABLE IF NOT EXISTS "anime_deck_cards" (
            "id" uuid NOT NULL DEFAULT gen_random_uuid(),
            "animeDeckId" uuid NOT NULL,
            "cardId" uuid NOT NULL,
            "quantity" integer NOT NULL DEFAULT 1,
            "isExtraDeck" boolean NOT NULL DEFAULT false,
            CONSTRAINT "PK_anime_deck_cards" PRIMARY KEY ("id"),
            CONSTRAINT "FK_anime_deck_cards_anime_deck" FOREIGN KEY ("animeDeckId") REFERENCES "anime_decks"("id") ON DELETE CASCADE,
            CONSTRAINT "FK_anime_deck_cards_card" FOREIGN KEY ("cardId") REFERENCES "cards"("id")
          )
        `);

        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_anime_decks_isActive" ON "anime_decks"("isActive")`);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_anime_deck_cards_animeDeckId" ON "anime_deck_cards"("animeDeckId")`);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_anime_deck_cards_cardId" ON "anime_deck_cards"("cardId")`);

        this.logger.log('✅ Tabelas anime_decks e anime_deck_cards criadas.');
      }

      // Garantir que a coluna coverCardId existe (para tabelas criadas antes)
      const hasCover = await queryRunner.query(`
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'anime_decks' AND column_name = 'coverCardId'
      `);
      if (hasCover.length === 0) {
        this.logger.log('🔧 Adicionando coluna coverCardId em anime_decks...');
        await queryRunner.query(`ALTER TABLE "anime_decks" ADD COLUMN "coverCardId" uuid NULL`);
        await queryRunner.query(`
          ALTER TABLE "anime_decks" ADD CONSTRAINT "FK_anime_decks_cover_card"
          FOREIGN KEY ("coverCardId") REFERENCES "cards"("id") ON DELETE SET NULL
        `).catch(() => {});
        this.logger.log('✅ Coluna coverCardId adicionada.');
      }
    } catch (error: any) {
      if (error?.message?.includes('already exists')) {
        this.logger.log('✅ Tabelas anime_decks já existem.');
      } else {
        throw error;
      }
    } finally {
      await queryRunner.release();
    }
  }
}
