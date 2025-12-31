-- Adicionar coluna turn_counter se não existir
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'duels' 
        AND column_name = 'turn_counter'
    ) THEN
        ALTER TABLE duels ADD COLUMN turn_counter INTEGER DEFAULT 1 NOT NULL;
        RAISE NOTICE 'Coluna turn_counter adicionada com sucesso!';
    ELSE
        RAISE NOTICE 'Coluna turn_counter já existe!';
    END IF;
END $$;

-- Atualizar todos os duelos existentes
UPDATE duels SET turn_counter = 1 WHERE turn_counter IS NULL OR turn_counter = 0;

-- Confirmar
SELECT 'Migração concluída!' as status, COUNT(*) as total_duelos FROM duels;
