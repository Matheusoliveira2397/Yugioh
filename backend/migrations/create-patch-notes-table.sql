-- Patch notes: atualizações de correções, cartas, etc.
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS "patch_notes" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "title" VARCHAR(255) NOT NULL,
  "content" TEXT NOT NULL,
  "version" VARCHAR(64) NULL,
  "category" VARCHAR(32) NOT NULL DEFAULT 'other',
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "isPinned" BOOLEAN NOT NULL DEFAULT false,
  "authorId" INTEGER NOT NULL,
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT "FK_patch_notes_author" FOREIGN KEY ("authorId")
    REFERENCES "users"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "IDX_patch_notes_createdAt" ON "patch_notes"("createdAt");
CREATE INDEX IF NOT EXISTS "IDX_patch_notes_isActive" ON "patch_notes"("isActive");

INSERT INTO "site_tabs" ("id", "key", "label", "route", "icon", "order", "isActive", "createdAt", "updatedAt")
SELECT gen_random_uuid(), 'patch-notes', 'Patch Notes', '/patch-notes', '📋', 85, true, NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM "site_tabs" WHERE "key" = 'patch-notes');
