-- Pacotes de créditos vendidos na página /credits (configuráveis no admin).
CREATE TABLE IF NOT EXISTS "credit_packages" (
  "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
  "credits" integer NOT NULL,
  "bonusCredits" integer NOT NULL DEFAULT 0,
  "priceBrl" numeric(10,2) NOT NULL,
  "description" character varying(255),
  "isPopular" boolean NOT NULL DEFAULT false,
  "sortOrder" integer NOT NULL DEFAULT 0,
  "isActive" boolean NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
  CONSTRAINT "PK_credit_packages" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "IDX_credit_packages_active_sort"
  ON "credit_packages" ("isActive", "sortOrder");
