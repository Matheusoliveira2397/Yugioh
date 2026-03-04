-- Migration: adicionar coluna isExtraDeck na tabela initial_deck_cards
-- Necessário para Deck Adicional (Fusion, Synchro, Xyz, Link) em decks iniciais.
-- Execute: psql -h HOST -U USER -d DB -f backend/migrations/add-initial-deck-cards-isExtraDeck.sql

ALTER TABLE "initial_deck_cards"
ADD COLUMN IF NOT EXISTS "isExtraDeck" BOOLEAN NOT NULL DEFAULT false;

-- Comentário opcional
COMMENT ON COLUMN "initial_deck_cards"."isExtraDeck" IS 'true = carta no Deck Adicional (Fusion/Synchro/Xyz/Link)';
