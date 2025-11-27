-- Atualizar carta para 0 créditos (grátis)
UPDATE cards 
SET "priceCredits" = 0, "priceCash" = 0
WHERE id = 'dc4ac519-f323-4691-bfbd-9412f1ef7d79';

-- Verificar se atualizou
SELECT name, "priceCredits", "priceCash", "isForSale" 
FROM cards 
WHERE id = 'dc4ac519-f323-4691-bfbd-9412f1ef7d79';
