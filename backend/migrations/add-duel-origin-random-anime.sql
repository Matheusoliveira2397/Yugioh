-- Add RANDOM_ANIME to duelorigin enum (fix: invalid input value for enum duelorigin: "RANDOM_ANIME")
-- Run this if you get the error and TypeORM migrations have not been applied.
-- Safe to run multiple times: adding an existing enum value is ignored in PostgreSQL 10+.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumtypid = (SELECT oid FROM pg_type WHERE typname = 'duelorigin')
    AND enumlabel = 'RANDOM_ANIME'
  ) THEN
    ALTER TYPE duelorigin ADD VALUE 'RANDOM_ANIME';
  END IF;
END
$$;
