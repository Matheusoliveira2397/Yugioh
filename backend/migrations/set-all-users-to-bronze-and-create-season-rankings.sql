-- Migration: Colocar todos os usuários existentes na divisão Bronze e criar rankings da season
-- Este script garante que todos os usuários tenham um ranking da season ativa com divisão Bronze

-- 1. Buscar a season ativa
DO $$
DECLARE
    active_season_id UUID;
    user_record RECORD;
    ranking_exists BOOLEAN;
BEGIN
    -- Buscar season ativa
    SELECT id INTO active_season_id
    FROM seasons
    WHERE "isActive" = true
    ORDER BY "createdAt" DESC
    LIMIT 1;

    -- Se não houver season ativa, buscar a mais recente
    IF active_season_id IS NULL THEN
        SELECT id INTO active_season_id
        FROM seasons
        ORDER BY "createdAt" DESC
        LIMIT 1;
    END IF;

    -- Se ainda não houver season, não fazer nada
    IF active_season_id IS NULL THEN
        RAISE NOTICE 'Nenhuma season encontrada. Pulando atualização.';
        RETURN;
    END IF;

    RAISE NOTICE 'Usando season: %', active_season_id;

    -- 2. Para cada usuário, criar ou atualizar ranking da season
    FOR user_record IN SELECT id FROM users LOOP
        -- Verificar se já existe ranking
        SELECT EXISTS(
            SELECT 1 FROM season_rankings
            WHERE "seasonId" = active_season_id
            AND "userId" = user_record.id
        ) INTO ranking_exists;

        IF ranking_exists THEN
            -- Atualizar divisão para Bronze se não estiver
            UPDATE season_rankings
            SET division = 'Bronze'
            WHERE "seasonId" = active_season_id
            AND "userId" = user_record.id
            AND division != 'Bronze';
            
            RAISE NOTICE 'Ranking atualizado para usuário % - divisão Bronze', user_record.id;
        ELSE
            -- Criar novo ranking com divisão Bronze
            INSERT INTO season_rankings (
                id,
                "seasonId",
                "userId",
                "seasonScore",
                wins,
                losses,
                rank,
                division,
                "divisionPoints",
                "createdAt",
                "updatedAt"
            ) VALUES (
                gen_random_uuid(),
                active_season_id,
                user_record.id,
                0,
                0,
                0,
                0,
                'Bronze',
                0,
                NOW(),
                NOW()
            );
            
            RAISE NOTICE 'Ranking criado para usuário % - divisão Bronze', user_record.id;
        END IF;
    END LOOP;

    RAISE NOTICE 'Migração concluída!';
END $$;
