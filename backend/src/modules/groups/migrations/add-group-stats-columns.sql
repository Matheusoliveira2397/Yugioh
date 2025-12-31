-- Migration: Adicionar campos de estatísticas ao grupo
-- Data: 2025-01-XX

-- Adicionar coluna banner se não existir
ALTER TABLE groups 
ADD COLUMN IF NOT EXISTS "banner" VARCHAR(255) NULL;

-- Adicionar campos à tabela groups
ALTER TABLE groups 
ADD COLUMN IF NOT EXISTS "totalCash" INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS "totalWins" INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS "totalLosses" INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS "totalAchievements" INTEGER DEFAULT 0;

-- Comentários nas colunas
COMMENT ON COLUMN groups."banner" IS 'Banner do clã';
COMMENT ON COLUMN groups."totalCash" IS 'Cash total do clã (ganho quando duelistas ganham cash em duelos - metade do cash ganho)';
COMMENT ON COLUMN groups."totalWins" IS 'Vitórias totais do clã';
COMMENT ON COLUMN groups."totalLosses" IS 'Derrotas totais do clã';
COMMENT ON COLUMN groups."totalAchievements" IS 'Total de conquistas do clã';
