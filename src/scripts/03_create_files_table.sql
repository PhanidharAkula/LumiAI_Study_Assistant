-- Files: uploaded documents belonging to a class.
-- Idempotent: safe to re-run (IF NOT EXISTS + drop-then-create policy).
CREATE TABLE IF NOT EXISTS public.files (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  size INTEGER NOT NULL,
  type TEXT NOT NULL,
  path TEXT NOT NULL,
  class_id UUID NOT NULL REFERENCES public.classes(id),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_files_class_id ON public.files(class_id);
CREATE INDEX IF NOT EXISTS idx_files_user_id ON public.files(user_id);

-- Set up Row Level Security
ALTER TABLE public.files ENABLE ROW LEVEL SECURITY;

-- Create policy for user access
DROP POLICY IF EXISTS "Users can manage their own files" ON public.files;
CREATE POLICY "Users can manage their own files"
ON public.files
FOR ALL
USING (user_id = auth.uid());
