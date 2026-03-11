-- Nível mínimo para inscrição no torneio (mata-mata)
ALTER TABLE "tournaments"
ADD COLUMN IF NOT EXISTS "minLevel" INTEGER NOT NULL DEFAULT 1;
