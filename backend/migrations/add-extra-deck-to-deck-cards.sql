-- Migration: Adicionar coluna isExtraDeck na tabela deck_cards
-- Data: 2024

-- Adicionar coluna isExtraDeck (default false para manter compatibilidade com decks existentes)
ALTER TABLE "deck_cards" 
ADD COLUMN IF NOT EXISTS "isExtraDeck" BOOLEAN DEFAULT false;

-- Criar índice para melhorar performance nas queries que filtram por isExtraDeck
CREATE INDEX IF NOT EXISTS "IDX_deck_cards_isExtraDeck" ON "deck_cards"("isExtraDeck");

-- Comentário na coluna
COMMENT ON COLUMN "deck_cards"."isExtraDeck" IS 'Indica se a carta está no Extra Deck (true) ou no Deck Principal (false)';

