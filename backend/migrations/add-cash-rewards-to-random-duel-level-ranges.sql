-- Migração: Adicionar campos cashOnWin e cashOnLoss na tabela random_duel_level_ranges
-- Data: 2025-01-XX
-- Descrição: Adiciona campos para configurar cash ganho por vitória e derrota no Random Duel

-- Verificar se as colunas já existem antes de adicionar
DO $$
BEGIN
    -- Adicionar coluna cashOnWin se não existir
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'random_duel_level_ranges' 
        AND column_name = 'cashOnWin'
    ) THEN
        ALTER TABLE "random_duel_level_ranges" 
        ADD COLUMN "cashOnWin" INTEGER DEFAULT 0;
        RAISE NOTICE 'Coluna cashOnWin adicionada';
    ELSE
        RAISE NOTICE 'Coluna cashOnWin já existe';
    END IF;

    -- Adicionar coluna cashOnLoss se não existir
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'random_duel_level_ranges' 
        AND column_name = 'cashOnLoss'
    ) THEN
        ALTER TABLE "random_duel_level_ranges" 
        ADD COLUMN "cashOnLoss" INTEGER DEFAULT 0;
        RAISE NOTICE 'Coluna cashOnLoss adicionada';
    ELSE
        RAISE NOTICE 'Coluna cashOnLoss já existe';
    END IF;
END $$;

-- Comentários nas colunas
COMMENT ON COLUMN "random_duel_level_ranges"."cashOnWin" IS 'Cash ganho por vitória no Random Duel';
COMMENT ON COLUMN "random_duel_level_ranges"."cashOnLoss" IS 'Cash ganho por derrota no Random Duel';

