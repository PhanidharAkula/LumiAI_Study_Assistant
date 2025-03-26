-- COMPLETE POLICIES FOR SUPABASE SETUP

-- 1. STORAGE BUCKET CREATION (if not exists)
DO $$
DECLARE
  bucket_exists BOOLEAN;
BEGIN
  SELECT EXISTS(
    SELECT 1 FROM storage.buckets WHERE name = 'files'
  ) INTO bucket_exists;
  
  IF NOT bucket_exists THEN
    INSERT INTO storage.buckets (id, name, public, avif_autodetection)
    VALUES ('files', 'files', true, false);
    RAISE NOTICE 'Created files bucket';
  ELSE
    RAISE NOTICE 'Files bucket already exists';
  END IF;
END $$;

-- 2. STORAGE BUCKET POLICIES
-- Clear any existing policies
DROP POLICY IF EXISTS "Public Read Access" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated Insert Access" ON storage.objects;
DROP POLICY IF EXISTS "Owner Update Access" ON storage.objects;
DROP POLICY IF EXISTS "Owner Delete Access" ON storage.objects;

-- Public read access - allow anyone to read files
CREATE POLICY "Public Read Access" ON storage.objects
  FOR SELECT USING (bucket_id = 'files');

-- Authenticated users can upload files
CREATE POLICY "Authenticated Insert Access" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'files' AND auth.role() = 'authenticated');

-- Users can update their own files
CREATE POLICY "Owner Update Access" ON storage.objects
  FOR UPDATE USING (bucket_id = 'files' AND auth.uid() = owner::uuid);

-- Users can delete their own files
CREATE POLICY "Owner Delete Access" ON storage.objects
  FOR DELETE USING (bucket_id = 'files' AND auth.uid() = owner::uuid);

-- 3. DATABASE TABLE POLICIES
-- Make sure RLS is enabled
ALTER TABLE public.files ENABLE ROW LEVEL SECURITY;

-- Clear any existing policies
DROP POLICY IF EXISTS "Allow authenticated users to insert their own files" ON public.files;
DROP POLICY IF EXISTS "Allow users to read their own files" ON public.files;
DROP POLICY IF EXISTS "Allow users to update their own files" ON public.files;
DROP POLICY IF EXISTS "Allow users to delete their own files" ON public.files;

-- Add user_id column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                WHERE table_schema = 'public' 
                AND table_name = 'files'
                AND column_name = 'user_id') THEN
    ALTER TABLE public.files ADD COLUMN user_id UUID REFERENCES auth.users(id);
    RAISE NOTICE 'Added user_id column to files table';
  END IF;
END $$;

-- Create policy for users to insert files
CREATE POLICY "Allow authenticated users to insert files"
ON public.files
FOR INSERT
TO authenticated
WITH CHECK (true);

-- Create policy for users to read their own files
CREATE POLICY "Allow users to read files"
ON public.files
FOR SELECT
TO authenticated
USING (true);

-- Create policy for users to update their own files
CREATE POLICY "Allow users to update files"
ON public.files
FOR UPDATE
TO authenticated
USING (true);

-- Create policy for users to delete their own files
CREATE POLICY "Allow users to delete files"
ON public.files
FOR DELETE
TO authenticated
USING (true);

-- 4. EMERGENCY FIX FOR DEVELOPMENT - comment out in production
-- This disables RLS on files table for easier development
ALTER TABLE public.files DISABLE ROW LEVEL SECURITY;
