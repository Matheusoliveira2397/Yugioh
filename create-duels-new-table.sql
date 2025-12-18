-- Criar nova tabela duels_new para testar salvamento
-- Primeiro verificar/criar enums se necessário
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'duelstatus') THEN
        CREATE TYPE "duelstatus" AS ENUM ('WAITING', 'IN_PROGRESS', 'FINISHED', 'CANCELLED');
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'duelresult') THEN
        CREATE TYPE "duelresult" AS ENUM ('PLAYER1_WIN', 'PLAYER2_WIN', 'DRAW', 'CANCELLED');
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'turnphase') THEN
        CREATE TYPE "turnphase" AS ENUM ('DRAW', 'STANDBY', 'MAIN1', 'BATTLE', 'MAIN2', 'END');
    END IF;
END $$;

-- Criar tabela duels_new
CREATE TABLE IF NOT EXISTS duels_new (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    player1_id INTEGER NOT NULL,
    player2_id INTEGER NOT NULL,
    status duelstatus NOT NULL DEFAULT 'WAITING',
    "player1LifePoints" INTEGER NOT NULL DEFAULT 8000,
    "player2LifePoints" INTEGER NOT NULL DEFAULT 8000,
    "currentTurn" INTEGER NOT NULL DEFAULT 1,
    "currentPhase" turnphase NOT NULL DEFAULT 'DRAW',
    "duelTime" INTEGER NOT NULL DEFAULT 0,
    "player1Field" JSONB,
    "player2Field" JSONB,
    "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
    "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW(),
    "finishedAt" TIMESTAMP,
    result duelresult,
    "winnerId" INTEGER
);

-- Criar índices
CREATE INDEX IF NOT EXISTS idx_duels_new_player1_status ON duels_new(player1_id, status);
CREATE INDEX IF NOT EXISTS idx_duels_new_player2_status ON duels_new(player2_id, status);
CREATE INDEX IF NOT EXISTS idx_duels_new_status ON duels_new(status);

-- Verificar se foi criada
SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'duels_new' ORDER BY ordinal_position;
