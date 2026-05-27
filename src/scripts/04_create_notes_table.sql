-- Notes: user notes, optionally attached to a class.
-- Idempotent: safe to re-run (IF NOT EXISTS + drop-then-create policy).
CREATE TABLE IF NOT EXISTS public.notes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  class_id UUID REFERENCES public.classes(id),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  tags TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_notes_user_id ON public.notes(user_id);
CREATE INDEX IF NOT EXISTS idx_notes_class_id ON public.notes(class_id);

-- Set up Row Level Security
ALTER TABLE public.notes ENABLE ROW LEVEL SECURITY;

-- Create policy for user access
DROP POLICY IF EXISTS "Users can manage their own notes" ON public.notes;
CREATE POLICY "Users can manage their own notes"
ON public.notes
FOR ALL
USING (user_id = auth.uid());
