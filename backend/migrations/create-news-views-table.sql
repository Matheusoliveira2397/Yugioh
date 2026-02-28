-- ============================================
-- Migration: Criar tabela news_views para rastrear notícias vistas pelos usuários
-- Execute este script no seu banco de dados PostgreSQL
-- ============================================

-- Criar tabela news_views
-- Nota: O TypeORM usa camelCase para os nomes das colunas
CREATE TABLE IF NOT EXISTS "news_views" (
    "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "userId" INTEGER NOT NULL,
    "newsId" UUID NOT NULL,
    "viewedAt" TIMESTAMP DEFAULT NOW(),
    CONSTRAINT "FK_news_views_user" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE,
    CONSTRAINT "FK_news_views_news" FOREIGN KEY ("newsId") REFERENCES "news"("id") ON DELETE CASCADE,
    CONSTRAINT "UQ_news_views_user_news" UNIQUE ("userId", "newsId")
);

-- Criar índices para melhorar performance
CREATE INDEX IF NOT EXISTS "IDX_news_views_userId" ON "news_views"("userId");
CREATE INDEX IF NOT EXISTS "IDX_news_views_newsId" ON "news_views"("newsId");

-- Verificar se a tabela foi criada corretamente
SELECT table_name 
FROM information_schema.tables 
WHERE table_name = 'news_views';

-- Se a query acima retornar uma linha, a tabela foi criada com sucesso!

