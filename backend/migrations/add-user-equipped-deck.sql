-- Adicionar coluna para armazenar o deck equipado do usuário

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS "equippedDeckName" character varying(100);


