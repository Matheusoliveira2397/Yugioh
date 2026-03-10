-- Adicionar colunas para cosméticos equipados do usuário (playmat e sleeve)

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS "equippedPlaymatId" character varying(100),
  ADD COLUMN IF NOT EXISTS "equippedPlaymatImage" character varying(255),
  ADD COLUMN IF NOT EXISTS "equippedSkinId" character varying(100),
  ADD COLUMN IF NOT EXISTS "equippedSkinImage" character varying(255);


