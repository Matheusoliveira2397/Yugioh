-- Script para habilitar extensão UUID e garantir que funciona
-- Execute este script no banco de dados antes de criar duelos

-- Habilitar extensão uuid-ossp (necessária para uuid_generate_v4())
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Verificar se a extensão está habilitada
SELECT * FROM pg_extension WHERE extname = 'uuid-ossp';

-- Testar geração de UUID
SELECT uuid_generate_v4() as test_uuid;

-- Verificar estrutura da tabela duels
SELECT column_name, data_type, column_default 
FROM information_schema.columns 
WHERE table_name = 'duels' AND column_name = 'id';

-- Se o DEFAULT não estiver correto, corrigir:
-- ALTER TABLE duels ALTER COLUMN id SET DEFAULT uuid_generate_v4();

