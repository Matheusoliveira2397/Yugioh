-- ============================================
-- ÍNDICES PARA OTIMIZAÇÃO DE PERFORMANCE
-- ============================================

-- Índices para tabela duels (queries mais frequentes)
CREATE INDEX IF NOT EXISTS "IDX_duels_player1_id" ON "duels"("player1_id");
CREATE INDEX IF NOT EXISTS "IDX_duels_player2_id" ON "duels"("player2_id");
CREATE INDEX IF NOT EXISTS "IDX_duels_status" ON "duels"("status");
CREATE INDEX IF NOT EXISTS "IDX_duels_created_at" ON "duels"("created_at" DESC);
CREATE INDEX IF NOT EXISTS "IDX_duels_winner_id" ON "duels"("winner_id") WHERE "winner_id" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "IDX_duels_status_created" ON "duels"("status", "created_at" DESC);

-- Índices compostos para queries comuns
CREATE INDEX IF NOT EXISTS "IDX_duels_player1_status" ON "duels"("player1_id", "status");
CREATE INDEX IF NOT EXISTS "IDX_duels_player2_status" ON "duels"("player2_id", "status");

-- Índices para tabela deck_cards
CREATE INDEX IF NOT EXISTS "IDX_deck_cards_deck_id" ON "deck_cards"("deckId");
CREATE INDEX IF NOT EXISTS "IDX_deck_cards_card_id" ON "deck_cards"("cardId");
CREATE INDEX IF NOT EXISTS "IDX_deck_cards_isExtraDeck" ON "deck_cards"("isExtraDeck");
CREATE INDEX IF NOT EXISTS "IDX_deck_cards_deck_extra" ON "deck_cards"("deckId", "isExtraDeck");

-- Índices para tabela decks
CREATE INDEX IF NOT EXISTS "IDX_decks_user_id" ON "decks"("userId");
CREATE INDEX IF NOT EXISTS "IDX_decks_user_name" ON "decks"("userId", "name");
CREATE INDEX IF NOT EXISTS "IDX_decks_name" ON "decks"("name");

-- Índices para tabela user_cards
CREATE INDEX IF NOT EXISTS "IDX_user_cards_user_id" ON "user_cards"("userId");
CREATE INDEX IF NOT EXISTS "IDX_user_cards_card_id" ON "user_cards"("cardId");
CREATE INDEX IF NOT EXISTS "IDX_user_cards_user_card" ON "user_cards"("userId", "cardId");

-- Índices para tabela users (queries frequentes)
CREATE INDEX IF NOT EXISTS "IDX_users_role" ON "users"("role");
CREATE INDEX IF NOT EXISTS "IDX_users_is_online" ON "users"("isOnline") WHERE "isOnline" = true;
CREATE INDEX IF NOT EXISTS "IDX_users_rating" ON "users"("rating" DESC);
CREATE INDEX IF NOT EXISTS "IDX_users_level" ON "users"("level" DESC);

-- Índices para duel_logs
CREATE INDEX IF NOT EXISTS "IDX_duel_logs_duel_id" ON "duel_logs"("duelId");
CREATE INDEX IF NOT EXISTS "IDX_duel_logs_user_id" ON "duel_logs"("userId");
CREATE INDEX IF NOT EXISTS "IDX_duel_logs_created_at" ON "duel_logs"("createdAt" DESC);

-- Índices para arena (se existir tabela)
-- CREATE INDEX IF NOT EXISTS "IDX_arena_user_id" ON "arena"("userId");
-- CREATE INDEX IF NOT EXISTS "IDX_arena_status" ON "arena"("status");

-- Análise de tabelas para otimização do query planner
ANALYZE "duels";
ANALYZE "decks";
ANALYZE "deck_cards";
ANALYZE "user_cards";
ANALYZE "users";

