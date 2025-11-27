-- Migration para alterar ID do duelo de UUID para número sequencial
-- Execute este script no banco de dados PostgreSQL

-- IMPORTANTE: Este script vai:
-- 1. Criar uma nova coluna id_new como serial
-- 2. Migrar os dados
-- 3. Remover a coluna antiga e renomear a nova

-- Passo 1: Criar nova coluna id_new como serial
ALTER TABLE duels 
ADD COLUMN IF NOT EXISTS id_new SERIAL;

-- Passo 2: Atualizar duel_logs para usar o novo ID (se houver dados)
-- Primeiro, precisamos criar uma tabela temporária para mapear UUID -> número
CREATE TEMP TABLE IF NOT EXISTS duel_id_mapping AS
SELECT 
  id::text as old_id,
  ROW_NUMBER() OVER (ORDER BY "createdAt") as new_id
FROM duels
ORDER BY "createdAt";

-- Passo 3: Atualizar duel_logs com os novos IDs
UPDATE duel_logs dl
SET duel_id = (
  SELECT new_id::int
  FROM duel_id_mapping dim
  WHERE dim.old_id = dl.duel_id::text
)
WHERE EXISTS (
  SELECT 1 FROM duel_id_mapping dim WHERE dim.old_id = dl.duel_id::text
);

-- Passo 4: Atualizar duels com os novos IDs sequenciais
UPDATE duels d
SET id_new = (
  SELECT new_id
  FROM duel_id_mapping dim
  WHERE dim.old_id = d.id::text
);

-- Passo 5: Remover constraint da coluna antiga (se existir)
ALTER TABLE duel_logs DROP CONSTRAINT IF EXISTS "FK_duel_logs_duel";

-- Passo 6: Remover coluna antiga e renomear nova
ALTER TABLE duels DROP COLUMN IF EXISTS id;
ALTER TABLE duels RENAME COLUMN id_new TO id;

-- Passo 7: Adicionar constraint de primary key na nova coluna
ALTER TABLE duels ADD PRIMARY KEY (id);

-- Passo 8: Atualizar tipo da coluna duel_id em duel_logs
ALTER TABLE duel_logs ALTER COLUMN duel_id TYPE integer USING duel_id::integer;

-- Passo 9: Recriar foreign key
ALTER TABLE duel_logs 
ADD CONSTRAINT "FK_duel_logs_duel" 
FOREIGN KEY (duel_id) REFERENCES duels(id) ON DELETE CASCADE;

-- Passo 10: Recriar índices se necessário
CREATE INDEX IF NOT EXISTS "IDX_duel_logs_duel_id" ON duel_logs(duel_id);

-- Limpar tabela temporária
DROP TABLE IF EXISTS duel_id_mapping;











