-- Códigos de resgate de premiação (admin gera / jogadores resgatam).
CREATE TABLE IF NOT EXISTS "promo_codes" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "code" character varying(64) NOT NULL,
  "label" character varying(120),
  "isActive" boolean NOT NULL DEFAULT true,
  "maxUses" integer,
  "usesCount" integer NOT NULL DEFAULT 0,
  "maxUsesPerUser" integer NOT NULL DEFAULT 1,
  "startsAt" TIMESTAMPTZ,
  "expiresAt" TIMESTAMPTZ,
  "rewardType" character varying(20) NOT NULL DEFAULT 'credits',
  "rewardAmount" integer NOT NULL DEFAULT 0,
  "rewardCardId" uuid,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "PK_promo_codes" PRIMARY KEY ("id"),
  CONSTRAINT "UQ_promo_codes_code" UNIQUE ("code")
);

CREATE INDEX IF NOT EXISTS "IDX_promo_codes_active"
  ON "promo_codes" ("isActive");

CREATE TABLE IF NOT EXISTS "promo_code_redemptions" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "promoCodeId" uuid NOT NULL REFERENCES "promo_codes"("id") ON DELETE CASCADE,
  "userId" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "PK_promo_code_redemptions" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "IDX_promo_code_redemptions_code_user"
  ON "promo_code_redemptions" ("promoCodeId", "userId");

CREATE INDEX IF NOT EXISTS "IDX_promo_code_redemptions_userId"
  ON "promo_code_redemptions" ("userId");
