-- Add title column to conversations table
ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS title TEXT;

-- Update existing conversations to have a default title
UPDATE public.conversations SET title = 'Previous Conversation' WHERE title IS NULL;

-- Add comment to explain column purpose
COMMENT ON COLUMN public.conversations.title IS 'AI-generated title summarizing the conversation';
