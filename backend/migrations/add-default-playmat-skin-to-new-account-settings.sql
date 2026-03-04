-- Playmat e skin padrão para novas contas
ALTER TABLE new_account_settings ADD COLUMN IF NOT EXISTS "defaultPlaymatId" VARCHAR(36) NULL;
ALTER TABLE new_account_settings ADD COLUMN IF NOT EXISTS "defaultSkinId" VARCHAR(36) NULL;
