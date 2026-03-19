-- ============================================
-- Tabelas para Random Duel: Animes Deck
-- Execute este script no PostgreSQL para criar
-- anime_decks e anime_deck_cards.
-- ============================================

-- 1) Adicionar valor ao enum duelorigin (se a tabela duels já existir)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'duelorigin') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_enum
      WHERE enumlabel = 'RANDOM_ANIME'
      AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'duelorigin')
    ) THEN
      ALTER TYPE "duelorigin" ADD VALUE 'RANDOM_ANIME';
    END IF;
  END IF;
END $$;

-- 2) Tabela de decks anime
CREATE TABLE IF NOT EXISTS "anime_decks" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "name" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 3) Tabela de cartas de cada deck anime
CREATE TABLE IF NOT EXISTS "anime_deck_cards" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "animeDeckId" UUID NOT NULL,
    "cardId" UUID NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "isExtraDeck" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "FK_anime_deck_cards_anime_deck" FOREIGN KEY ("animeDeckId") REFERENCES "anime_decks"("id") ON DELETE CASCADE,
    CONSTRAINT "FK_anime_deck_cards_card" FOREIGN KEY ("cardId") REFERENCES "cards"("id")
);

-- 4) Índices
CREATE INDEX IF NOT EXISTS "IDX_anime_decks_isActive" ON "anime_decks"("isActive");
CREATE INDEX IF NOT EXISTS "IDX_anime_deck_cards_animeDeckId" ON "anime_deck_cards"("animeDeckId");
CREATE INDEX IF NOT EXISTS "IDX_anime_deck_cards_cardId" ON "anime_deck_cards"("cardId");
