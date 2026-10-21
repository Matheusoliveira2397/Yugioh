-- Passe de Batalha: seasons, níveis e progresso do jogador
CREATE TABLE IF NOT EXISTS "battle_pass_seasons" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "name" varchar(120) NOT NULL,
  "description" text,
  "startsAt" TIMESTAMPTZ NOT NULL,
  "endsAt" TIMESTAMPTZ NOT NULL,
  "isActive" boolean NOT NULL DEFAULT false,
  "premiumPriceCredits" int NOT NULL DEFAULT 500,
  "xpPerWin" int NOT NULL DEFAULT 100,
  "xpPerLoss" int NOT NULL DEFAULT 40,
  "bannerUrl" varchar(500),
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "battle_pass_levels" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "seasonId" uuid NOT NULL REFERENCES "battle_pass_seasons"("id") ON DELETE CASCADE,
  "level" int NOT NULL,
  "xpRequired" int NOT NULL,
  "freeRewardType" varchar(20) NOT NULL DEFAULT 'none',
  "freeRewardAmount" int NOT NULL DEFAULT 0,
  "freeRewardCardId" uuid,
  "premiumRewardType" varchar(20) NOT NULL DEFAULT 'none',
  "premiumRewardAmount" int NOT NULL DEFAULT 0,
  "premiumRewardCardId" uuid,
  CONSTRAINT "UQ_battle_pass_levels_season_level" UNIQUE ("seasonId", "level")
);

CREATE TABLE IF NOT EXISTS "user_battle_pass" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId" int NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "seasonId" uuid NOT NULL REFERENCES "battle_pass_seasons"("id") ON DELETE CASCADE,
  "xp" int NOT NULL DEFAULT 0,
  "hasPremium" boolean NOT NULL DEFAULT false,
  "claimedFreeLevels" jsonb NOT NULL DEFAULT '[]',
  "claimedPremiumLevels" jsonb NOT NULL DEFAULT '[]',
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "UQ_user_battle_pass_user_season" UNIQUE ("userId", "seasonId")
);

CREATE INDEX IF NOT EXISTS "IDX_user_battle_pass_seasonId" ON "user_battle_pass" ("seasonId");
