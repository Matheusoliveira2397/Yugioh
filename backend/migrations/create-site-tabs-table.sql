-- Criar tabela site_tabs para gerenciar abas do site
CREATE TABLE IF NOT EXISTS "site_tabs" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "key" VARCHAR(255) UNIQUE NOT NULL,
    "label" VARCHAR(255) NOT NULL,
    "route" VARCHAR(255) NOT NULL,
    "icon" VARCHAR(10) NOT NULL,
    "isActive" BOOLEAN DEFAULT true,
    "order" INTEGER DEFAULT 0,
    "createdAt" TIMESTAMP DEFAULT NOW(),
    "updatedAt" TIMESTAMP DEFAULT NOW()
);

-- Criar índice para melhorar performance
CREATE INDEX IF NOT EXISTS "IDX_site_tabs_key" ON "site_tabs"("key");
CREATE INDEX IF NOT EXISTS "IDX_site_tabs_isActive" ON "site_tabs"("isActive");
CREATE INDEX IF NOT EXISTS "IDX_site_tabs_order" ON "site_tabs"("order");

