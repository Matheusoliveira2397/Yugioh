-- Atualizar ícone do torneio para usar a imagem Torneio.png
UPDATE "site_tabs" 
SET "icon" = '/images/Icones/Torneio.png', 
    "updatedAt" = NOW()
WHERE "key" = 'tournaments';

