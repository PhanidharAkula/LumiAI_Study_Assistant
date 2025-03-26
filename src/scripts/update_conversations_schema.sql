-- Update conversations table to store document references
ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS document_ids UUID[] DEFAULT '{}';

-- Add index for faster queries on document references
CREATE INDEX IF NOT EXISTS idx_conversations_document_ids ON public.conversations USING GIN (document_ids);

-- Add conversation_id to files table if you want to track which files were created by the AI
ALTER TABLE public.files ADD COLUMN IF NOT EXISTS conversation_id UUID REFERENCES public.conversations(id);
