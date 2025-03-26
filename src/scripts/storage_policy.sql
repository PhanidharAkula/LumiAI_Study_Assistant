-- Create stored procedure for setting up storage policies
CREATE OR REPLACE FUNCTION public.create_storage_policy(bucket_name text)
RETURNS void AS $$
BEGIN
  -- Create policy for reading files (public access)
  EXECUTE format('
    CREATE POLICY IF NOT EXISTS "Public Read Access" 
    ON storage.objects 
    FOR SELECT 
    USING (bucket_id = %L)', bucket_name);

  -- Create policy for inserting files (authenticated users)
  EXECUTE format('
    CREATE POLICY IF NOT EXISTS "Authenticated Insert Access" 
    ON storage.objects 
    FOR INSERT 
    WITH CHECK (bucket_id = %L AND auth.role() = ''authenticated'')', bucket_name);

  -- Create policy for updating files (file owners)
  -- Note the correction in the type comparison: auth.uid() = owner::uuid
  EXECUTE format('
    CREATE POLICY IF NOT EXISTS "Owner Update Access" 
    ON storage.objects 
    FOR UPDATE 
    USING (bucket_id = %L AND auth.uid() = owner::uuid)', bucket_name);

  -- Create policy for deleting files (file owners)
  -- Note the correction in the type comparison: auth.uid() = owner::uuid
  EXECUTE format('
    CREATE POLICY IF NOT EXISTS "Owner Delete Access"
    ON storage.objects 
    FOR DELETE 
    USING (bucket_id = %L AND auth.uid() = owner::uuid)', bucket_name);
  
  RAISE NOTICE 'Storage policies created successfully for bucket: %', bucket_name;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execution permission to authenticated users
GRANT EXECUTE ON FUNCTION public.create_storage_policy(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_storage_policy(text) TO anon;
