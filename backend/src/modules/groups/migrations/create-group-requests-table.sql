-- Criar tabela de solicitações de entrada em grupos privados
-- Esta tabela armazena solicitações de usuários para entrar em grupos privados

-- Criar enum se não existir
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'grouprequeststatus') THEN
        CREATE TYPE "grouprequeststatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED');
    END IF;
END $$;

-- Criar tabela group_requests
CREATE TABLE IF NOT EXISTS group_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id UUID NOT NULL,
    user_id INTEGER NOT NULL,
    status grouprequeststatus NOT NULL DEFAULT 'PENDING',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT fk_group FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE,
    CONSTRAINT fk_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT unique_group_user_request UNIQUE (group_id, user_id)
);

-- Criar índices para melhor performance
CREATE INDEX IF NOT EXISTS idx_group_requests_group_id ON group_requests(group_id);
CREATE INDEX IF NOT EXISTS idx_group_requests_user_id ON group_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_group_requests_status ON group_requests(status);
CREATE INDEX IF NOT EXISTS idx_group_requests_group_status ON group_requests(group_id, status);

