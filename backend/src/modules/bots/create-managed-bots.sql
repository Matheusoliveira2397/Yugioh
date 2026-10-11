CREATE TABLE IF NOT EXISTS managed_bots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id integer NOT NULL UNIQUE REFERENCES users(id),
  name varchar(100) NOT NULL,
  difficulty varchar(16) NOT NULL DEFAULT 'NORMAL' CHECK (difficulty IN ('EASY','NORMAL','HARD','EXPERT')),
  level integer NOT NULL DEFAULT 1 CHECK (level BETWEEN 1 AND 100),
  source_deck_id uuid NOT NULL,
  bot_deck_id uuid NOT NULL,
  participation varchar(16) NOT NULL DEFAULT 'NONE' CHECK (participation IN ('NONE','RANDOM')),
  interval_minutes integer NOT NULL DEFAULT 30 CHECK (interval_minutes BETWEEN 1 AND 10080),
  enabled boolean NOT NULL DEFAULT false,
  last_queued_at timestamp NULL,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);
