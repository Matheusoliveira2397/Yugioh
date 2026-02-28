-- Migration: Adicionar campos de divisão de cash do grupo
-- Esta migration adiciona campos para configurar a divisão automática de cash do grupo

-- Adicionar colunas se não existirem
ALTER TABLE groups 
ADD COLUMN IF NOT EXISTS cash_division_day_of_week INTEGER NULL,
ADD COLUMN IF NOT EXISTS cash_division_time VARCHAR(10) NULL,
ADD COLUMN IF NOT EXISTS cash_division_default_members INTEGER NULL,
ADD COLUMN IF NOT EXISTS cash_division_members INTEGER NULL;

-- Comentários para documentação
COMMENT ON COLUMN groups.cash_division_day_of_week IS 'Dia da semana para divisão (0=Domingo, 1=Segunda, ..., 6=Sábado)';
COMMENT ON COLUMN groups.cash_division_time IS 'Horário da divisão no formato HH:mm (ex: 14:30)';
COMMENT ON COLUMN groups.cash_division_default_members IS 'Número padrão de membros para divisão (configurado pelo admin)';
COMMENT ON COLUMN groups.cash_division_members IS 'Número de membros para divisão (configurado pelo líder do grupo)';

