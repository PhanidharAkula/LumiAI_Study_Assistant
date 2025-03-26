-- Enable RLS on files table
ALTER TABLE public.files ENABLE ROW LEVEL SECURITY;

-- Create policy for authenticated users to insert their own files
CREATE POLICY "Allow authenticated users to insert their own files"
ON public.files
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.classes
    WHERE classes.id = class_id AND classes.user_id = auth.uid()
  )
);

-- Create policy to allow users to read their own files
CREATE POLICY "Allow users to read their own files"
ON public.files
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.classes
    WHERE classes.id = class_id AND classes.user_id = auth.uid()
  )
);

-- Create policy to allow users to update their own files
CREATE POLICY "Allow users to update their own files"
ON public.files
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.classes
    WHERE classes.id = class_id AND classes.user_id = auth.uid()
  )
);

-- Create policy to allow users to delete their own files
CREATE POLICY "Allow users to delete their own files"
ON public.files
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.classes
    WHERE classes.id = class_id AND classes.user_id = auth.uid()
  )
);
