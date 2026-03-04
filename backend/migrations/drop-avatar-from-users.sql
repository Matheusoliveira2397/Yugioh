-- Remove coluna avatar da tabela users (apenas foto de perfil - profileImage)
ALTER TABLE users DROP COLUMN IF EXISTS avatar;
