-- Adicionar carta na loja manualmente
INSERT INTO shop_items (id, card_id, currency, price, discount, "isAvailable", "isFeatured", "isLimited", stock, "createdAt", "updatedAt")
VALUES (
  gen_random_uuid(),
  'd520fcae-6037-4edb-835a-9f4a9d5c9149',
  'coins',
  1000,
  0,
  true,
  false,
  false,
  NULL,
  NOW(),
  NOW()
);

-- Verificar
SELECT si.id, c.name, si.price, si.currency, si."isAvailable"
FROM shop_items si
JOIN cards c ON c.id = si.card_id;
