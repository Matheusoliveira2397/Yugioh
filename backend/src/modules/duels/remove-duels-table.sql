-- Script para remover a tabela duels do banco de dados
-- Execute este script no PostgreSQL

-- Remover tabela duels e todas as dependências
DROP TABLE IF EXISTS duels CASCADE;

-- Verificar se foi removida
SELECT 
    table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name = 'duels';

-- Se retornar vazio, a tabela foi removida com sucesso

