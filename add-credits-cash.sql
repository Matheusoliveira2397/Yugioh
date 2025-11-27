-- Script para adicionar Credits e Cash aos usuários para teste

-- Adicionar moedas ao admin2
UPDATE users 
SET credits = 1000, cash = 50.00
WHERE username = 'admin2';

-- Adicionar moedas a todos os usuários (opcional)
-- UPDATE users 
-- SET credits = 500, cash = 25.00
-- WHERE credits IS NULL OR cash IS NULL;

-- Verificar se foi aplicado
SELECT username, credits, cash FROM users WHERE username = 'admin2';
