-- ============================================
-- MIGRATION: Criar tabela social_media
-- ============================================
-- Esta migration cria a tabela social_media para armazenar
-- links de redes sociais do jogo
-- ============================================

-- social_media
CREATE TABLE IF NOT EXISTS "social_media" (
    "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "platform" VARCHAR(50) UNIQUE NOT NULL,
    "url" VARCHAR(255) NOT NULL,
    "label" VARCHAR(100),
    "icon" VARCHAR(255),
    "order" INTEGER DEFAULT 0,
    "isActive" BOOLEAN DEFAULT true,
    "createdAt" TIMESTAMP DEFAULT NOW(),
    "updatedAt" TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "IDX_social_media_isActive" ON "social_media"("isActive");
CREATE INDEX IF NOT EXISTS "IDX_social_media_order" ON "social_media"("order");

-- ============================================
-- FIM DA MIGRATION
-- ============================================

