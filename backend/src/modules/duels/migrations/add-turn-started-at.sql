-- Migration: Adicionar campo turn_started_at na tabela duels
-- Este campo rastreia quando o turno atual começou para calcular o tempo restante

ALTER TABLE duels 
ADD COLUMN IF NOT EXISTS turn_started_at TIMESTAMP NULL;

-- Atualizar duelos existentes que estão em progresso para ter o timestamp atual
-- (assumindo que o turno começou agora)
UPDATE duels 
SET turn_started_at = NOW() 
WHERE status = 'IN_PROGRESS' AND turn_started_at IS NULL;
















