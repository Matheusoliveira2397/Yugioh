-- Pacotes de cartas: chance de dropar créditos e pool de valores
ALTER TABLE "loot_boxes"
  ADD COLUMN IF NOT EXISTS "creditChance" numeric(6,2) NOT NULL DEFAULT 0;

ALTER TABLE "loot_boxes"
  ADD COLUMN IF NOT EXISTS "creditRewards" jsonb NOT NULL DEFAULT '[]'::jsonb;
