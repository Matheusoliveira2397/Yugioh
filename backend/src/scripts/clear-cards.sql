-- Apagar todas as cartas e dados relacionados
-- Execute este script no seu banco de dados PostgreSQL

-- Apagar dados relacionados primeiro (devido a foreign keys)
DELETE FROM deck_cards;
DELETE FROM user_cards;
DELETE FROM shop_items;

-- Apagar todas as cartas
DELETE FROM cards;

-- Verificar se foi apagado
SELECT COUNT(*) as total_cards FROM cards;













