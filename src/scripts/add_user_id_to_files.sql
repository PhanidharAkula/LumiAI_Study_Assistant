-- Add user_id column to files table
ALTER TABLE public.files ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);

-- Update existing records (if any)
UPDATE public.files
SET user_id = classes.user_id
FROM public.classes
WHERE files.class_id = classes.id;

-- Create a simpler policy based on direct user_id check
DROP POLICY IF EXISTS "Allow authenticated users to insert their own files" ON public.files;
CREATE POLICY "Allow insert for authenticated" 
ON public.files
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);
