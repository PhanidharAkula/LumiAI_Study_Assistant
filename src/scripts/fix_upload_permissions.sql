-- IMPORTANT: Run this in your Supabase SQL Editor

-- Option 1: Temporarily disable RLS for testing
ALTER TABLE public.files DISABLE ROW LEVEL SECURITY;

-- Option 2: If you prefer to keep RLS but make it permissive:
-- DROP POLICY IF EXISTS "Allow all operations for authenticated users" ON public.files;
-- CREATE POLICY "Allow all operations for authenticated users"
-- ON public.files
-- FOR ALL
-- TO authenticated
-- USING (true)
-- WITH CHECK (true);

-- Check for user_id column and add it if missing
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                WHERE table_schema = 'public' 
                AND table_name = 'files'
                AND column_name = 'user_id') THEN
    ALTER TABLE public.files ADD COLUMN user_id UUID REFERENCES auth.users(id);
  END IF;
END $$;

-- Update any existing files to have the user_id from their class
UPDATE public.files
SET user_id = classes.user_id
FROM public.classes
WHERE files.class_id = classes.id
AND files.user_id IS NULL;
