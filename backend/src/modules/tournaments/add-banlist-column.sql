-- Adicionar coluna banlist na tabela tournaments
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS banlist JSON;

