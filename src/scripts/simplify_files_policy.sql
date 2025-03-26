-- First drop the existing policies
DROP POLICY IF EXISTS "Allow authenticated users to insert their own files" ON public.files;
DROP POLICY IF EXISTS "Allow users to read their own files" ON public.files;
DROP POLICY IF EXISTS "Allow users to update their own files" ON public.files;
DROP POLICY IF EXISTS "Allow users to delete their own files" ON public.files;

-- Create a simplified policy for testing
CREATE POLICY "Allow all operations for authenticated users"
ON public.files
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

-- Alternatively, you can temporarily disable RLS on the files table
-- ALTER TABLE public.files DISABLE ROW LEVEL SECURITY;
