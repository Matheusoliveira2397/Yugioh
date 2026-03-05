-- Adiciona colunas de cosméticos comprados na tabela users (skins de carta e playmats).
-- Execute este SQL no PostgreSQL se a migração TypeORM não for usada (ex.: psql ou cliente SQL).

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "ownedSleeveIds" json DEFAULT '[]';
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "ownedPlaymatIds" json DEFAULT '[]';
