-- Atualizar coluna total_score para suportar valores decimais
-- Se a coluna não existir, criar; se existir, alterar o tipo

DO $$ 
BEGIN
    -- Verificar se a coluna existe
    IF EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'users' AND column_name = 'total_score'
    ) THEN
        -- Coluna existe, alterar tipo
        ALTER TABLE users 
        ALTER COLUMN total_score TYPE NUMERIC(10, 1) USING COALESCE(total_score::numeric, 0);
        
        -- Garantir que o default seja 0
        ALTER TABLE users 
        ALTER COLUMN total_score SET DEFAULT 0;
        
        RAISE NOTICE 'Coluna total_score alterada para NUMERIC(10, 1)';
    ELSE
        -- Coluna não existe, criar
        ALTER TABLE users 
        ADD COLUMN total_score NUMERIC(10, 1) DEFAULT 0;
        
        RAISE NOTICE 'Coluna total_score criada como NUMERIC(10, 1)';
    END IF;
END $$;

-- Comentário
COMMENT ON COLUMN users.total_score IS 'Score geral acumulado de todas as seasons (1.7 por vitória no random, 2.0 na arena, etc)';
