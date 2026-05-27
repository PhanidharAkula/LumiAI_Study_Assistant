-- Add session_id to conversations table to group messages from the same chat session
ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS session_id TEXT;

-- Add index on session_id for faster querying of related conversations
CREATE INDEX IF NOT EXISTS idx_conversations_session_id ON public.conversations(session_id);

-- Add comment explaining the purpose of the column
COMMENT ON COLUMN public.conversations.session_id IS 'Groups conversations from the same chat session';
