-- Tabela para armazenar decks iniciais
CREATE TABLE IF NOT EXISTS "initial_decks" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "name" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Tabela para armazenar as cartas de cada deck inicial
CREATE TABLE IF NOT EXISTS "initial_deck_cards" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "initialDeckId" UUID NOT NULL,
    "cardId" UUID NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "isExtraDeck" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "FK_initial_deck_cards_initial_deck" FOREIGN KEY ("initialDeckId") REFERENCES "initial_decks"("id") ON DELETE CASCADE,
    CONSTRAINT "FK_initial_deck_cards_card" FOREIGN KEY ("cardId") REFERENCES "cards"("id") ON DELETE CASCADE
);

-- Migração: adicionar coluna isExtraDeck se a tabela já existir sem ela
ALTER TABLE "initial_deck_cards" ADD COLUMN IF NOT EXISTS "isExtraDeck" BOOLEAN NOT NULL DEFAULT false;

-- Índices para melhor performance
CREATE INDEX IF NOT EXISTS "IDX_initial_decks_isActive" ON "initial_decks"("isActive");
CREATE INDEX IF NOT EXISTS "IDX_initial_deck_cards_initialDeckId" ON "initial_deck_cards"("initialDeckId");
CREATE INDEX IF NOT EXISTS "IDX_initial_deck_cards_cardId" ON "initial_deck_cards"("cardId");

