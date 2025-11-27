-- Migration para adicionar coluna currentPhase na tabela duels
-- Execute este script no banco de dados PostgreSQL

-- Primeiro, criar o tipo enum se não existir
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'turnphase') THEN
        CREATE TYPE "turnphase" AS ENUM ('DRAW', 'STANDBY', 'MAIN1', 'BATTLE', 'MAIN2', 'END');
    END IF;
END $$;

-- Adicionar coluna currentPhase se não existir
ALTER TABLE duels 
ADD COLUMN IF NOT EXISTS "currentPhase" "turnphase" DEFAULT 'DRAW';

-- Atualizar duelos existentes para ter a fase DRAW
UPDATE duels 
SET "currentPhase" = 'DRAW' 
WHERE "currentPhase" IS NULL;











