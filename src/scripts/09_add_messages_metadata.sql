-- Add messages_metadata column to conversations table
-- This stores the contextFiles and files arrays for each user message
-- so that they persist across sessions

ALTER TABLE conversations
ADD COLUMN IF NOT EXISTS messages_metadata TEXT;

-- Add a comment explaining the column
COMMENT ON COLUMN conversations.messages_metadata IS 'JSON string containing metadata for each message (contextFiles, files arrays)';
