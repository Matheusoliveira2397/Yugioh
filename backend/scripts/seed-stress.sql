-- =============================================================================
-- SCRIPT ÚNICO: SEED (dados simulados) + LIMPEZA (apagar só os simulados)
-- =============================================================================
--
-- COMO RODAR:
--
-- 1) PELO TERMINAL:
--    psql "postgresql://user:senha@host:5432/nome_do_banco" -f backend/scripts/seed-stress.sql
--    Ou: cd backend && psql "$DATABASE_URL" -f scripts/seed-stress.sql
--
-- 2) COLAR NO EDITOR SQL (pgAdmin, DBeaver, etc.):
--    Copie TODO o conteúdo e cole no editor. Execute. (Pode demorar minutos.)
--
-- 3) SÓ APAGAR OS DADOS SIMULADOS:
--    Copie apenas a "PARTE 2 - LIMPEZA" (no final do ficheiro) e execute.
--
-- Para alterar a quantidade de usuários: substitua 100 por outro número nos
-- generate_series e no comentário N_USERS abaixo.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- N_USERS = 100 (troque 100 por outro valor se quiser)
-- =============================================================================
-- PARTE 1 - INSERIR DADOS SIMULADOS
-- =============================================================================

INSERT INTO users (
  nickname, username, email, password, role, "profileImage",
  "winsGeral", "lossesGeral", "winsSeason", "lossesSeason",
  credits, cash, level, "total_score", "tournament_points",
  "isOnline", "isBanned", "isEmailVerified", "playerClass", division,
  "ownedSleeveIds", "ownedPlaymatIds", "createdAt", "updatedAt"
)
SELECT
  'seed_user_' || i,
  'seed_u_' || i || '_' || substr(md5(random()::text), 1, 8),
  'seed' || i || '+' || substr(md5(random()::text), 1, 8) || '@seed.local',
  crypt('Senha123!', gen_salt('bf', 10)),
  'PLAYER'::"UserRole",
  '/avatars/seed_' || i || '.png',
  (random() * 80)::int, (random() * 60)::int, 0, 0,
  (random() * 500)::int, 0, 1, 0, 0,
  false, false, true, 'Novato', 'Bronze', '[]', '[]', NOW(), NOW()
FROM generate_series(1, 100) i;

INSERT INTO cards (id, "idCarta", name, description, "cardImage", type, rarity, "isActive", "isBanned", "maxCopiesInDeck", "isForSale", "createdAt", "updatedAt")
SELECT gen_random_uuid(), 'SEED-' || g, 'Carta Seed ' || g, 'Descrição seed ' || g, '/images/cards/default.png',
  (array['Monster','Spell','Trap'])[1 + (random()*3)::int],
  (array['Common','Rare','Super Rare','Ultra Rare','Secret Rare','Legendary'])[1 + (random()*6)::int],
  true, false, 3, random() > 0.5, NOW(), NOW()
FROM generate_series(1, 1000) g;

INSERT INTO user_cards ("userId", "cardId", quantity, "acquiredBy", "createdAt", "updatedAt")
SELECT u.id, (SELECT id FROM cards WHERE "idCarta" LIKE 'SEED-%' ORDER BY random() LIMIT 1), 1 + (random()*2)::int,
  (array['PURCHASE','REWARD','DROP','GIFT'])[1 + (random()*4)::int], NOW(), NOW()
FROM users u CROSS JOIN generate_series(1, 500) g
WHERE u.nickname LIKE 'seed_user_%';

INSERT INTO decks (id, name, "userId", "createdAt", "updatedAt")
SELECT gen_random_uuid(), 'Deck Seed ' || u.rn || '-' || d.n, u.id, NOW(), NOW()
FROM (SELECT id, row_number() OVER (ORDER BY id) AS rn FROM users WHERE nickname LIKE 'seed_user_%') u
CROSS JOIN generate_series(1, 3) d(n);

INSERT INTO deck_cards ("deckId", "cardId", "isExtraDeck")
SELECT deck.id, (SELECT id FROM cards WHERE "idCarta" LIKE 'SEED-%' ORDER BY random() LIMIT 1), (g > 35)
FROM (SELECT id FROM decks WHERE name LIKE 'Deck Seed %') deck
CROSS JOIN generate_series(1, 40) g;

-- Grupos (5 clãs) com líderes distintos
INSERT INTO groups (id, name, description, tag, "leaderId", "totalScore", "maxMembers", "isPublic", "isActive", "createdAt", "updatedAt")
SELECT gen_random_uuid(), 'Clã Seed ' || g, 'Clã stress ' || g, 'S' || lpad(g::text, 2, '0'),
  (SELECT id FROM users WHERE nickname LIKE 'seed_user_%' ORDER BY id LIMIT 1 OFFSET (g-1) * 20), 0, 50, true, true, NOW(), NOW()
FROM generate_series(1, 5) g;

-- Cada usuário em um grupo (rotativo)
DO $$
DECLARE
  gids uuid[];
  u RECORD;
  i int := 0;
BEGIN
  SELECT array_agg(id ORDER BY id) INTO gids FROM groups WHERE name LIKE 'Clã Seed %';
  FOR u IN SELECT id FROM users WHERE nickname LIKE 'seed_user_%' ORDER BY id
  LOOP
    i := i + 1;
    INSERT INTO group_members (id, "groupId", "userId", role, "weeklyScore", "seasonScore", "totalScore", "isActive", "joinedAt", "updatedAt")
    VALUES (gen_random_uuid(), gids[1 + (i - 1) % array_length(gids, 1)], u.id, 'Member'::"GroupRole", (random()*500)::int, (random()*300)::int, (random()*1000)::int, true, NOW(), NOW());
  END LOOP;
END $$;

-- Amizades (cada user com até 8 amigos)
INSERT INTO friendships (id, user_id, friend_id, status, "createdAt")
SELECT gen_random_uuid(), u1.id, u2.id, 'accepted'::"FriendshipStatus", NOW()
FROM (SELECT id, row_number() OVER (ORDER BY id) rn FROM users WHERE nickname LIKE 'seed_user_%') u1
JOIN (SELECT id, row_number() OVER (ORDER BY id) rn FROM users WHERE nickname LIKE 'seed_user_%') u2 ON u2.rn > u1.rn AND u2.rn <= u1.rn + 8
WHERE u1.rn % 3 = 0;

-- Seasons
INSERT INTO seasons (id, name, "seasonNumber", "startDate", "endDate", "isActive", prizes, "createdAt", "updatedAt")
SELECT gen_random_uuid(), 'Temporada Seed ' || s, s, NOW() - (s * interval '90 days'), NOW() - (s * interval '90 days') + interval '60 days', (s = 1),
  '{"first":{"trophy":"gold","credits":500}}'::jsonb, NOW(), NOW()
FROM generate_series(1, 10) s;

INSERT INTO season_rankings (id, "seasonId", "userId", "seasonScore", wins, losses, rank, division, "divisionPoints", "createdAt", "updatedAt")
SELECT gen_random_uuid(), se.id, u.id, (random()*5000)::int, (random()*80)::int, (random()*60)::int, (row_number() OVER (PARTITION BY se.id ORDER BY random()))::int,
  (array['Bronze','Silver','Gold','Platinum','Diamond','Master','Legendary'])[1 + (random()*7)::int]::"Division", 0, NOW(), NOW()
FROM seasons se CROSS JOIN users u
WHERE se.name LIKE 'Temporada Seed %' AND u.nickname LIKE 'seed_user_%';

-- Duelos (2k duelos entre pares distintos de seed users)
WITH uid AS (SELECT id, nickname, row_number() OVER (ORDER BY id) rn FROM users WHERE nickname LIKE 'seed_user_%'),
     pairs AS (SELECT a.id a_id, a.nickname a_nick, b.id b_id, b.nickname b_nick
               FROM uid a JOIN uid b ON a.rn < b.rn ORDER BY random() LIMIT 2000)
INSERT INTO duels (id, player1_id, player2_id, player1_nickname, player2_nickname, status, player1_life_points, player2_life_points, result, winner_id, current_turn, turn_counter, current_phase, duel_time, turn_time, origin, created_at, updated_at, finished_at)
SELECT gen_random_uuid(), a_id, b_id, a_nick, b_nick, 'FINISHED'::"DuelStatus", 0, 8000, 'PLAYER2_WIN'::"DuelResult", b_id, 2, 15, 'END'::"TurnPhase", 600, 90, 'RANDOM'::"DuelOrigin", NOW() - (random()*interval '30 days'), NOW(), NOW()
FROM pairs;

-- Duel history (5k registos, pares aleatórios)
DO $$
DECLARE
  uid int[]; ucnt int; i int; p1 int; p2 int;
BEGIN
  SELECT array_agg(id) INTO uid FROM users WHERE nickname LIKE 'seed_user_%';
  ucnt := array_length(uid, 1);
  FOR i IN 1..5000 LOOP
    p1 := uid[1 + (random() * (ucnt-1))::int];
    p2 := uid[1 + (random() * (ucnt-1))::int];
    IF p1 = p2 THEN p2 := uid[1 + ((p1 + 1) % ucnt)]; END IF;
    INSERT INTO duel_history ("playerId", "opponentId", "opponentNickname", result, origin, "playerLifePoints", "opponentLifePoints", "scoreEarned", turns, duration, "finishedAt")
    SELECT p1, p2, (SELECT nickname FROM users WHERE id = p2), (array['WIN','LOSS','DRAW'])[1 + (random()*3)::int]::"DuelHistoryResult", 'RANDOM'::"DuelHistoryOrigin", (random()*8000)::int, (random()*8000)::int, (random()*20), (random()*30)::int, (random()*600)::int, NOW() - (random()*interval '60 days');
  END LOOP;
END $$;

-- Transações (50 por user)
INSERT INTO transactions (id, "userId", "currencyType", amount, type, description, "createdAt")
SELECT gen_random_uuid(), u.id, (array['credits','cash'])[1 + (random()*2)::int]::"CurrencyType", (random()*200 - 50)::int,
  (array['PURCHASE','REWARD','REFUND','TRANSFER','DUEL_WIN','GIFT'])[1 + (random()*6)::int]::"TransactionType", 'Seed payment ' || g, NOW() - (random()*interval '90 days')
FROM users u CROSS JOIN generate_series(1, 50) g
WHERE u.nickname LIKE 'seed_user_%';

-- Torneios
INSERT INTO tournaments (id, name, description, format, "maxParticipants", "currentParticipants", status, "registrationOpenAt", "registrationCloseAt", "startAt", "finishedAt", "prizeFirst", "prizeSecond", "prizeThird", "createdBy", "createdAt", "updatedAt")
SELECT gen_random_uuid(), 'Torneio Seed ' || t, 'Stress ' || t, 'single_elimination'::"TournamentFormat", 16, 16, 'finished'::"TournamentStatus",
  NOW() - interval '7 days', NOW() - interval '5 days', NOW() - interval '4 days', NOW(), 500, 300, 100,
  (SELECT id FROM users WHERE nickname LIKE 'seed_user_%' LIMIT 1), NOW(), NOW()
FROM generate_series(1, 10) t;

DO $$
DECLARE
  tr RECORD; uids int[]; j int;
BEGIN
  SELECT array_agg(id) INTO uids FROM users WHERE nickname LIKE 'seed_user_%';
  FOR tr IN SELECT id FROM tournaments WHERE name LIKE 'Torneio Seed %'
  LOOP
    FOR j IN 1..16 LOOP
      INSERT INTO tournament_participants (id, "tournamentId", "userId", status, wins, losses, seed, "finalPosition", "registeredAt")
      VALUES (gen_random_uuid(), tr.id, uids[1 + (random() * (array_length(uids,1)-1))::int], 'eliminated'::"ParticipantStatus", (random()*5)::int, (random()*3)::int, j, (random()*16)::int, NOW());
    END LOOP;
  END LOOP;
END $$;

INSERT INTO tournament_matches (id, "tournamentId", round, "matchNumber", status, "scheduledAt", "finishedAt", "createdAt", "updatedAt")
SELECT gen_random_uuid(), tr.id, 1, m, 'finished'::"MatchStatus", NOW(), NOW(), NOW(), NOW()
FROM tournaments tr CROSS JOIN generate_series(1, 8) m
WHERE tr.name LIKE 'Torneio Seed %';

UPDATE users u SET "clanTag" = g.tag FROM group_members gm JOIN groups g ON g.id = gm."groupId" WHERE gm."userId" = u.id AND u.nickname LIKE 'seed_user_%' AND g.name LIKE 'Clã Seed %';

-- =============================================================================
-- PARTE 2 - LIMPEZA (apagar APENAS os dados simulados)
-- =============================================================================
-- Para rodar SÓ a limpeza: copie da linha abaixo até ao fim (incluindo os DELETE)
-- e execute no editor SQL. Não execute a PARTE 1 antes.

/*
DELETE FROM tournament_matches WHERE "tournamentId" IN (SELECT id FROM tournaments WHERE name LIKE 'Torneio Seed %');
DELETE FROM tournament_participants WHERE "tournamentId" IN (SELECT id FROM tournaments WHERE name LIKE 'Torneio Seed %');
DELETE FROM tournaments WHERE name LIKE 'Torneio Seed %';
DELETE FROM transactions WHERE "userId" IN (SELECT id FROM users WHERE nickname LIKE 'seed_user_%');
DELETE FROM duel_history WHERE "playerId" IN (SELECT id FROM users WHERE nickname LIKE 'seed_user_%');
DELETE FROM duels WHERE player1_nickname LIKE 'seed_user_%';
DELETE FROM season_rankings WHERE "seasonId" IN (SELECT id FROM seasons WHERE name LIKE 'Temporada Seed %');
DELETE FROM seasons WHERE name LIKE 'Temporada Seed %';
DELETE FROM friendships WHERE user_id IN (SELECT id FROM users WHERE nickname LIKE 'seed_user_%');
DELETE FROM friendships WHERE friend_id IN (SELECT id FROM users WHERE nickname LIKE 'seed_user_%');
DELETE FROM group_members WHERE "userId" IN (SELECT id FROM users WHERE nickname LIKE 'seed_user_%');
DELETE FROM groups WHERE name LIKE 'Clã Seed %';
DELETE FROM deck_cards WHERE "deckId" IN (SELECT id FROM decks WHERE name LIKE 'Deck Seed %');
DELETE FROM user_cards WHERE "userId" IN (SELECT id FROM users WHERE nickname LIKE 'seed_user_%');
DELETE FROM decks WHERE name LIKE 'Deck Seed %';
DELETE FROM users WHERE nickname LIKE 'seed_user_%';
DELETE FROM cards WHERE "idCarta" LIKE 'SEED-%';
*/
