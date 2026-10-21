-- Moldura do avatar (obelisk | ra | slifer)
ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "equippedAvatarFrame" character varying(32) NULL;
