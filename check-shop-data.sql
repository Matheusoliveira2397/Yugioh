-- Script de verificação e ajuste de dados para testes

-- 1. Verificar dados do usuário admin2
SELECT username, email, credits, cash, gems, wins, losses, rating 
FROM users 
WHERE username = 'admin2';

-- 2. Verificar cartas disponíveis na loja
SELECT 
    id, 
    name, 
    type,
    rarity,
    "priceCredits", 
    "priceCash", 
    "isForSale", 
    "isActive" 
FROM cards 
WHERE "isForSale" = true AND "isActive" = true;

-- 3. Se precisar adicionar mais créditos/cash (descomente abaixo):
-- UPDATE users 
-- SET credits = 5000, cash = 100.00
-- WHERE username = 'admin2';

-- 4. Se precisar ativar todas as cartas para a loja (descomente abaixo):
-- UPDATE cards 
-- SET "isForSale" = true, "isActive" = true;
