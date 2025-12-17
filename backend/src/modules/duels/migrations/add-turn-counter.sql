-- Adicionar coluna turn_counter para rastrear turnos globalmente
-- Isso é necessário para verificar se um monstro foi invocado no turno atual
-- (currentTurn alterna entre 1 e 2, mas turn_counter incrementa sempre)

-- Adicionar coluna se não existir
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'duels' AND column_name = 'turn_counter'
    ) THEN
        ALTER TABLE duels 
        ADD COLUMN turn_counter INTEGER NOT NULL DEFAULT 1;
        
        RAISE NOTICE 'Coluna turn_counter adicionada com sucesso';
    ELSE
        RAISE NOTICE 'Coluna turn_counter já existe';
    END IF;
END $$;

-- Comentário na coluna
COMMENT ON COLUMN duels.turn_counter IS 'Contador global de turnos (incrementa a cada turno, não alterna). Usado para rastrear quando monstros foram invocados.';
