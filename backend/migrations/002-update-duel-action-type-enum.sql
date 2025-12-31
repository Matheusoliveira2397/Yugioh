-- ============================================
-- ATUALIZAR ENUM DuelActionType
-- ============================================
-- Adiciona novos valores ao enum DuelActionType para suportar
-- todos os tipos de ações de cartas especiais

-- Adicionar novos valores ao enum (PostgreSQL não permite adicionar múltiplos valores de uma vez em uma transação)
DO $$ 
BEGIN
    -- Special Summons
    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'SPECIAL_SUMMON_CYBER_DRAGON' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'DuelActionType')) THEN
        ALTER TYPE "DuelActionType" ADD VALUE 'SPECIAL_SUMMON_CYBER_DRAGON';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'SPECIAL_SUMMON_CHAOS_SORCERER' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'DuelActionType')) THEN
        ALTER TYPE "DuelActionType" ADD VALUE 'SPECIAL_SUMMON_CHAOS_SORCERER';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'SPECIAL_SUMMON_DARK_ARMED_DRAGON' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'DuelActionType')) THEN
        ALTER TYPE "DuelActionType" ADD VALUE 'SPECIAL_SUMMON_DARK_ARMED_DRAGON';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'SPECIAL_SUMMON_RED_EYES_DARKNESS_METAL_DRAGON' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'DuelActionType')) THEN
        ALTER TYPE "DuelActionType" ADD VALUE 'SPECIAL_SUMMON_RED_EYES_DARKNESS_METAL_DRAGON';
    END IF;
    
    -- Card Effects
    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'DARK_ARMED_DRAGON_EFFECT' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'DuelActionType')) THEN
        ALTER TYPE "DuelActionType" ADD VALUE 'DARK_ARMED_DRAGON_EFFECT';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'CHAOS_SORCERER_EFFECT' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'DuelActionType')) THEN
        ALTER TYPE "DuelActionType" ADD VALUE 'CHAOS_SORCERER_EFFECT';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'EXILED_FORCE_EFFECT' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'DuelActionType')) THEN
        ALTER TYPE "DuelActionType" ADD VALUE 'EXILED_FORCE_EFFECT';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'CYBER_STEIN_EFFECT' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'DuelActionType')) THEN
        ALTER TYPE "DuelActionType" ADD VALUE 'CYBER_STEIN_EFFECT';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'RED_EYES_DARKNESS_METAL_DRAGON_EFFECT' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'DuelActionType')) THEN
        ALTER TYPE "DuelActionType" ADD VALUE 'RED_EYES_DARKNESS_METAL_DRAGON_EFFECT';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'REINFORCEMENT_OF_THE_ARMY' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'DuelActionType')) THEN
        ALTER TYPE "DuelActionType" ADD VALUE 'REINFORCEMENT_OF_THE_ARMY';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'LAST_WILL_EFFECT' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'DuelActionType')) THEN
        ALTER TYPE "DuelActionType" ADD VALUE 'LAST_WILL_EFFECT';
    END IF;
END $$;

