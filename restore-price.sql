-- Restaurar preço normal da carta
UPDATE cards 
SET "priceCredits" = 20, "priceCash" = 25000.00
WHERE id = 'dc4ac519-f323-4691-bfbd-9412f1ef7d79';

-- Verificar
SELECT name, "priceCredits", "priceCash", "isForSale" 
FROM cards 
WHERE id = 'dc4ac519-f323-4691-bfbd-9412f1ef7d79';
