-- Adicionar coluna division na tabela users
-- Todos os usuários começam na divisão Bronze

ALTER TABLE users 
ADD COLUMN IF NOT EXISTS division VARCHAR(50) DEFAULT 'Bronze';

-- Atualizar todos os usuários existentes para Bronze se não tiverem divisão
UPDATE users 
SET division = 'Bronze' 
WHERE division IS NULL OR division = '';

-- Criar índice para melhorar performance em queries por divisão
CREATE INDEX IF NOT EXISTS idx_users_division ON users(division);
