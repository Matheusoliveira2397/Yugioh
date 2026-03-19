-- ============================================
-- MIGRATION COMPLETA: Schema do Yu-Gi-Oh! Online
-- ============================================
-- Execute este arquivo no Supabase SQL Editor
-- Ordem: Execute tudo de uma vez ou seção por seção
-- ============================================

-- ============================================
-- EXTENSÕES
-- ============================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- ENUMS
-- ============================================

-- UserRole
DO $$ BEGIN
    CREATE TYPE "UserRole" AS ENUM ('PLAYER', 'ADMIN', 'MASTER');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- CardType
DO $$ BEGIN
    CREATE TYPE "CardType" AS ENUM ('Monster', 'Spell', 'Trap');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- CardAttribute
DO $$ BEGIN
    CREATE TYPE "CardAttribute" AS ENUM ('DARK', 'LIGHT', 'WATER', 'FIRE', 'EARTH', 'WIND', 'DIVINE');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- CardRarity
DO $$ BEGIN
    CREATE TYPE "CardRarity" AS ENUM ('Common', 'Rare', 'Super Rare', 'Ultra Rare', 'Secret Rare', 'Legendary');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- MonsterType
DO $$ BEGIN
    CREATE TYPE "MonsterType" AS ENUM ('Normal', 'Effect', 'Ritual', 'Fusion', 'Synchro', 'Xyz', 'Pendulum', 'Link');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- MonsterRace
DO $$ BEGIN
    CREATE TYPE "MonsterRace" AS ENUM (
        'Warrior', 'Spellcaster', 'Fairy', 'Fiend', 'Zombie', 'Machine', 'Aqua', 'Pyro', 
        'Rock', 'Winged Beast', 'Plant', 'Insect', 'Thunder', 'Dragon', 'Beast', 
        'Beast-Warrior', 'Dinosaur', 'Fish', 'Sea Serpent', 'Reptile', 'Psychic', 
        'Divine-Beast', 'Creator God', 'Wyrm', 'Cyberse'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- SpellType
DO $$ BEGIN
    CREATE TYPE "SpellType" AS ENUM ('Normal', 'Continuous', 'Equip', 'Field', 'Quick-Play', 'Ritual');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- TrapType
DO $$ BEGIN
    CREATE TYPE "TrapType" AS ENUM ('Normal', 'Continuous', 'Counter');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- DuelStatus
DO $$ BEGIN
    CREATE TYPE "DuelStatus" AS ENUM ('WAITING', 'IN_PROGRESS', 'FINISHED', 'CANCELLED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- DuelResult
DO $$ BEGIN
    CREATE TYPE "DuelResult" AS ENUM ('PLAYER1_WIN', 'PLAYER2_WIN', 'DRAW', 'CANCELLED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- TurnPhase
DO $$ BEGIN
    CREATE TYPE "TurnPhase" AS ENUM ('DRAW', 'STANDBY', 'MAIN1', 'BATTLE', 'MAIN2', 'END');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- DuelOrigin
DO $$ BEGIN
    CREATE TYPE "DuelOrigin" AS ENUM ('RANDOM', 'RANDOM_ANIME', 'CHAT', 'TOURNAMENT', 'ARENA', 'OTHER');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- CurrencyType
DO $$ BEGIN
    CREATE TYPE "CurrencyType" AS ENUM ('credits', 'cash');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- TransactionType
DO $$ BEGIN
    CREATE TYPE "TransactionType" AS ENUM ('PURCHASE', 'REWARD', 'REFUND', 'TRANSFER', 'DUEL_WIN', 'DUEL_LOSS', 'TOURNAMENT_PRIZE', 'SEASON_PRIZE', 'ARENA_PRIZE', 'GIFT', 'ADMIN_ADJUSTMENT');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Division
DO $$ BEGIN
    CREATE TYPE "Division" AS ENUM ('Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond', 'Master', 'Legendary');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- GroupRole
DO $$ BEGIN
    CREATE TYPE "GroupRole" AS ENUM ('Leader', 'Co-Leader', 'Elder', 'Member');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- TournamentStatus
DO $$ BEGIN
    CREATE TYPE "TournamentStatus" AS ENUM ('scheduled', 'registration_open', 'registration_closed', 'in_progress', 'finished', 'cancelled');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- TournamentFormat
DO $$ BEGIN
    CREATE TYPE "TournamentFormat" AS ENUM ('single_elimination', 'double_elimination', 'swiss', 'round_robin');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- FriendshipStatus
DO $$ BEGIN
    CREATE TYPE "FriendshipStatus" AS ENUM ('pending', 'accepted', 'rejected', 'blocked');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- DuelHistoryResult
DO $$ BEGIN
    CREATE TYPE "DuelHistoryResult" AS ENUM ('WIN', 'LOSS', 'DRAW', 'CANCELLED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- DuelHistoryOrigin
DO $$ BEGIN
    CREATE TYPE "DuelHistoryOrigin" AS ENUM ('RANDOM', 'ARENA', 'TOURNAMENT', 'CHAT', 'OTHER');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- DuelActionType
DO $$ BEGIN
    CREATE TYPE "DuelActionType" AS ENUM (
        'DRAW_CARD', 'SUMMON_MONSTER', 'SET_MONSTER', 'ACTIVATE_SPELL', 'SET_SPELL_TRAP',
        'ATTACK', 'DIRECT_ATTACK', 'CHANGE_POSITION', 'END_TURN', 'PHASE_CHANGE',
        'LIFE_CHANGE', 'CARD_DESTROYED', 'CARD_TO_GRAVEYARD', 'DUEL_START', 'DUEL_END'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- AchievementType
DO $$ BEGIN
    CREATE TYPE "AchievementType" AS ENUM ('VICTORIES', 'RATING', 'DUELS_PLAYED', 'SEASON_WINNER', 'TOURNAMENT_WINNER', 'PERFECT_WIN', 'COMEBACK', 'STREAK');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- ShopItemCurrency
DO $$ BEGIN
    CREATE TYPE "ShopItemCurrency" AS ENUM ('coins', 'credits', 'gems', 'cash');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- ParticipantStatus
DO $$ BEGIN
    CREATE TYPE "ParticipantStatus" AS ENUM ('registered', 'active', 'eliminated', 'withdrawn');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- MatchStatus
DO $$ BEGIN
    CREATE TYPE "MatchStatus" AS ENUM ('scheduled', 'ready', 'in_progress', 'finished', 'walkover', 'cancelled');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- ============================================
-- TABELAS
-- ============================================

-- users
CREATE TABLE IF NOT EXISTS "users" (
    "id" SERIAL PRIMARY KEY,
    "nickname" VARCHAR(255) UNIQUE NOT NULL,
    "username" VARCHAR(255) UNIQUE NOT NULL,
    "email" VARCHAR(255) UNIQUE NOT NULL,
    "password" VARCHAR(255) NOT NULL,
    "role" "UserRole" DEFAULT 'PLAYER',
    "winsGeral" INTEGER DEFAULT 0,
    "lossesGeral" INTEGER DEFAULT 0,
    "winsSeason" INTEGER DEFAULT 0,
    "lossesSeason" INTEGER DEFAULT 0,
    "credits" INTEGER DEFAULT 0,
    "cash" INTEGER DEFAULT 0,
    "level" INTEGER DEFAULT 1,
    "experience" INTEGER DEFAULT 0,
    "total_score" DECIMAL(10,1) DEFAULT 0,
    "profileImage" VARCHAR(255) DEFAULT '/images/default.png',
    "isOnline" BOOLEAN DEFAULT true,
    "isBanned" BOOLEAN DEFAULT false,
    "banReason" TEXT,
    "lastLogin" TIMESTAMP,
    "lastIpAddress" VARCHAR(255),
    "avatar" VARCHAR(255),
    "isEmailVerified" BOOLEAN DEFAULT false,
    "clanTag" VARCHAR(255),
    "biography" TEXT,
    "playerClass" VARCHAR(255) DEFAULT 'Novato',
    "equippedPlaymatId" VARCHAR(100),
    "equippedPlaymatImage" VARCHAR(255),
    "equippedSkinId" VARCHAR(100),
    "equippedSkinImage" VARCHAR(255),
    "equippedDeckName" VARCHAR(100),
    "createdAt" TIMESTAMP DEFAULT NOW(),
    "updatedAt" TIMESTAMP DEFAULT NOW()
);

-- cards
CREATE TABLE IF NOT EXISTS "cards" (
    "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "idCarta" VARCHAR(255) UNIQUE NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "cardImage" VARCHAR(255),
    "type" "CardType" NOT NULL,
    "monsterType" "MonsterType",
    "attribute" "CardAttribute",
    "race" "MonsterRace",
    "spellType" "SpellType",
    "trapType" "TrapType",
    "archetype" VARCHAR(255),
    "level" INTEGER,
    "rank" INTEGER,
    "atk" INTEGER,
    "def" INTEGER,
    "rarity" "CardRarity" DEFAULT 'Common',
    "isActive" BOOLEAN DEFAULT true,
    "isBanned" BOOLEAN DEFAULT false,
    "maxCopiesInDeck" INTEGER DEFAULT 3,
    "priceCredits" INTEGER,
    "priceCash" DECIMAL(10,2),
    "isForSale" BOOLEAN DEFAULT false,
    "createdAt" TIMESTAMP DEFAULT NOW(),
    "updatedAt" TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "IDX_cards_isActive" ON "cards"("isActive");
CREATE INDEX IF NOT EXISTS "IDX_cards_isForSale" ON "cards"("isForSale");
CREATE INDEX IF NOT EXISTS "IDX_cards_isActive_isForSale" ON "cards"("isActive", "isForSale");
CREATE INDEX IF NOT EXISTS "IDX_cards_rarity_createdAt" ON "cards"("rarity", "createdAt");

-- user_cards
CREATE TABLE IF NOT EXISTS "user_cards" (
    "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "userId" INTEGER NOT NULL,
    "cardId" UUID NOT NULL,
    "quantity" INTEGER DEFAULT 1,
    "acquiredBy" VARCHAR(50) DEFAULT 'PURCHASE',
    "createdAt" TIMESTAMP DEFAULT NOW(),
    "updatedAt" TIMESTAMP DEFAULT NOW(),
    CONSTRAINT "FK_user_cards_user" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE,
    CONSTRAINT "FK_user_cards_card" FOREIGN KEY ("cardId") REFERENCES "cards"("id") ON DELETE CASCADE
);

-- decks
CREATE TABLE IF NOT EXISTS "decks" (
    "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "name" VARCHAR(255) NOT NULL,
    "userId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP DEFAULT NOW(),
    "updatedAt" TIMESTAMP DEFAULT NOW(),
    CONSTRAINT "FK_decks_user" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE
);

-- deck_cards
CREATE TABLE IF NOT EXISTS "deck_cards" (
    "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "deckId" UUID NOT NULL,
    "cardId" UUID NOT NULL,
    CONSTRAINT "FK_deck_cards_deck" FOREIGN KEY ("deckId") REFERENCES "decks"("id") ON DELETE CASCADE,
    CONSTRAINT "FK_deck_cards_card" FOREIGN KEY ("cardId") REFERENCES "cards"("id") ON DELETE CASCADE
);

-- duels
CREATE TABLE IF NOT EXISTS "duels" (
    "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "player1_id" INTEGER NOT NULL,
    "player2_id" INTEGER NOT NULL,
    "player1_nickname" VARCHAR(255),
    "player2_nickname" VARCHAR(255),
    "status" "DuelStatus" DEFAULT 'WAITING',
    "player1_life_points" INTEGER DEFAULT 8000,
    "player2_life_points" INTEGER DEFAULT 8000,
    "result" "DuelResult",
    "winner_id" INTEGER,
    "player1_field" JSONB,
    "player2_field" JSONB,
    "current_turn" INTEGER DEFAULT 1,
    "turn_counter" INTEGER DEFAULT 1,
    "current_phase" "TurnPhase" DEFAULT 'DRAW',
    "duel_time" INTEGER DEFAULT 0,
    "turn_time" INTEGER DEFAULT 90,
    "turn_started_at" TIMESTAMP,
    "origin" "DuelOrigin" DEFAULT 'OTHER',
    "pending_choice" JSONB,
    "created_at" TIMESTAMP DEFAULT NOW(),
    "updated_at" TIMESTAMP DEFAULT NOW(),
    "finished_at" TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "IDX_duels_player1_status" ON "duels"("player1_id", "status");
CREATE INDEX IF NOT EXISTS "IDX_duels_player2_status" ON "duels"("player2_id", "status");
CREATE INDEX IF NOT EXISTS "IDX_duels_status_updatedAt" ON "duels"("status", "updated_at");
CREATE INDEX IF NOT EXISTS "IDX_duels_status" ON "duels"("status");

-- duel_logs
CREATE TABLE IF NOT EXISTS "duel_logs" (
    "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "duel_id" UUID NOT NULL,
    "user_id" INTEGER,
    "actionType" "DuelActionType" NOT NULL,
    "message" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP DEFAULT NOW(),
    CONSTRAINT "FK_duel_logs_duel" FOREIGN KEY ("duel_id") REFERENCES "duels"("id") ON DELETE CASCADE,
    CONSTRAINT "FK_duel_logs_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL
);

-- duel_history
CREATE TABLE IF NOT EXISTS "duel_history" (
    "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "playerId" INTEGER NOT NULL,
    "opponentId" INTEGER NOT NULL,
    "opponentNickname" VARCHAR(255),
    "opponentUsername" VARCHAR(255),
    "opponentClanTag" VARCHAR(50),
    "result" "DuelHistoryResult" NOT NULL,
    "origin" "DuelHistoryOrigin" NOT NULL,
    "playerLifePoints" INTEGER DEFAULT 0,
    "opponentLifePoints" INTEGER DEFAULT 0,
    "scoreEarned" DECIMAL(10,1) DEFAULT 0,
    "turns" INTEGER DEFAULT 0,
    "duration" INTEGER DEFAULT 0,
    "originalDuelId" VARCHAR(255),
    "finishedAt" TIMESTAMP DEFAULT NOW(),
    CONSTRAINT "FK_duel_history_player" FOREIGN KEY ("playerId") REFERENCES "users"("id") ON DELETE CASCADE,
    CONSTRAINT "FK_duel_history_opponent" FOREIGN KEY ("opponentId") REFERENCES "users"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "IDX_duel_history_playerId_finishedAt" ON "duel_history"("playerId", "finishedAt");
CREATE INDEX IF NOT EXISTS "IDX_duel_history_opponentId_finishedAt" ON "duel_history"("opponentId", "finishedAt");
CREATE INDEX IF NOT EXISTS "IDX_duel_history_playerId" ON "duel_history"("playerId");
CREATE INDEX IF NOT EXISTS "IDX_duel_history_opponentId" ON "duel_history"("opponentId");

-- transactions
CREATE TABLE IF NOT EXISTS "transactions" (
    "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "userId" INTEGER NOT NULL,
    "currencyType" "CurrencyType" NOT NULL,
    "amount" INTEGER NOT NULL,
    "type" "TransactionType" NOT NULL,
    "description" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP DEFAULT NOW(),
    CONSTRAINT "FK_transactions_user" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "IDX_transactions_user_createdAt" ON "transactions"("userId", "createdAt");

-- seasons
CREATE TABLE IF NOT EXISTS "seasons" (
    "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "name" VARCHAR(255) NOT NULL,
    "seasonNumber" INTEGER NOT NULL,
    "startDate" TIMESTAMP NOT NULL,
    "endDate" TIMESTAMP NOT NULL,
    "isActive" BOOLEAN DEFAULT true,
    "prizes" JSONB,
    "divisionPrizes" JSONB,
    "createdAt" TIMESTAMP DEFAULT NOW(),
    "updatedAt" TIMESTAMP DEFAULT NOW()
);

-- season_rankings
CREATE TABLE IF NOT EXISTS "season_rankings" (
    "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "seasonId" UUID NOT NULL,
    "userId" INTEGER NOT NULL,
    "seasonScore" INTEGER DEFAULT 0,
    "wins" INTEGER DEFAULT 0,
    "losses" INTEGER DEFAULT 0,
    "rank" INTEGER DEFAULT 0,
    "division" "Division" DEFAULT 'Bronze',
    "divisionPoints" INTEGER DEFAULT 0,
    "trophy" VARCHAR(255),
    "createdAt" TIMESTAMP DEFAULT NOW(),
    "updatedAt" TIMESTAMP DEFAULT NOW(),
    CONSTRAINT "FK_season_rankings_season" FOREIGN KEY ("seasonId") REFERENCES "seasons"("id") ON DELETE CASCADE,
    CONSTRAINT "FK_season_rankings_user" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE,
    CONSTRAINT "UQ_season_rankings_season_user" UNIQUE ("seasonId", "userId")
);

CREATE INDEX IF NOT EXISTS "IDX_season_rankings_season_user" ON "season_rankings"("seasonId", "userId");
CREATE INDEX IF NOT EXISTS "IDX_season_rankings_season_score" ON "season_rankings"("seasonId", "seasonScore");

-- groups
CREATE TABLE IF NOT EXISTS "groups" (
    "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "name" VARCHAR(255) UNIQUE NOT NULL,
    "description" TEXT,
    "tag" VARCHAR(255),
    "logo" VARCHAR(255),
    "banner" VARCHAR(255),
    "leaderId" INTEGER NOT NULL,
    "totalScore" INTEGER DEFAULT 0,
    "maxMembers" INTEGER DEFAULT 50,
    "isPublic" BOOLEAN DEFAULT true,
    "isActive" BOOLEAN DEFAULT true,
    "createdAt" TIMESTAMP DEFAULT NOW(),
    "updatedAt" TIMESTAMP DEFAULT NOW(),
    CONSTRAINT "FK_groups_leader" FOREIGN KEY ("leaderId") REFERENCES "users"("id") ON DELETE SET NULL
);

-- group_members
CREATE TABLE IF NOT EXISTS "group_members" (
    "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "groupId" UUID NOT NULL,
    "userId" INTEGER NOT NULL,
    "role" "GroupRole" DEFAULT 'Member',
    "weeklyScore" INTEGER DEFAULT 0,
    "weeklyScoreResetAt" TIMESTAMP,
    "seasonScore" INTEGER DEFAULT 0,
    "totalScore" INTEGER DEFAULT 0,
    "contributedWins" INTEGER DEFAULT 0,
    "contributedLosses" INTEGER DEFAULT 0,
    "isActive" BOOLEAN DEFAULT true,
    "joinedAt" TIMESTAMP DEFAULT NOW(),
    "updatedAt" TIMESTAMP DEFAULT NOW(),
    CONSTRAINT "FK_group_members_group" FOREIGN KEY ("groupId") REFERENCES "groups"("id") ON DELETE CASCADE,
    CONSTRAINT "FK_group_members_user" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE,
    CONSTRAINT "UQ_group_members_group_user" UNIQUE ("groupId", "userId")
);

CREATE INDEX IF NOT EXISTS "IDX_group_members_group_user" ON "group_members"("groupId", "userId");

-- group_messages
CREATE TABLE IF NOT EXISTS "group_messages" (
    "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "groupId" UUID NOT NULL,
    "userId" INTEGER NOT NULL,
    "message" TEXT NOT NULL,
    "createdAt" TIMESTAMP DEFAULT NOW(),
    CONSTRAINT "FK_group_messages_group" FOREIGN KEY ("groupId") REFERENCES "groups"("id") ON DELETE CASCADE,
    CONSTRAINT "FK_group_messages_user" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS "IDX_group_messages_group_createdAt" ON "group_messages"("groupId", "createdAt");

-- tournaments
CREATE TABLE IF NOT EXISTS "tournaments" (
    "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "name" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "format" "TournamentFormat" DEFAULT 'single_elimination',
    "maxParticipants" INTEGER NOT NULL,
    "currentParticipants" INTEGER DEFAULT 0,
    "status" "TournamentStatus" DEFAULT 'scheduled',
    "registrationOpenAt" TIMESTAMP NOT NULL,
    "registrationCloseAt" TIMESTAMP NOT NULL,
    "startAt" TIMESTAMP NOT NULL,
    "finishedAt" TIMESTAMP,
    "prizeFirst" INTEGER DEFAULT 0,
    "prizeSecond" INTEGER DEFAULT 0,
    "prizeThird" INTEGER DEFAULT 0,
    "createdBy" INTEGER NOT NULL,
    "entryFee" INTEGER DEFAULT 0,
    "turnDuration" INTEGER DEFAULT 90,
    "matchDuration" INTEGER DEFAULT 1800,
    "autoStartMatches" BOOLEAN DEFAULT true,
    "autoAdvancePhases" BOOLEAN DEFAULT true,
    "bannerImage" VARCHAR(255),
    "currentRound" INTEGER DEFAULT 1,
    "banlist" JSON,
    "winnerId" INTEGER,
    "createdAt" TIMESTAMP DEFAULT NOW(),
    "updatedAt" TIMESTAMP DEFAULT NOW(),
    CONSTRAINT "FK_tournaments_createdBy" FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE SET NULL,
    CONSTRAINT "FK_tournaments_winner" FOREIGN KEY ("winnerId") REFERENCES "users"("id") ON DELETE SET NULL
);

-- tournament_participants
CREATE TABLE IF NOT EXISTS "tournament_participants" (
    "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "tournamentId" UUID NOT NULL,
    "userId" INTEGER NOT NULL,
    "status" "ParticipantStatus" DEFAULT 'registered',
    "wins" INTEGER DEFAULT 0,
    "losses" INTEGER DEFAULT 0,
    "draws" INTEGER DEFAULT 0,
    "seed" INTEGER,
    "finalPosition" INTEGER,
    "registeredAt" TIMESTAMP DEFAULT NOW(),
    CONSTRAINT "FK_tournament_participants_tournament" FOREIGN KEY ("tournamentId") REFERENCES "tournaments"("id") ON DELETE CASCADE,
    CONSTRAINT "FK_tournament_participants_user" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE
);

-- tournament_matches
CREATE TABLE IF NOT EXISTS "tournament_matches" (
    "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "tournamentId" UUID NOT NULL,
    "round" INTEGER NOT NULL,
    "matchNumber" INTEGER NOT NULL,
    "player1Id" INTEGER,
    "player2Id" INTEGER,
    "winnerId" INTEGER,
    "status" "MatchStatus" DEFAULT 'scheduled',
    "duelId" UUID,
    "scheduledAt" TIMESTAMP NOT NULL,
    "startedAt" TIMESTAMP,
    "finishedAt" TIMESTAMP,
    "nextMatchId" UUID,
    "createdAt" TIMESTAMP DEFAULT NOW(),
    "updatedAt" TIMESTAMP DEFAULT NOW(),
    CONSTRAINT "FK_tournament_matches_tournament" FOREIGN KEY ("tournamentId") REFERENCES "tournaments"("id") ON DELETE CASCADE,
    CONSTRAINT "FK_tournament_matches_player1" FOREIGN KEY ("player1Id") REFERENCES "users"("id") ON DELETE SET NULL,
    CONSTRAINT "FK_tournament_matches_player2" FOREIGN KEY ("player2Id") REFERENCES "users"("id") ON DELETE SET NULL,
    CONSTRAINT "FK_tournament_matches_winner" FOREIGN KEY ("winnerId") REFERENCES "users"("id") ON DELETE SET NULL,
    CONSTRAINT "FK_tournament_matches_duel" FOREIGN KEY ("duelId") REFERENCES "duels"("id") ON DELETE SET NULL
);

-- friendships
CREATE TABLE IF NOT EXISTS "friendships" (
    "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "user_id" INTEGER NOT NULL,
    "friend_id" INTEGER NOT NULL,
    "status" "FriendshipStatus" DEFAULT 'pending',
    "createdAt" TIMESTAMP DEFAULT NOW(),
    CONSTRAINT "FK_friendships_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE,
    CONSTRAINT "FK_friendships_friend" FOREIGN KEY ("friend_id") REFERENCES "users"("id") ON DELETE CASCADE
);

-- private_messages
CREATE TABLE IF NOT EXISTS "private_messages" (
    "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "sender_id" INTEGER NOT NULL,
    "receiver_id" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "read" BOOLEAN DEFAULT false,
    "createdAt" TIMESTAMP DEFAULT NOW(),
    CONSTRAINT "FK_private_messages_sender" FOREIGN KEY ("sender_id") REFERENCES "users"("id") ON DELETE CASCADE,
    CONSTRAINT "FK_private_messages_receiver" FOREIGN KEY ("receiver_id") REFERENCES "users"("id") ON DELETE CASCADE
);

-- news
CREATE TABLE IF NOT EXISTS "news" (
    "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "title" VARCHAR(255) NOT NULL,
    "content" TEXT NOT NULL,
    "image" VARCHAR(255),
    "isActive" BOOLEAN DEFAULT true,
    "isPinned" BOOLEAN DEFAULT false,
    "authorId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP DEFAULT NOW(),
    "updatedAt" TIMESTAMP DEFAULT NOW(),
    CONSTRAINT "FK_news_author" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE SET NULL
);

-- achievements
CREATE TABLE IF NOT EXISTS "achievements" (
    "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "userId" INTEGER NOT NULL,
    "type" "AchievementType" NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "icon" VARCHAR(255),
    "metadata" JSONB,
    "unlockedAt" TIMESTAMP DEFAULT NOW(),
    CONSTRAINT "FK_achievements_user" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE
);

-- challenge_arenas
CREATE TABLE IF NOT EXISTS "challenge_arenas" (
    "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "name" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "startTime" TIMESTAMP NOT NULL,
    "endTime" TIMESTAMP NOT NULL,
    "isActive" BOOLEAN DEFAULT true,
    "participants" INTEGER DEFAULT 0,
    "scoreMultiplier" REAL DEFAULT 1.5,
    "bonusGems" INTEGER DEFAULT 50,
    "config" JSONB DEFAULT '{}',
    "createdAt" TIMESTAMP DEFAULT NOW(),
    "updatedAt" TIMESTAMP DEFAULT NOW()
);

-- playmats
CREATE TABLE IF NOT EXISTS "playmats" (
    "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "name" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "image" VARCHAR(255) NOT NULL,
    "priceCredits" INTEGER,
    "priceCash" INTEGER,
    "isActive" BOOLEAN DEFAULT true,
    "isForSale" BOOLEAN DEFAULT false,
    "stock" INTEGER,
    "createdAt" TIMESTAMP DEFAULT NOW(),
    "updatedAt" TIMESTAMP DEFAULT NOW()
);

-- sleeves
CREATE TABLE IF NOT EXISTS "sleeves" (
    "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "name" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "image" VARCHAR(255) NOT NULL,
    "priceCredits" INTEGER,
    "priceCash" INTEGER,
    "isActive" BOOLEAN DEFAULT true,
    "isForSale" BOOLEAN DEFAULT false,
    "stock" INTEGER,
    "createdAt" TIMESTAMP DEFAULT NOW(),
    "updatedAt" TIMESTAMP DEFAULT NOW()
);

-- shop_items
CREATE TABLE IF NOT EXISTS "shop_items" (
    "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "card_id" UUID NOT NULL,
    "currency" "ShopItemCurrency" DEFAULT 'coins',
    "price" INTEGER NOT NULL,
    "discount" INTEGER DEFAULT 0,
    "isAvailable" BOOLEAN DEFAULT true,
    "isFeatured" BOOLEAN DEFAULT false,
    "isLimited" BOOLEAN DEFAULT false,
    "stock" INTEGER,
    "availableUntil" TIMESTAMP,
    "createdAt" TIMESTAMP DEFAULT NOW(),
    "updatedAt" TIMESTAMP DEFAULT NOW(),
    CONSTRAINT "FK_shop_items_card" FOREIGN KEY ("card_id") REFERENCES "cards"("id") ON DELETE CASCADE
);

-- initial_decks
CREATE TABLE IF NOT EXISTS "initial_decks" (
    "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "name" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN DEFAULT true,
    "createdAt" TIMESTAMP DEFAULT NOW(),
    "updatedAt" TIMESTAMP DEFAULT NOW()
);

-- initial_deck_cards
CREATE TABLE IF NOT EXISTS "initial_deck_cards" (
    "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "initialDeckId" UUID NOT NULL,
    "cardId" UUID NOT NULL,
    "quantity" INTEGER DEFAULT 1,
    CONSTRAINT "FK_initial_deck_cards_deck" FOREIGN KEY ("initialDeckId") REFERENCES "initial_decks"("id") ON DELETE CASCADE,
    CONSTRAINT "FK_initial_deck_cards_card" FOREIGN KEY ("cardId") REFERENCES "cards"("id") ON DELETE CASCADE
);

-- social_media
CREATE TABLE IF NOT EXISTS "social_media" (
    "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "platform" VARCHAR(50) UNIQUE NOT NULL,
    "url" VARCHAR(255) NOT NULL,
    "label" VARCHAR(100),
    "icon" VARCHAR(255),
    "order" INTEGER DEFAULT 0,
    "isActive" BOOLEAN DEFAULT true,
    "createdAt" TIMESTAMP DEFAULT NOW(),
    "updatedAt" TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "IDX_social_media_isActive" ON "social_media"("isActive");
CREATE INDEX IF NOT EXISTS "IDX_social_media_order" ON "social_media"("order");

-- ============================================
-- ÍNDICES ADICIONAIS PARA PERFORMANCE
-- ============================================

CREATE INDEX IF NOT EXISTS "IDX_users_total_score" ON "users"("total_score" DESC);
CREATE INDEX IF NOT EXISTS "IDX_users_email" ON "users"("email");
CREATE INDEX IF NOT EXISTS "IDX_users_username" ON "users"("username");
CREATE INDEX IF NOT EXISTS "IDX_users_nickname" ON "users"("nickname");

CREATE INDEX IF NOT EXISTS "IDX_season_rankings_division" ON "season_rankings"("seasonId", "division", "seasonScore" DESC);

-- ============================================
-- FIM DA MIGRATION
-- ============================================

-- Verificar tabelas criadas
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_type = 'BASE TABLE'
ORDER BY table_name;
