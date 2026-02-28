-- Log de ações do duelo na própria tabela duels (mesmo fluxo que player1_field/player2_field)
ALTER TABLE duels ADD COLUMN IF NOT EXISTS action_logs JSONB DEFAULT '[]';

-- Comentário para documentação
COMMENT ON COLUMN duels.action_logs IS 'Array de logs de ações do duelo [{ id, userId, username, clanTag?, actionType, message, createdAt }]';
