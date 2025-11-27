-- ============================================
-- RECRIAR TABELA DUELS COMPLETA
-- ============================================
-- Este script apaga as tabelas antigas e cria uma nova tabela "duels"
-- com todas as funcionalidades necessárias:
-- - Vida dos jogadores
-- - Tempo do jogo
-- - De quem é o turno
-- - Tempo do turno (igual para ambos)
-- - Mão e deck dos jogadores
-- - Campo de cada jogador

-- ============================================
-- PASSO 1: Apagar tabelas antigas
-- ============================================
DROP TABLE IF EXISTS duels CASCADE;
DROP TABLE IF EXISTS duels_new CASCADE;

-- ============================================
-- PASSO 2: Habilitar Extensão UUID
-- ============================================
-- CRÍTICO: Habilitar extensão uuid-ossp ANTES de criar a tabela
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- PASSO 3: Criar/Verificar Enums
-- ============================================
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
END $$;

-- ============================================
-- PASSO 4: Criar Nova Tabela DUELS
-- ============================================
CREATE TABLE duels (
    -- ID único do duelo (UUID)
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- IDs dos jogadores
    player1_id INTEGER NOT NULL,
    player2_id INTEGER NOT NULL,
    
    -- Status do duelo
    status duelstatus NOT NULL DEFAULT 'WAITING',
    
    -- Vida dos jogadores
    "player1LifePoints" INTEGER NOT NULL DEFAULT 8000,
    "player2LifePoints" INTEGER NOT NULL DEFAULT 8000,
    
    -- Turno atual (1 = player1, 2 = player2)
    "currentTurn" INTEGER NOT NULL DEFAULT 1,
    
    -- Fase atual do turno
    "currentPhase" turnphase NOT NULL DEFAULT 'DRAW',
    
    -- Tempo total do duelo em segundos
    "duelTime" INTEGER NOT NULL DEFAULT 0,
    
    -- Tempo do turno em segundos (igual para ambos os jogadores)
    "turnTime" INTEGER NOT NULL DEFAULT 90,
    
    -- Campo completo do jogador 1 (JSONB)
    -- Inclui: deck, hand, graveyard, banished, monsters, spells, traps, etc.
    "player1Field" JSONB,
    
    -- Campo completo do jogador 2 (JSONB)
    -- Inclui: deck, hand, graveyard, banished, monsters, spells, traps, etc.
    "player2Field" JSONB,
    
    -- Resultado do duelo
    result duelresult,
    
    -- ID do vencedor
    "winnerId" INTEGER,
    
    -- Timestamps
    "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
    "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW(),
    "finishedAt" TIMESTAMP
);

-- ============================================
-- PASSO 5: Criar Índices para Performance
-- ============================================
-- Índice para buscar duelos por player1 e status
CREATE INDEX IF NOT EXISTS idx_duels_player1_status 
    ON duels(player1_id, status);

-- Índice para buscar duelos por player2 e status
CREATE INDEX IF NOT EXISTS idx_duels_player2_status 
    ON duels(player2_id, status);

-- Índice para buscar duelos por status
CREATE INDEX IF NOT EXISTS idx_duels_status 
    ON duels(status);

-- Índice para buscar duelos por status e updatedAt (útil para queries de duelos ativos)
CREATE INDEX IF NOT EXISTS idx_duels_status_updated 
    ON duels(status, "updatedAt" DESC);

-- Índice para buscar duelos por winnerId
CREATE INDEX IF NOT EXISTS idx_duels_winner 
    ON duels("winnerId") 
    WHERE "winnerId" IS NOT NULL;

-- ============================================
-- PASSO 6: Verificar Estrutura Criada
-- ============================================
SELECT 
    column_name, 
    data_type, 
    column_default,
    is_nullable
FROM information_schema.columns 
WHERE table_name = 'duels' 
ORDER BY ordinal_position;

-- ============================================
-- PASSO 7: Verificar Índices Criados
-- ============================================
SELECT 
    indexname,
    indexdef
FROM pg_indexes 
WHERE tablename = 'duels'
ORDER BY indexname;

-- ============================================
-- CONCLUÍDO!
-- ============================================
-- A tabela "duels" foi criada com sucesso com todas as funcionalidades:
-- ✓ Vida dos jogadores (player1LifePoints, player2LifePoints)
-- ✓ Tempo do jogo (duelTime)
-- ✓ De quem é o turno (currentTurn)
-- ✓ Tempo do turno (turnTime) - igual para ambos
-- ✓ Mão e deck dos jogadores (player1Field, player2Field - JSONB)
-- ✓ Campo de cada jogador (player1Field, player2Field - JSONB)
-- ============================================
