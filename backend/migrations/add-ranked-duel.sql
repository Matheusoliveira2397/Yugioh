-- Partida Ranqueada: origem RANKED + pontos que sobem/descem

-- Enums (PostgreSQL)
DO $$ BEGIN
  ALTER TYPE duelorigin ADD VALUE IF NOT EXISTS 'RANKED';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE duelhistoryorigin ADD VALUE IF NOT EXISTS 'RANKED';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Pontos ranqueados do jogador (default 1000)
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS ranked_points INTEGER NOT NULL DEFAULT 1000;

-- Configurações de score / pontos ranqueados
ALTER TABLE duel_score_settings
  ADD COLUMN IF NOT EXISTS "scoreRanked" NUMERIC(10,2) NOT NULL DEFAULT 2.0;

ALTER TABLE duel_score_settings
  ADD COLUMN IF NOT EXISTS "rankedPointsOnWin" INTEGER NOT NULL DEFAULT 25;

ALTER TABLE duel_score_settings
  ADD COLUMN IF NOT EXISTS "rankedPointsOnLoss" INTEGER NOT NULL DEFAULT 20;
