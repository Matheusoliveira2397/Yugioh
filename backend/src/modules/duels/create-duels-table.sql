-- Criar tabela duels com todos os campos necessários
-- ============================================

-- Criar/Verificar Enums
DO $$ 
BEGIN
    -- Criar enum DuelStatus se não existir
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'duelstatus') THEN
        CREATE TYPE "duelstatus" AS ENUM ('WAITING', 'IN_PROGRESS', 'FINISHED', 'CANCELLED');
    END IF;
    
    -- Criar enum DuelResult se não existir
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'duelresult') THEN
        CREATE TYPE "duelresult" AS ENUM ('PLAYER1_WIN', 'PLAYER2_WIN', 'DRAW', 'CANCELLED');
    END IF;
    
    -- Criar enum TurnPhase se não existir
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'turnphase') THEN
        CREATE TYPE "turnphase" AS ENUM ('DRAW', 'STANDBY', 'MAIN1', 'BATTLE', 'MAIN2', 'END');
    END IF;
    
    -- Criar enum DuelOrigin se não existir
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'duelorigin') THEN
        CREATE TYPE "duelorigin" AS ENUM ('RANDOM', 'CHAT', 'TOURNAMENT', 'ARENA', 'OTHER');
    END IF;
END $$;

-- Habilitar extensão UUID
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Criar tabela duels
CREATE TABLE IF NOT EXISTS duels (
    -- ID único do duelo (UUID gerado automaticamente)
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- IDs dos jogadores
    player1_id INTEGER NOT NULL,
    player2_id INTEGER NOT NULL,
    
    -- Nicks dos jogadores (para facilitar consultas)
    player1_nickname VARCHAR(255),
    player2_nickname VARCHAR(255),
    
    -- Status do duelo
    status duelstatus NOT NULL DEFAULT 'IN_PROGRESS',
    
    -- Vida dos jogadores
    player1_life_points INTEGER NOT NULL DEFAULT 8000,
    player2_life_points INTEGER NOT NULL DEFAULT 8000,
    
    -- Turno atual (1 = player1, 2 = player2)
    current_turn INTEGER NOT NULL DEFAULT 1,
    
    -- Fase atual do turno
    current_phase turnphase NOT NULL DEFAULT 'DRAW',
    
    -- Tempo total do duelo em segundos
    duel_time INTEGER NOT NULL DEFAULT 0,
    
    -- Tempo do turno em segundos (decrescente de 90)
    turn_time INTEGER NOT NULL DEFAULT 90,
    
    -- Campo completo do jogador 1 (JSONB)
    -- Inclui: deck, hand, monsters, spellTrap, graveyard, banished, etc.
    player1_field JSONB,
    
    -- Campo completo do jogador 2 (JSONB)
    -- Inclui: deck, hand, monsters, spellTrap, graveyard, banished, etc.
    player2_field JSONB,
    
    -- Origem do duelo
    origin duelorigin NOT NULL DEFAULT 'OTHER',
    
    -- Resultado do duelo (quando finalizado)
    result duelresult,
    
    -- ID do vencedor
    winner_id INTEGER,
    
    -- Timestamps
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    finished_at TIMESTAMP
);

-- Criar índices para performance
CREATE INDEX IF NOT EXISTS idx_duels_player1_status ON duels(player1_id, status);
CREATE INDEX IF NOT EXISTS idx_duels_player2_status ON duels(player2_id, status);
CREATE INDEX IF NOT EXISTS idx_duels_status ON duels(status);
CREATE INDEX IF NOT EXISTS idx_duels_status_updated ON duels(status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_duels_origin ON duels(origin);
CREATE INDEX IF NOT EXISTS idx_duels_winner ON duels(winner_id) WHERE winner_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_duels_active_partial ON duels(id, player1_id, player2_id, status, updated_at) WHERE status = 'IN_PROGRESS';
CREATE INDEX IF NOT EXISTS idx_duels_id_status ON duels(id, status);
CREATE INDEX IF NOT EXISTS idx_duels_updated_at ON duels(updated_at DESC);

-- Verificar estrutura criada
SELECT 
    column_name, 
    data_type, 
    column_default,
    is_nullable
FROM information_schema.columns 
WHERE table_name = 'duels' 
ORDER BY ordinal_position;

