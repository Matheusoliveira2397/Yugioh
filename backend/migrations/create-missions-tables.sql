-- Missões: categorias (abas), missões, objetivos e progresso do jogador

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS "mission_categories" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "name" varchar(120) NOT NULL,
  "description" text,
  "icon" varchar(16) NOT NULL DEFAULT '🎯',
  "sortOrder" int NOT NULL DEFAULT 0,
  "isActive" boolean NOT NULL DEFAULT true,
  "resetType" varchar(20) NOT NULL DEFAULT 'none',
  "startsAt" TIMESTAMPTZ,
  "endsAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "missions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "categoryId" uuid NOT NULL REFERENCES "mission_categories"("id") ON DELETE CASCADE,
  "title" varchar(160) NOT NULL,
  "description" text,
  "sortOrder" int NOT NULL DEFAULT 0,
  "isActive" boolean NOT NULL DEFAULT true,
  "rewardType" varchar(20) NOT NULL DEFAULT 'none',
  "rewardAmount" int NOT NULL DEFAULT 0,
  "rewardCardId" uuid,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "IDX_missions_category_sort"
  ON "missions" ("categoryId", "sortOrder");

CREATE TABLE IF NOT EXISTS "mission_objectives" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "missionId" uuid NOT NULL REFERENCES "missions"("id") ON DELETE CASCADE,
  "type" varchar(40) NOT NULL,
  "targetAmount" int NOT NULL DEFAULT 1,
  "sortOrder" int NOT NULL DEFAULT 0,
  "meta" jsonb NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS "IDX_mission_objectives_mission_sort"
  ON "mission_objectives" ("missionId", "sortOrder");

CREATE TABLE IF NOT EXISTS "user_mission_progress" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId" int NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "missionId" uuid NOT NULL REFERENCES "missions"("id") ON DELETE CASCADE,
  "periodKey" varchar(64) NOT NULL DEFAULT 'all',
  "progress" jsonb NOT NULL DEFAULT '{}',
  "loginDays" jsonb NOT NULL DEFAULT '[]',
  "completed" boolean NOT NULL DEFAULT false,
  "claimed" boolean NOT NULL DEFAULT false,
  "completedAt" TIMESTAMPTZ,
  "claimedAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "UQ_user_mission_progress_user_mission_period"
    UNIQUE ("userId", "missionId", "periodKey")
);

CREATE INDEX IF NOT EXISTS "IDX_user_mission_progress_user_period"
  ON "user_mission_progress" ("userId", "periodKey");
