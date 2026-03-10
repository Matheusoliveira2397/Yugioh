-- ============================================================
-- Tabelas novas (credit_payment_logs, refresh_tokens)
-- Execute no PostgreSQL do seu projeto se as tabelas ainda não existirem.
-- O backend também pode criá-las automaticamente na subida (AdminDbMigrationService, AuthDbMigrationService).
-- ============================================================

-- 1) refresh_tokens (auth - login com refresh token)
-- ------------------------------------------------
CREATE TABLE IF NOT EXISTS "refresh_tokens" (
  "id" SERIAL NOT NULL,
  "userId" integer NOT NULL,
  "tokenHash" character varying NOT NULL,
  "expiresAt" TIMESTAMP WITH TIME ZONE NOT NULL,
  "lastUsedAt" TIMESTAMP WITH TIME ZONE NOT NULL,
  "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT "PK_refresh_tokens" PRIMARY KEY ("id"),
  CONSTRAINT "FK_refresh_tokens_user" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "IDX_refresh_tokens_userId" ON "refresh_tokens" ("userId");
CREATE INDEX IF NOT EXISTS "IDX_refresh_tokens_tokenHash" ON "refresh_tokens" ("tokenHash");

-- 2) credit_payment_logs (admin - histórico de adição de créditos)
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "credit_payment_logs" (
  "id" SERIAL NOT NULL,
  "userId" integer NOT NULL,
  "adminId" integer NOT NULL,
  "amount" integer NOT NULL,
  "note" character varying(500),
  "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT "PK_credit_payment_logs" PRIMARY KEY ("id"),
  CONSTRAINT "FK_credit_payment_logs_user" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE,
  CONSTRAINT "FK_credit_payment_logs_admin" FOREIGN KEY ("adminId") REFERENCES "users"("id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "IDX_credit_payment_logs_userId" ON "credit_payment_logs" ("userId");
CREATE INDEX IF NOT EXISTS "IDX_credit_payment_logs_adminId" ON "credit_payment_logs" ("adminId");
CREATE INDEX IF NOT EXISTS "IDX_credit_payment_logs_createdAt" ON "credit_payment_logs" ("createdAt");
