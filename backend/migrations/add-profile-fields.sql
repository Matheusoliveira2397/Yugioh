-- Migration: Adicionar campos de perfil ao usuário
-- Data: 2025-11-08

-- Adicionar campos à tabela users
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS "clanTag" VARCHAR(255) NULL,
ADD COLUMN IF NOT EXISTS "biography" TEXT NULL,
ADD COLUMN IF NOT EXISTS "playerClass" VARCHAR(255) NULL DEFAULT 'Novato';

-- Criar tabela de conquistas
CREATE TABLE IF NOT EXISTS "achievements" (
    "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
    "userId" integer NOT NULL,
    "type" character varying NOT NULL,
    "title" character varying NOT NULL,
    "description" text,
    "icon" character varying,
    "metadata" jsonb,
    "unlockedAt" TIMESTAMP NOT NULL DEFAULT now(),
    CONSTRAINT "PK_achievements" PRIMARY KEY ("id"),
    CONSTRAINT "FK_achievements_user" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE
);

-- Criar índices para melhor performance
CREATE INDEX IF NOT EXISTS "IDX_achievements_userId" ON "achievements"("userId");
CREATE INDEX IF NOT EXISTS "IDX_achievements_type" ON "achievements"("type");
CREATE INDEX IF NOT EXISTS "IDX_users_clanTag" ON "users"("clanTag");

