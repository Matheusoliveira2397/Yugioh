-- Criar tabela de histórico de duelos
-- Esta tabela armazena informações permanentes sobre duelos finalizados
-- Independente da tabela duels, para não perder dados se duelos forem deletados

-- Criar enums se não existirem
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'duelhistoryresult') THEN
        CREATE TYPE "duelhistoryresult" AS ENUM ('WIN', 'LOSS', 'DRAW', 'CANCELLED');
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'duelhistoryorigin') THEN
        CREATE TYPE "duelhistoryorigin" AS ENUM ('RANDOM', 'ARENA', 'TOURNAMENT', 'CHAT', 'OTHER');
    END IF;
END $$;

-- Criar tabela duel_history
CREATE TABLE IF NOT EXISTS duel_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    player_id INTEGER NOT NULL,
    opponent_id INTEGER NOT NULL,
    opponent_nickname VARCHAR(255),
    opponent_username VARCHAR(255),
    opponent_clan_tag VARCHAR(50),
    result duelhistoryresult NOT NULL,
    origin duelhistoryorigin NOT NULL,
    player_life_points INTEGER DEFAULT 0,
    opponent_life_points INTEGER DEFAULT 0,
    score_earned NUMERIC(10, 1) DEFAULT 0,
    turns INTEGER DEFAULT 0,
    duration INTEGER DEFAULT 0,
    original_duel_id VARCHAR(255),
    finished_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT fk_player FOREIGN KEY (player_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_opponent FOREIGN KEY (opponent_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Criar índices para melhor performance
CREATE INDEX IF NOT EXISTS idx_duel_history_player_id ON duel_history(player_id);
CREATE INDEX IF NOT EXISTS idx_duel_history_opponent_id ON duel_history(opponent_id);
CREATE INDEX IF NOT EXISTS idx_duel_history_finished_at ON duel_history(finished_at);
CREATE INDEX IF NOT EXISTS idx_duel_history_player_finished ON duel_history(player_id, finished_at);
CREATE INDEX IF NOT EXISTS idx_duel_history_opponent_finished ON duel_history(opponent_id, finished_at);

-- Comentários
COMMENT ON TABLE duel_history IS 'Histórico permanente de duelos finalizados, independente da tabela duels';
COMMENT ON COLUMN duel_history.score_earned IS 'Score ganho neste duelo (1.7 para random, 2.0 para arena, etc)';
COMMENT ON COLUMN duel_history.original_duel_id IS 'ID do duelo original na tabela duels (pode ser null se o duelo foi deletado)';
