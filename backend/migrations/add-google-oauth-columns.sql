-- Google OAuth + senha nullable (contas só-Google)
-- Também aplicado automaticamente no boot via AuthDbMigrationService.

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "googleId" character varying(64) NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "UQ_users_googleId" ON "users" ("googleId") WHERE "googleId" IS NOT NULL;

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "authProvider" character varying(32) NOT NULL DEFAULT 'local';

ALTER TABLE "users" ALTER COLUMN "password" DROP NOT NULL;
