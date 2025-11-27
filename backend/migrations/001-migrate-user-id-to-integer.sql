-- Migração: Converter user.id de UUID para INTEGER
-- IMPORTANTE: Este script vai DELETAR todos os dados existentes!
-- Execute apenas se você quiser resetar o banco de dados.

-- 1. Deletar todas as foreign keys que referenciam users.id
ALTER TABLE IF EXISTS user_cards DROP CONSTRAINT IF EXISTS "FK_user_cards_user";
ALTER TABLE IF EXISTS decks DROP CONSTRAINT IF EXISTS "FK_decks_user";
ALTER TABLE IF EXISTS transactions DROP CONSTRAINT IF EXISTS "FK_transactions_user";
ALTER TABLE IF EXISTS season_rankings DROP CONSTRAINT IF EXISTS "FK_season_rankings_user";
ALTER TABLE IF EXISTS group_members DROP CONSTRAINT IF EXISTS "FK_group_members_user";
ALTER TABLE IF EXISTS groups DROP CONSTRAINT IF EXISTS "FK_groups_leader";
ALTER TABLE IF EXISTS friendships DROP CONSTRAINT IF EXISTS "FK_friendships_user";
ALTER TABLE IF EXISTS friendships DROP CONSTRAINT IF EXISTS "FK_friendships_friend";
ALTER TABLE IF EXISTS private_messages DROP CONSTRAINT IF EXISTS "FK_private_messages_sender";
ALTER TABLE IF EXISTS private_messages DROP CONSTRAINT IF EXISTS "FK_private_messages_receiver";
ALTER TABLE IF EXISTS tournament_participants DROP CONSTRAINT IF EXISTS "FK_tournament_participants_user";
ALTER TABLE IF EXISTS tournaments DROP CONSTRAINT IF EXISTS "FK_tournaments_createdBy";
ALTER TABLE IF EXISTS tournament_matches DROP CONSTRAINT IF EXISTS "FK_tournament_matches_player1";
ALTER TABLE IF EXISTS tournament_matches DROP CONSTRAINT IF EXISTS "FK_tournament_matches_player2";
ALTER TABLE IF EXISTS tournament_matches DROP CONSTRAINT IF EXISTS "FK_tournament_matches_winner";
ALTER TABLE IF EXISTS duels DROP CONSTRAINT IF EXISTS "FK_duels_player1";
ALTER TABLE IF EXISTS duels DROP CONSTRAINT IF EXISTS "FK_duels_player2";
ALTER TABLE IF EXISTS duels DROP CONSTRAINT IF EXISTS "FK_duels_winner";
ALTER TABLE IF EXISTS duel_logs DROP CONSTRAINT IF EXISTS "FK_duel_logs_user";

-- 2. Deletar todas as tabelas dependentes (ou truncar se quiser manter estrutura)
TRUNCATE TABLE user_cards CASCADE;
TRUNCATE TABLE deck_cards CASCADE;
TRUNCATE TABLE decks CASCADE;
TRUNCATE TABLE transactions CASCADE;
TRUNCATE TABLE season_rankings CASCADE;
TRUNCATE TABLE group_members CASCADE;
TRUNCATE TABLE groups CASCADE;
TRUNCATE TABLE friendships CASCADE;
TRUNCATE TABLE private_messages CASCADE;
TRUNCATE TABLE tournament_participants CASCADE;
TRUNCATE TABLE tournament_matches CASCADE;
TRUNCATE TABLE tournaments CASCADE;
TRUNCATE TABLE duel_logs CASCADE;
TRUNCATE TABLE duels CASCADE;

-- 3. Deletar todos os usuários
TRUNCATE TABLE users CASCADE;

-- 4. Alterar a coluna id de users para INTEGER
ALTER TABLE users DROP CONSTRAINT IF EXISTS "users_pkey";
ALTER TABLE users ALTER COLUMN id DROP DEFAULT;
ALTER TABLE users ALTER COLUMN id TYPE INTEGER USING 0;
DROP SEQUENCE IF EXISTS users_id_seq;
CREATE SEQUENCE users_id_seq;
ALTER TABLE users ALTER COLUMN id SET DEFAULT nextval('users_id_seq');
ALTER TABLE users ADD PRIMARY KEY (id);
ALTER SEQUENCE users_id_seq OWNED BY users.id;

-- 5. Alterar todas as colunas userId para INTEGER
ALTER TABLE user_cards ALTER COLUMN "userId" TYPE INTEGER USING 0;
ALTER TABLE decks ALTER COLUMN "userId" TYPE INTEGER USING 0;
ALTER TABLE transactions ALTER COLUMN "userId" TYPE INTEGER USING 0;
ALTER TABLE season_rankings ALTER COLUMN "userId" TYPE INTEGER USING 0;
ALTER TABLE group_members ALTER COLUMN "userId" TYPE INTEGER USING 0;
ALTER TABLE groups ALTER COLUMN "leaderId" TYPE INTEGER USING 0;
ALTER TABLE friendships ALTER COLUMN user_id TYPE INTEGER USING 0;
ALTER TABLE friendships ALTER COLUMN friend_id TYPE INTEGER USING 0;
ALTER TABLE private_messages ALTER COLUMN sender_id TYPE INTEGER USING 0;
ALTER TABLE private_messages ALTER COLUMN receiver_id TYPE INTEGER USING 0;
ALTER TABLE tournament_participants ALTER COLUMN "userId" TYPE INTEGER USING 0;
ALTER TABLE tournaments ALTER COLUMN "createdBy" TYPE INTEGER USING 0;
ALTER TABLE tournament_matches ALTER COLUMN "player1Id" TYPE INTEGER USING 0;
ALTER TABLE tournament_matches ALTER COLUMN "player2Id" TYPE INTEGER USING 0;
ALTER TABLE tournament_matches ALTER COLUMN "winnerId" TYPE INTEGER USING NULL;
ALTER TABLE duels ALTER COLUMN player1_id TYPE INTEGER USING 0;
ALTER TABLE duels ALTER COLUMN player2_id TYPE INTEGER USING 0;
ALTER TABLE duels ALTER COLUMN "winnerId" TYPE INTEGER USING NULL;
ALTER TABLE duel_logs ALTER COLUMN user_id TYPE INTEGER USING 0;

-- 6. Recriar as foreign keys
ALTER TABLE user_cards ADD CONSTRAINT "FK_user_cards_user" FOREIGN KEY ("userId") REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE decks ADD CONSTRAINT "FK_decks_user" FOREIGN KEY ("userId") REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE transactions ADD CONSTRAINT "FK_transactions_user" FOREIGN KEY ("userId") REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE season_rankings ADD CONSTRAINT "FK_season_rankings_user" FOREIGN KEY ("userId") REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE group_members ADD CONSTRAINT "FK_group_members_user" FOREIGN KEY ("userId") REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE groups ADD CONSTRAINT "FK_groups_leader" FOREIGN KEY ("leaderId") REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE friendships ADD CONSTRAINT "FK_friendships_user" FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE friendships ADD CONSTRAINT "FK_friendships_friend" FOREIGN KEY (friend_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE private_messages ADD CONSTRAINT "FK_private_messages_sender" FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE private_messages ADD CONSTRAINT "FK_private_messages_receiver" FOREIGN KEY (receiver_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE tournament_participants ADD CONSTRAINT "FK_tournament_participants_user" FOREIGN KEY ("userId") REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE tournaments ADD CONSTRAINT "FK_tournaments_createdBy" FOREIGN KEY ("createdBy") REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE tournament_matches ADD CONSTRAINT "FK_tournament_matches_player1" FOREIGN KEY ("player1Id") REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE tournament_matches ADD CONSTRAINT "FK_tournament_matches_player2" FOREIGN KEY ("player2Id") REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE tournament_matches ADD CONSTRAINT "FK_tournament_matches_winner" FOREIGN KEY ("winnerId") REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE duels ADD CONSTRAINT "FK_duels_player1" FOREIGN KEY (player1_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE duels ADD CONSTRAINT "FK_duels_player2" FOREIGN KEY (player2_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE duels ADD CONSTRAINT "FK_duels_winner" FOREIGN KEY ("winnerId") REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE duel_logs ADD CONSTRAINT "FK_duel_logs_user" FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

