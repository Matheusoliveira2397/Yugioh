-- ============================================
-- Migration: Adicionar coluna division na tabela users
-- Execute este script no seu banco de dados PostgreSQL
-- ============================================

-- 1. Adicionar coluna division (se não existir)
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS division VARCHAR(50) DEFAULT 'Bronze';

-- 2. Atualizar todos os usuários existentes para Bronze se não tiverem divisão
UPDATE users 
SET division = 'Bronze' 
WHERE division IS NULL OR division = '';

-- 3. Criar índice para melhorar performance em queries por divisão
CREATE INDEX IF NOT EXISTS idx_users_division ON users(division);

-- 4. Verificar se a coluna foi criada corretamente
SELECT column_name, data_type, column_default 
FROM information_schema.columns 
WHERE table_name = 'users' AND column_name = 'division';

-- Se a query acima retornar uma linha, a coluna foi criada com sucesso!




























































