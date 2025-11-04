-- Adicionar cartas existentes à loja
INSERT INTO shop_items (
  card_id, 
  currency, 
  price, 
  discount, 
  "isAvailable", 
  "isFeatured", 
  "isLimited", 
  stock
)
SELECT 
  id, 
  'coins', 
  CASE 
    WHEN rarity = 'Common' THEN 100
    WHEN rarity = 'Rare' THEN 500
    WHEN rarity = 'Super Rare' THEN 1500
    WHEN rarity = 'Ultra Rare' THEN 5000
    WHEN rarity = 'Secret Rare' THEN 10000
    WHEN rarity = 'Legendary' THEN 50000
    ELSE 100
  END, 
  0, 
  true, 
  false, 
  false, 
  null
FROM cards
WHERE id NOT IN (
  SELECT card_id 
  FROM shop_items 
  WHERE card_id IS NOT NULL
);
