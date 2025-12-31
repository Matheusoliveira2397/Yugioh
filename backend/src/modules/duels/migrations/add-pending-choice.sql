-- Migration: Add pending_choice column to duels table
-- This column stores the state of pending choices (Confiscation, GracefulCharity, ForcefulSentry)
-- to allow restoring modals after reconnection or game closure

ALTER TABLE duels 
ADD COLUMN IF NOT EXISTS pending_choice JSONB NULL;

-- Add comment to explain the column
COMMENT ON COLUMN duels.pending_choice IS 'Stores pending choice state for card effects that require player input (Confiscation, GracefulCharity, ForcefulSentry). Format: {type, userId, turnWhenStarted, phaseWhenStarted, data}';

