-- Score por vitória por tipo de duelo (configurável no admin)
CREATE TABLE IF NOT EXISTS duel_score_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "scoreRandom" NUMERIC(10,2) NOT NULL DEFAULT 1.7,
  "scoreChat" NUMERIC(10,2) NOT NULL DEFAULT 1.0,
  "scoreTournament" NUMERIC(10,2) NOT NULL DEFAULT 10.0,
  "scoreArena" NUMERIC(10,2) NOT NULL DEFAULT 2.0,
  "scoreOther" NUMERIC(10,2) NOT NULL DEFAULT 1.0,
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Garantir uma única linha de configuração
INSERT INTO duel_score_settings (id, "scoreRandom", "scoreChat", "scoreTournament", "scoreArena", "scoreOther", "createdAt", "updatedAt")
SELECT gen_random_uuid(), 1.7, 1.0, 10.0, 2.0, 1.0, NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM duel_score_settings LIMIT 1);
