SELECT id, name, "isForSale", "priceCoins", "priceCredits", "priceCash" 
FROM cards 
ORDER BY "createdAt" DESC 
LIMIT 5;
