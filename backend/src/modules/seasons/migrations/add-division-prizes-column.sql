-- Adicionar coluna divisionPrizes na tabela seasons
-- Esta coluna armazena prêmios configuráveis para top 3 de cada divisão

-- Verificar se a coluna já existe antes de adicionar
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'seasons' 
        AND column_name = 'divisionPrizes'
    ) THEN
        ALTER TABLE seasons 
        ADD COLUMN "divisionPrizes" JSONB NULL;
        
        COMMENT ON COLUMN seasons."divisionPrizes" IS 'Prêmios configuráveis para top 3 de cada divisão. Formato: { "Bronze": { "first": { "trophy": "...", "credits": 100 }, ... }, ... }';
        
        RAISE NOTICE 'Coluna divisionPrizes adicionada com sucesso';
    ELSE
        RAISE NOTICE 'Coluna divisionPrizes já existe';
    END IF;
END $$;
