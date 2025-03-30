-- Create storage policies for the files bucket
INSERT INTO storage.buckets (id, name, public) 
VALUES ('files', 'files', false)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload files
CREATE POLICY "Allow authenticated users to upload files"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'files');

-- Allow authenticated users to read files
CREATE POLICY "Allow authenticated users to read files"
ON storage.objects
FOR SELECT
TO authenticated
USING (bucket_id = 'files');

-- Allow users to update their own files
CREATE POLICY "Allow users to update their own files"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'files'
  AND EXISTS (
    SELECT 1 FROM public.files
    WHERE storage.objects.name = path
    AND user_id = auth.uid()
  )
);

-- Allow users to delete their own files
CREATE POLICY "Allow users to delete their own files"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'files'
  AND EXISTS (
    SELECT 1 FROM public.files
    WHERE storage.objects.name = path
    AND user_id = auth.uid()
  )
);
