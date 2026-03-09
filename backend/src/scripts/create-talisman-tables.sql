-- Criar tabelas de talismãs (execute no PostgreSQL)
-- Exemplo: psql -U postgres -d sua_database -f src/scripts/create-talisman-tables.sql

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS "talisman_templates" (
  "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
  "name" character varying(120) NOT NULL,
  "description" text,
  "image" character varying(500),
  "bonusScorePct" integer NOT NULL DEFAULT 0,
  "bonusCashPct" integer NOT NULL DEFAULT 0,
  "bonusArenaPointsPct" integer NOT NULL DEFAULT 0,
  "priceCredits" integer DEFAULT 0,
  "priceCash" integer DEFAULT 0,
  "isActive" boolean NOT NULL DEFAULT true,
  "isForSale" boolean NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
  CONSTRAINT "PK_talisman_templates" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "user_talismans" (
  "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
  "userId" integer NOT NULL,
  "talismanTemplateId" uuid NOT NULL,
  "equipped" boolean NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
  CONSTRAINT "PK_user_talismans" PRIMARY KEY ("id"),
  CONSTRAINT "FK_user_talismans_user" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE,
  CONSTRAINT "FK_user_talismans_template" FOREIGN KEY ("talismanTemplateId") REFERENCES "talisman_templates"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "IDX_user_talismans_userId" ON "user_talismans" ("userId");
CREATE INDEX IF NOT EXISTS "IDX_user_talismans_equipped" ON "user_talismans" ("userId", "equipped") WHERE "equipped" = true;

-- Talismãs iniciais (só insere se a tabela estiver vazia)
INSERT INTO "talisman_templates" ("id", "name", "description", "image", "bonusScorePct", "bonusCashPct", "bonusArenaPointsPct", "priceCredits", "priceCash", "isActive", "isForSale")
SELECT uuid_generate_v4(), 'Talismã do Iniciante', 'Bônus modestos na Arena.', NULL, 5, 5, 10, 500, 50, true, true
WHERE NOT EXISTS (SELECT 1 FROM "talisman_templates" LIMIT 1);

INSERT INTO "talisman_templates" ("id", "name", "description", "image", "bonusScorePct", "bonusCashPct", "bonusArenaPointsPct", "priceCredits", "priceCash", "isActive", "isForSale")
SELECT uuid_generate_v4(), 'Talismã do Guerreiro', 'Aumenta recompensas da Arena.', NULL, 10, 10, 15, 1500, 150, true, true
WHERE (SELECT COUNT(*) FROM "talisman_templates") < 2;

INSERT INTO "talisman_templates" ("id", "name", "description", "image", "bonusScorePct", "bonusCashPct", "bonusArenaPointsPct", "priceCredits", "priceCash", "isActive", "isForSale")
SELECT uuid_generate_v4(), 'Talismã do Mestre', 'Grandes bônus em Score, Cash e Arena Points.', NULL, 15, 15, 20, 4000, 400, true, true
WHERE (SELECT COUNT(*) FROM "talisman_templates") < 3;

INSERT INTO "talisman_templates" ("id", "name", "description", "image", "bonusScorePct", "bonusCashPct", "bonusArenaPointsPct", "priceCredits", "priceCash", "isActive", "isForSale")
SELECT uuid_generate_v4(), 'Talismã Lendário', 'Máximos bônus na Arena de Duelos.', NULL, 25, 25, 30, 10000, 1000, true, true
WHERE (SELECT COUNT(*) FROM "talisman_templates") < 4;
