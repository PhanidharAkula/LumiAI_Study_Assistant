-- Run this in your Supabase SQL Editor

CREATE TABLE IF NOT EXISTS public.conversations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  class_id UUID NOT NULL REFERENCES public.classes(id),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  
  CONSTRAINT fk_class
    FOREIGN KEY (class_id)
    REFERENCES public.classes(id)
    ON DELETE CASCADE
);

-- Set up RLS policies
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;

-- Policy to allow users to insert conversations for classes they own
CREATE POLICY "Allow users to insert their own conversations"
ON public.conversations
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.classes
    WHERE classes.id = class_id AND classes.user_id = auth.uid()
  )
);

-- Policy to allow users to read their own conversations
CREATE POLICY "Allow users to read their own conversations"
ON public.conversations
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.classes
    WHERE classes.id = class_id AND classes.user_id = auth.uid()
  )
);

-- Create index for faster queries
CREATE INDEX idx_conversations_class_id ON public.conversations(class_id);
CREATE INDEX idx_conversations_user_id ON public.conversations(user_id);
