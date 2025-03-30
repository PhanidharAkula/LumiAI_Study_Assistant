CREATE TABLE IF NOT EXISTS public.conversations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  class_id UUID NOT NULL REFERENCES public.classes(id),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  document_ids UUID[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Create indexes for faster queries
CREATE INDEX idx_conversations_class_id ON public.conversations(class_id);
CREATE INDEX idx_conversations_user_id ON public.conversations(user_id);

-- Set up Row Level Security
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;

-- Create policy for user access
CREATE POLICY "Users can manage their own conversations"
ON public.conversations
FOR ALL
USING (user_id = auth.uid());
