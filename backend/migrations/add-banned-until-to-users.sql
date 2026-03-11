-- Adiciona coluna bannedUntil na tabela users (banimento com data de fim)
-- Execute este SQL no PostgreSQL se a coluna ainda não existir.

ALTER TABLE "users"
ADD COLUMN IF NOT EXISTS "bannedUntil" TIMESTAMP NULL;
