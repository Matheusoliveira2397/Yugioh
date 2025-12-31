-- ============================================
-- MIGRATION: Atualizar sistema de skins para cartas
-- ============================================
-- Esta migration atualiza o sistema para usar:
-- - name: compartilhado entre skins (define o efeito)
-- - idCarta: único para cada skin (diferencia versões)
-- ============================================

-- 1. Remover coluna skinId se existir (migração da versão antiga)
ALTER TABLE "cards" 
DROP COLUMN IF EXISTS "skinId";

-- 2. Remover constraint única composta se existir
DROP INDEX IF EXISTS "IDX_cards_idCarta_skinId_unique";

-- 3. Remover índice de skinId se existir
DROP INDEX IF EXISTS "IDX_cards_skinId";

-- 4. Garantir que idCarta seja único
-- Primeiro, remover constraint antiga se existir
ALTER TABLE "cards" 
DROP CONSTRAINT IF EXISTS "cards_idCarta_key";

-- Criar constraint UNIQUE para idCarta
ALTER TABLE "cards" 
ADD CONSTRAINT "cards_idCarta_key" UNIQUE ("idCarta");

-- 5. Criar índice para name (para buscar cartas pelo nome - efeitos)
CREATE INDEX IF NOT EXISTS "IDX_cards_name" ON "cards"("name");

-- 6. Criar índice para idCarta (se não existir)
CREATE INDEX IF NOT EXISTS "IDX_cards_idCarta" ON "cards"("idCarta");

-- ============================================
-- VERIFICAÇÃO
-- ============================================
-- Execute estas queries para verificar se a migration foi aplicada corretamente:
-- 
-- SELECT column_name, data_type 
-- FROM information_schema.columns 
-- WHERE table_name = 'cards' AND column_name IN ('idCarta', 'name', 'skinId');
--
-- SELECT constraint_name, constraint_type 
-- FROM information_schema.table_constraints 
-- WHERE table_name = 'cards' AND constraint_name LIKE '%idCarta%';
-- ============================================

