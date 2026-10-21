-- Marca admin: efeito da carta implementado corretamente
ALTER TABLE "cards"
ADD COLUMN IF NOT EXISTS "effectVerified" boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS "IDX_cards_effectVerified" ON "cards"("effectVerified");
