-- =============================================================================
-- APAGAR APENAS OS DADOS SIMULADOS (seed)
-- =============================================================================
-- Execute este ficheiro quando quiser remover só o que foi criado pelo
-- seed-stress.sql. Pode rodar pelo terminal ou colar no editor SQL.
-- =============================================================================

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
