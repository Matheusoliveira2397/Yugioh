-- Alterar o tipo da coluna icon para suportar caminhos de imagens
ALTER TABLE "site_tabs" 
ALTER COLUMN "icon" TYPE VARCHAR(255);

