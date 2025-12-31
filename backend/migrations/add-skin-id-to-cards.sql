-- ============================================
-- MIGRATION: Adicionar sistema de skins para cartas
-- ============================================
-- Esta migration adiciona o campo skinId para permitir múltiplas versões (skins)
-- da mesma carta com diferentes imagens, preços e disponibilidade na loja.
-- ============================================

-- 1. Remover a constraint UNIQUE de idCarta (será substituída por constraint composta)
ALTER TABLE "cards" 
DROP CONSTRAINT IF EXISTS "cards_idCarta_key";

-- 2. Adicionar coluna skinId com valor padrão 'original'
ALTER TABLE "cards" 
ADD COLUMN IF NOT EXISTS "skinId" VARCHAR(255) DEFAULT 'original';

-- 3. Atualizar todas as cartas existentes para terem skinId = 'original'
UPDATE "cards" 
SET "skinId" = 'original' 
WHERE "skinId" IS NULL OR "skinId" = '';

-- 4. Tornar skinId NOT NULL após atualizar todos os registros
ALTER TABLE "cards" 
ALTER COLUMN "skinId" SET NOT NULL;

-- 5. Criar índice para skinId (para melhorar performance em queries)
CREATE INDEX IF NOT EXISTS "IDX_cards_skinId" ON "cards"("skinId");

-- 6. Criar constraint única composta (idCarta + skinId devem ser únicos juntos)
-- Isso permite múltiplas skins da mesma carta (mesmo idCarta, diferentes skinId)
CREATE UNIQUE INDEX IF NOT EXISTS "IDX_cards_idCarta_skinId_unique" 
ON "cards"("idCarta", "skinId");

-- 7. Criar índice composto adicional para melhorar queries por idCarta
CREATE INDEX IF NOT EXISTS "IDX_cards_idCarta" ON "cards"("idCarta");

-- ============================================
-- VERIFICAÇÃO
-- ============================================
-- Execute estas queries para verificar se a migration foi aplicada corretamente:
-- 
-- SELECT column_name, data_type, column_default, is_nullable 
-- FROM information_schema.columns 
-- WHERE table_name = 'cards' AND column_name = 'skinId';
--
-- SELECT COUNT(*) as total_cards, 
--        COUNT(CASE WHEN "skinId" = 'original' THEN 1 END) as original_skins
-- FROM "cards";
-- ============================================

